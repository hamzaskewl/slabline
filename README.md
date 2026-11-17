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

## Relay quote previews

Relay quote previews are available on `/wallet` after login and wallet verification. `RELAY_API_KEY` belongs in server secrets. The server calls `/quote/v2` and `/intents/status/v3`, saves account-owned previews in Postgres, and expires reviews after 30 seconds. Supported routes are Ethereum/Base native USDC to Solana mainnet native USDC, and test ETH between Sepolia and Base Sepolia. Solana devnet is not currently listed by Relay's testnet API. Provider-reported status is never confirmation of received funds. `ENABLE_RELAY` cannot release execution: no signing/broadcast endpoint or client transaction payload is exposed. Gas sponsorship, permits and deposit-address flows remain off. Quotes do not withdraw Gemini funds. See [Relay API keys](https://docs.relay.link/references/api/api-keys) and [testnet support](https://docs.relay.link/references/api/api_guides/testnet).

## Collector Crypt devnet tests

Collector Crypt devnet tools are under About → Transaction tools. Listings use the devnet API; unsigned buyer-paid Core purchases use the program-owned Anchor IDL and are independently inspected and simulated. Core ownership confirmation reads the asset account on the checked devnet RPC. Signing/broadcast requires both `ENABLE_CC_DEVNET_TESTS=true` and an exact `CC_DEVNET_TEST_WALLET` allowlist match; leave these off until a funded wallet test is approved. Gas sponsorship and mainnet purchases remain off. The test-USDC mint is `Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr`, not Circle's devnet USDC. Simulation success does not mean a card was bought. Submissions retain the exact signed transaction and signature for reconciliation and at most one explicit retry of those same bytes; a new purchase is blocked while an earlier submission is unresolved.

## Checkpoints

Every major implementation step is a branch and pull request, checked before merge. GitHub Actions runs type checking, tests and a production build.

Identity configuration: [docs/IDENTITY_SETUP.md](docs/IDENTITY_SETUP.md). Integration evidence and exact blockers: [docs/INTEGRATION_VERIFICATION.md](docs/INTEGRATION_VERIFICATION.md). Railway settings: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Security boundaries: [docs/SECURITY.md](docs/SECURITY.md).

The app remains useful without credentials. It reports provider outages and unknown FMV/fees rather than inventing data. Practice is a named fixture selected explicitly, never an automatic live-data fallback.
