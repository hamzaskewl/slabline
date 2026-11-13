import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
export * from './schema';
export { eq, and, gt, isNull, sql } from 'drizzle-orm';
let connection: ReturnType<typeof postgres> | undefined;
export function getDb() {
  if(!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for persistent operations');
  connection ??= postgres(process.env.DATABASE_URL,{max:5,idle_timeout:20,connect_timeout:10});
  return drizzle(connection,{schema});
}
