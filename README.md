# Slabline

UBC 2026 hackathon prototype. Source of truth: [ARCHITECTURE.md](ARCHITECTURE.md).

Public market discovery, Gemini WebSocket books through SSE, exact depth estimates, slab images and Grail vault data are implemented. Settings selects Mainnet or Devnet. Devnet has an authenticated, persistent $100 demo ledger, top-ups, paper positions, official-result settlement and a repeatable recorded-book replay. Collectibles use user-signed Metaplex Core creation on Solana devnet. Mainnet Gemini execution and funding remain gated.

## Pull & Predict

The Predict menu opens a separate `/pull-predict` workspace. $25, $50, $100 and $200 packs award a position-buying budget with 62% odds of 0.6×, 28% of 1.2×, 6.4% of 2× and 3.6% of 4×. Expected budget is 98% of price: a 2% gross opening edge before costs. Users search teams, players or all markets, then choose a market and outcome after the reveal. A fresh depth quote precedes redemption; positions use the existing demo portfolio and any unused budget returns to demo cash.

Run database migrations before enabling this flow. Purchase keys, account locks and persistent opening records protect against duplicate debits and redemption. Mainnet purchases remain disabled. The default `PULL_RANDOMNESS=demo-csprng` is explicitly labeled server-generated practice randomness, not onchain VRF.

For MagicBlock on Solana devnet, deploy the consumer in `programs/pull-randomness`, configure `PULL_MAGICBLOCK_PROGRAM_ID`, and set `PULL_RANDOMNESS=magicblock-devnet`. MagicBlock's VRF program is `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz`; its devnet queue is `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh`. The consumer binds each request to a payer and saved seed, accepts only the scoped MagicBlock callback signer, and records one immutable result. The app independently reads finalized receipts before awarding a budget. A deployment ID and successful request/fulfillment receipt are necessary evidence before describing this mode as deployed or verified. Setup and verification status: [MagicBlock randomness](docs/PULL_RANDOMNESS.md). Product specification: [Pull & Predict](docs/PULL_PREDICT_SPEC.md).

## Development

Position shares use the existing Privy and PostgreSQL configuration. Run `bun run db:migrate` before using sharing (migration 0004), and set `APP_URL` to the web origin. The share icon beside a position value opens a private PNG preview. Copy link and platform actions publish an immutable snapshot at `/share/[token]`; its image route serves the exact prepared PNG. Opening the dialog or copying/downloading its image does not publish a link.

Explicit slab selections retain provider metadata; confirmed collectible receipts are separate from trade resolution. The renderer uses bundled Inter and allowlisted provider images. Private previews expire after one hour; public snapshots retain their PNG and minimal metadata. Anonymous public snapshots contain no name, wallet label, avatar or owner ID. Missing fees and ambiguous cost basis remain unavailable. Native image sharing and clipboard support depend on the browser; download and public-link fallbacks remain available.

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

## Account reads

Mainnet Wallet and Portfolio use authenticated Gemini connection readiness. Approval and granted read scopes are checked before private SDK calls. Devnet uses a separate demo ledger; replay positions can be completed explicitly, while normal paper positions settle only on Gemini's published resolution. Wallet reads and proofs are scoped to the selected Solana network.

Verified Solana wallets show separate SOL/native USDC balances. USDC defaults to Circle's native mint for the active network; mismatched overrides are rejected. Collection uses budgeted DAS reads, 24 assets per page, a 60-second server cache and an observed timestamp. Indexer failures remain errors rather than empty-wallet claims. Collection metadata is wallet inventory, not evidence of physical redemption eligibility. Private client queries are scoped to the signed-in user and cleared when unused.

## Checkpoints

Every major implementation step is a branch and pull request, checked before merge. GitHub Actions runs type checking, tests and a production build.

Identity configuration: [docs/IDENTITY_SETUP.md](docs/IDENTITY_SETUP.md). Integration evidence and exact blockers: [docs/INTEGRATION_VERIFICATION.md](docs/INTEGRATION_VERIFICATION.md). Railway settings: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Security boundaries: [docs/SECURITY.md](docs/SECURITY.md).

The app remains useful without credentials. It reports provider outages and unknown FMV/fees rather than inventing data. The `/demo` replay is selected explicitly and uses a recorded Gemini book plus an archived card image; it never becomes a fallback for live execution.
