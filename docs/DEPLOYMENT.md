# Railway deployment settings

Railway MCP rejected legacy railway.json on 2026-11-12 because Config as Code is deprecated. Settings below are applied directly through Railway MCP, with separate services from the same repository root. No application Dockerfile.

| Service  | Build                                            | Start                  | Health        | Before deploy         |
| -------- | ------------------------------------------------ | ---------------------- | ------------- | --------------------- |
| web      | `bun install --frozen-lockfile && bun run build` | `bun run start:web`    | `/api/health` | none                  |
| worker   | `bun install --frozen-lockfile`                  | `bun run start:worker` | `/health`     | `bun run db:migrate`  |
| Postgres | Railway PostgreSQL template                      | managed                | managed       | generated credentials |

Both services use repository root `/`. Worker listens on 4001. Web uses `WORKER_URL=http://worker.railway.internal:4001`. `DATABASE_URL` references `${{Postgres.DATABASE_URL}}`. Web listens on Railway's PORT (set to 3000 here). All financial actions default disabled. Public catalog network and wallet devnet are configured independently.

Project: https://railway.com/project/c0c6d10f-953f-48a5-bed9-1893dcc17cb8

Only the web service needs a public domain. The worker's catalog and SSE use private networking; webhook ingress will be proxied through web and authenticated before queueing.

## Slabline domain

The canonical public origin is `https://slabline.xyz`. Set web `APP_URL` to that
origin so API origin checks, share links, metadata URLs and wallet proof messages
use the public domain. `www.slabline.xyz` and the original
`web-production-ae51051f.up.railway.app` redirect to the canonical origin,
preserving paths and query strings. Existing browser sessions may require a new
login on the new origin.

Namecheap BasicDNS routes `@` with an ALIAS record to
`9zf9hj9g.up.railway.app` and `www` with a CNAME record to
`k2o59jpk.up.railway.app`. Each hostname also needs its Railway-provided
`_railway-verify` TXT record. Railway manages HTTPS certificates.

Add `https://slabline.xyz` to the matching Privy app's allowed origins before
testing login. Gemini OAuth must register the exact redirect
`https://slabline.xyz/api/gemini/callback` before enabling the connection;
production approval remains a separate requirement. Internal worker and database
URLs and server API keys do not change with the public domain.
