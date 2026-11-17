# Collectible Markets

UBC 2026 hackathon prototype. Source of truth: [ARCHITECTURE.md](ARCHITECTURE.md).

Public market discovery, Gemini WebSocket books through SSE, exact depth estimates, actual slab catalog images, separate Phygitals packs, cart planning and explicitly simulated positions are implemented. The dark discovery interface follows the user's Gemini/Polymarket references. No end-to-end live purchase or funding is claimed.

## Development

Requires Bun 1.3.11+, Node 22+ (Next.js tooling), and PostgreSQL for persistence.

```sh
bun install
cp .env.example .env
bun run db:migrate # after setting DATABASE_URL
bun run dev
bun run check
bun test
bun run build
```

Web: http://localhost:3000. Worker: http://localhost:4001. Credentials belong in local ignored environment files or Railway service secrets; never paste them into chat or commit them.

## QuickNode credit cutoff

Web and worker share a PostgreSQL credit ledger. Configure the same `QUICKNODE_BUDGET_*`, `QUICKNODE_INCLUDED_CREDITS`, `QUICKNODE_CREDIT_CUTOFF` and `QUICKNODE_BASELINE_CREDITS` on both services for a verified billing period. The cutoff cannot exceed 75% of included credits. Reserve prior account usage in the baseline; budget IDs must never be rotated to replenish an existing period. Run migrations before enabling the provider endpoints.

Every allowed RPC call reserves 1,000 credits before contacting QuickNode, including each batch member, retry and failed request. This deliberately exceeds the published costs of the read-only methods used here. Unknown methods never reach QuickNode. Concurrent reservations are atomic and survive service restarts. Exhausted, missing, expired or unavailable budgets use public Solana/EVM RPC fallbacks; DAS ownership checks stop instead of claiming verification. New billing periods require verified settings; there is no automatic reset.

This controls this app's RPC usage, not other applications using the account. Keep provider-side request caps and leave headroom for dashboard tests and other consumers. Streams are independently metered per block and remain off until a bounded block allowance is reserved; these RPC settings do not cap an independently running Stream. See [QuickNode RPC costs](https://www.quicknode.com/api-credits/sol) and [Streams billing](https://www.quicknode.com/docs/streams/billing).

## Checkpoints

Every major implementation step is a branch and pull request, checked before merge. GitHub Actions runs type checking, tests and a production build.

Identity configuration: [docs/IDENTITY_SETUP.md](docs/IDENTITY_SETUP.md). Integration evidence and exact blockers: [docs/INTEGRATION_VERIFICATION.md](docs/INTEGRATION_VERIFICATION.md). Railway settings: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Security boundaries: [docs/SECURITY.md](docs/SECURITY.md).

The app remains useful without credentials. It reports provider outages and unknown FMV/fees rather than inventing data. Practice is a named fixture selected explicitly, never an automatic live-data fallback.
