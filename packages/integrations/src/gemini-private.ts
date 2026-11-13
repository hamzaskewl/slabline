import { OAuthAuth,createClient,type OAuthTokens } from '@gemini-markets/sdk/server';
import { getDb,linkedGeminiAccounts,eq,sql } from '@collectible/db';
import { encryptSecret,decryptSecret } from './security';
import { IntegrationBlocked } from '@collectible/domain';

function encryptionKey(){if(!process.env.TOKEN_ENCRYPTION_KEY)throw new IntegrationBlocked('Gemini','TOKEN_ENCRYPTION_KEY is not configured');return process.env.TOKEN_ENCRYPTION_KEY;}
export function geminiOAuth(userId?:string) {
  const clientId=process.env.GEMINI_OAUTH_CLIENT_ID,clientSecret=process.env.GEMINI_OAUTH_CLIENT_SECRET;
  if(!clientId||!clientSecret)throw new IntegrationBlocked('Gemini','OAuth client credentials are not configured');
  const env=process.env.GEMINI_ENVIRONMENT==='sandbox'?'sandbox':'production';
  if(env==='production'&&process.env.GEMINI_OAUTH_PRODUCTION_APPROVED!=='true')throw new IntegrationBlocked('Gemini','Production OAuth app review has not been verified');
  const db=getDb();
  async function load(){if(!userId)return undefined;const [row]=await db.select().from(linkedGeminiAccounts).where(eq(linkedGeminiAccounts.userId,userId)).limit(1);return row?JSON.parse(decryptSecret(row.encryptedRefreshToken,encryptionKey())) as OAuthTokens:undefined;}
  return new OAuthAuth({env,client:{type:'confidential',clientId,clientSecret,redirectUri:`${process.env.APP_URL??'http://localhost:3000'}/api/gemini/callback`},...(userId?{tokenStore:{load,async save(tokens:OAuthTokens){const sealed=encryptSecret(JSON.stringify(tokens),encryptionKey());await db.insert(linkedGeminiAccounts).values({userId,encryptedRefreshToken:sealed,scopes:tokens.scope.split(',')}).onConflictDoUpdate({target:linkedGeminiAccounts.userId,set:{encryptedRefreshToken:sealed,scopes:tokens.scope.split(',')}});},async clear(){await db.delete(linkedGeminiAccounts).where(eq(linkedGeminiAccounts.userId,userId));},async clearIfCurrent(refreshToken:string){const current=await load();if(current?.refreshToken!==refreshToken)return false;await db.delete(linkedGeminiAccounts).where(eq(linkedGeminiAccounts.userId,userId));return true;},async runExclusive<T>(operation:()=>Promise<T>):Promise<T>{return db.transaction(async tx=>{await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);return operation();});}}}:{})});
}
export async function getGeminiAccountSnapshot(userId:string){const auth=geminiOAuth(userId);const client=await createClient({env:process.env.GEMINI_ENVIRONMENT==='sandbox'?'sandbox':'production',auth,skipWsInit:true,timeoutMs:12000});try{const [balances,positions]=await Promise.all([client.account.getAvailableBalances({account:'primary'}),client.predictions.getPositions()]);return {balances,positions,observedAt:new Date().toISOString()};}finally{client.close();}}
