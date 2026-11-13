import { z } from 'zod';
import type { Listing, Pack, ProviderResult } from '@collectible/domain';
import { safeImage } from './gemini';
import { getDb, providerCache, eq } from '@collectible/db';

const cache = new Map<string,{value:unknown;expires:number}>();
const inFlight=new Map<string,Promise<unknown>>();
export async function cached<T>(key:string,ttl:number,load:()=>Promise<T>):Promise<T> {
  const hit=cache.get(key); if(hit && hit.expires>Date.now()) return hit.value as T;
  const pending=inFlight.get(key); if(pending) return pending as Promise<T>;
  const run=(async()=>{
    if(process.env.DATABASE_URL) { try { const [row]=await getDb().select().from(providerCache).where(eq(providerCache.key,key)).limit(1); if(row && row.expiresAt.getTime()>Date.now()) { cache.set(key,{value:row.data,expires:row.expiresAt.getTime()}); return row.data as T; } } catch { console.warn('Persistent provider cache unavailable'); } }
    const value=await load(), expires=Date.now()+ttl;
    cache.set(key,{value,expires});
    if(cache.size>200) cache.delete(cache.keys().next().value!);
    if(process.env.DATABASE_URL) { try { await getDb().insert(providerCache).values({key,data:value,expiresAt:new Date(expires)}).onConflictDoUpdate({target:providerCache.key,set:{data:value,expiresAt:new Date(expires),updatedAt:new Date()}}); } catch { console.warn('Provider cache write unavailable'); } }
    return value;
  })();
  inFlight.set(key,run); try { return await run; } finally { inFlight.delete(key); }
}
export async function providerRead<T>(read:()=>Promise<T>,empty:T):Promise<ProviderResult<T>> {try {return {data:await read(),source:'live',observedAt:new Date().toISOString(),error:null};} catch {return {data:empty,source:'unavailable',observedAt:new Date().toISOString(),error:'Provider is unavailable or returned an unsupported response. Retry shortly.'};}}
async function json(url:string) { const response=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}}); if(!response.ok) throw new Error(`Provider HTTP ${response.status}`); return response.json() as Promise<unknown>; }
const rawCard=z.object({id:z.string(),nftAddress:z.string(),itemName:z.string(),category:z.string().nullable().optional(),grade:z.union([z.string(),z.number()]).nullable().optional(),gradingCompany:z.string().nullable().optional(),gradingID:z.string().nullable().optional(),frontImage:z.string().nullable().optional(),backImage:z.string().nullable().optional(),images:z.object({frontM:z.string().optional(),frontS:z.string().optional(),backS:z.string().optional()}).optional(),year:z.union([z.string(),z.number()]).nullable().optional(),set:z.string().nullable().optional(),listing:z.object({price:z.union([z.string(),z.number()]),currency:z.string(),marketplace:z.string().optional()}).nullable(),owner:z.object({wallet:z.string().nullable().optional()}).nullable().optional()});
export async function listCards(search=''):Promise<Listing[]> {
  const network=process.env.COLLECTOR_CRYPT_NETWORK==='devnet'?'devnet':'mainnet';
  return cached(`cards:v2:${network}:${search}`,60000,async()=>{
    const base=network==='devnet'?'https://dev-api.collectorcrypt.com':'https://api.collectorcrypt.com';
    const params=new URLSearchParams({step:'100',marketplaceSource:'CC',orderBy:'listedPriceAsc',listPriceMin:'5',listPriceMax:'1000',...(search?{search}:{})});
    const data=z.object({filterNFtCard:z.array(rawCard)}).parse(await json(`${base}/marketplace?${params}`));
    return data.filterNFtCard.filter(c=>c.listing?.currency==='USDC' && c.grade && c.gradingCompany && /^(PSA|BGS|CGC|SGC|TAG|CSG|ACE)$/i.test(c.gradingCompany)).map(c=>({id:c.id,mint:c.nftAddress,name:c.itemName,category:c.category??'Collectible',player:null,grade:String(c.grade),grader:c.gradingCompany??null,cert:c.gradingID??null,year:c.year?String(c.year):null,set:c.set??null,frontImage:safeImage(c.frontImage)??safeImage(c.images?.frontM)??safeImage(c.images?.frontS),backImage:safeImage(c.backImage)??safeImage(c.images?.backS),ask:String(c.listing!.price),currency:'USDC' as const,seller:c.owner?.wallet??null,network,source:'collectorcrypt' as const,observedAt:new Date().toISOString(),valuation:null}));
  });
}
export async function listPacks():Promise<Pack[]> {
  return cached('phygitals:packs:v1',300000,async()=>{
    const rows=z.array(z.object({id:z.string(),slug:z.string(),name:z.string(),mint_price:z.union([z.string(),z.number()]),in_stock:z.boolean(),image:z.string().nullable().optional(),image_url:z.string().nullable().optional()})).parse(await json('https://api.phygitals.com/api/vm/available?platform=mainnet&excludeVariants=true'));
    return rows.map(r=>({id:r.id,slug:r.slug,name:r.name,price:String(r.mint_price),inStock:r.in_stock,image:safeImage(r.image_url??r.image),source:'phygitals' as const,network:'mainnet' as const}));
  });
}
