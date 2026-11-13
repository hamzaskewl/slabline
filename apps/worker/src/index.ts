import { geminiClient, listMarkets, listCards, listPacks, cached, providerRead } from '@collectible/integrations';
import type { Book, Market } from '@collectible/domain';
import { getDb, marketSnapshots } from '@collectible/db';

type Session={book:Book|null;lastAccess:number;close:()=>void};
const books=new Map<string,Session>();
let knownMarkets:Market[]=[];
const allContracts=(items:Market[]):Market['contracts']=>items.flatMap(m=>[...m.contracts,...allContracts(m.children)]);
async function markets(search='') {const data=await cached(`gemini:markets:${search}`,30000,()=>listMarkets(search)); knownMarkets=data;return data;}
async function subscribe(symbol:string) {
  const existing=books.get(symbol);if(existing){existing.lastAccess=Date.now();return existing;}
  if(books.size>=40)throw new Error('Maximum active books reached');
  if(!knownMarkets.length) await markets();
  const contract=allContracts(knownMarkets).find(c=>c.symbol===symbol);
  if(!contract) throw new Error('Symbol is not in the public active catalog');
  if(!contract.quantityIncrement || !contract.priceIncrement) throw new Error('Instrument increments unavailable');
  const client=await geminiClient(); const book=client.orderBook(symbol);
  const session:Session={book:null,lastAccess:Date.now(),close:()=>book.close()};books.set(symbol,session);
  book.on('update',(lob)=>{session.book={symbol,bids:lob.topN('bids',100).map(l=>({price:l.price,quantity:l.qty})),asks:lob.topN('asks',100).map(l=>({price:l.price,quantity:l.qty})),updatedAt:new Date().toISOString(),stale:false,source:'gemini',quantityIncrement:contract.quantityIncrement!,priceIncrement:contract.priceIncrement!};});
  const stale=()=>{if(session.book)session.book={...session.book,stale:true};};book.on('resync',stale);book.on('error',stale);
  return session;
}
setInterval(()=>{for(const [symbol,session] of books) if(Date.now()-session.lastAccess>90000){session.close();books.delete(symbol);}},30000);
setInterval(async()=>{if(!process.env.DATABASE_URL)return;for(const session of books.values()){if(!session.book||session.book.stale)continue;try{await getDb().insert(marketSnapshots).values({symbol:session.book.symbol,data:session.book});}catch{console.warn('Snapshot persistence unavailable');}}},60000);

const server=Bun.serve({port:Number(process.env.PORT??4001),hostname:'0.0.0.0',idleTimeout:60,async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/health')return Response.json({status:'ok',service:'worker',activeBooks:books.size,mode:process.env.DEMO_MODE??'simulated'});
  if(url.pathname==='/markets')return Response.json(await providerRead(()=>markets(url.searchParams.get('search')?.slice(0,100)??''),[]));
  if(url.pathname==='/cards')return Response.json(await providerRead(()=>listCards(url.searchParams.get('search')?.slice(0,100)??''),[]));
  if(url.pathname==='/packs')return Response.json(await providerRead(listPacks,[]));
  if(url.pathname==='/book') {try{const session=await subscribe(url.searchParams.get('symbol')??'');return Response.json({book:session.book,error:session.book?null:'Waiting for Gemini book snapshot'});}catch{return Response.json({book:null,error:'Book unavailable. Check symbol and provider connection.'},{status:503});}}
  if(url.pathname==='/events') {
    let timer:ReturnType<typeof setInterval>|undefined;
    const symbol=url.searchParams.get('symbol')??'';
    let session:Session;try{session=await subscribe(symbol);}catch{return new Response('Book unavailable',{status:503});}
    const encoder=new TextEncoder();
    const stream=new ReadableStream<Uint8Array>({start(controller){
      const send=()=>{session.lastAccess=Date.now();try{controller.enqueue(encoder.encode(`data: ${JSON.stringify({book:session.book,error:session.book?null:'Waiting for Gemini snapshot'})}\n\n`));}catch{if(timer)clearInterval(timer);}};
      send();timer=setInterval(send,1000);request.signal.addEventListener('abort',()=>{if(timer)clearInterval(timer);try{controller.close();}catch{}},{once:true});
    },cancel(){if(timer)clearInterval(timer);}});
    return new Response(stream,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
  }
  return new Response('Not found',{status:404});
}});
console.log(`Collectible Markets worker listening on ${server.port}; no financial jobs enabled`);
process.on('SIGTERM',()=>{for(const session of books.values())session.close();server.stop();process.exit(0);});
