import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { fileURLToPath } from 'node:url';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required; no schema changes applied');
const client=postgres(process.env.DATABASE_URL,{max:1});
try { await migrate(drizzle(client),{migrationsFolder:fileURLToPath(new URL('../migrations',import.meta.url))}); console.log('Database migrations complete'); } finally { await client.end(); }
