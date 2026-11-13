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
