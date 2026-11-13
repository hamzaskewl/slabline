import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import type { Market, Listing, Pack, ProviderResult } from '@collectible/domain';
const t=initTRPC.create();
export async function workerRead<T>(path:string):Promise<T> {const origin=process.env.WORKER_URL??'http://localhost:4001'; const response=await fetch(`${origin}${path}`,{signal:AbortSignal.timeout(20000),cache:'no-store'});if(!response.ok)throw new Error('Data worker unavailable');return response.json() as Promise<T>;}
async function safe<T>(path:string,empty:T):Promise<ProviderResult<T>> {try{return await workerRead<ProviderResult<T>>(path);}catch{return {data:empty,source:'unavailable',observedAt:new Date().toISOString(),error:'Data worker is unavailable. Please retry.'};}}
export const appRouter=t.router({
  markets:t.procedure.input(z.object({search:z.string().max(100).default('')}).default({search:''})).query(({input})=>safe<Market[]>(`/markets?search=${encodeURIComponent(input.search)}`,[])),
  cards:t.procedure.input(z.object({search:z.string().max(100).default('')}).default({search:''})).query(({input})=>safe<Listing[]>(`/cards?search=${encodeURIComponent(input.search)}`,[])),
  packs:t.procedure.query(()=>safe<Pack[]>('/packs',[])),
  status:t.procedure.query(()=>({mode:process.env.DEMO_MODE??'simulated',solanaNetwork:process.env.SOLANA_NETWORK??'devnet',privyConfigured:!!process.env.NEXT_PUBLIC_PRIVY_APP_ID,liveTrading:false,purchases:false,funding:false})),
});
export type AppRouter=typeof appRouter;
