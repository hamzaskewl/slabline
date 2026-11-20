<p align="center">
  <img src="apps/web/public/brand/slabline-mark-blue.png" alt="Slabline" width="96" />
</p>

<h1 align="center">Slabline</h1>

<p align="center"><strong>Prediction markets for collectors.</strong></p>

<p align="center">
  <a href="https://slabline.xyz">Open Slabline</a> ·
  <a href="https://slabline.xyz/demo">Try the demo</a> ·
  <a href="https://slabline.xyz/pull-predict">Pull &amp; Predict</a> ·
  <a href="docs/DEMO.md">Demo walkthrough</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/UBC-2026-7cc8ff" alt="UBC 2026" />
  <img src="https://img.shields.io/badge/Gemini-Prediction_Markets-00dcfa" alt="Gemini Prediction Markets" />
  <img src="https://img.shields.io/badge/Solana-Devnet-9945ff" alt="Solana devnet" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178c6" alt="Strict TypeScript" />
  <img src="https://img.shields.io/badge/Runtime-Bun-14151a" alt="Bun runtime" />
</p>

Browse real Gemini markets, back a team or player, and see the graded cards an estimated winning payout could cover. Open a Pull & Predict pack to reveal a prediction budget, choose your outcome, and follow the position through your portfolio.

**An independent build for the UBC 2026 hackathon, focused on the Gemini Prediction Markets bounty.** Public market data and collectible catalogs are real. Trading and reward rehearsals use an account-backed demo ledger; Solana devnet supports wallet-signed collectibles and verifiable pack randomness. Mainnet Gemini execution, withdrawals, bridging, and collectible purchases remain gated.

`prediction-markets` `collectibles` `gemini` `solana` `magicblock` `consumer-apps` `indie-build`

## Contents

- [The problem](#the-problem)
- [The solution](#the-solution)
- [Demo](#demo)
- [Features](#features)
- [Hackathon tracks and integrations](#hackathon-tracks-and-integrations)
- [How it works](#how-it-works)
- [Pull & Predict](#pull--predict)
- [Solana programs and verification](#solana-programs-and-verification)
- [Tech stack](#tech-stack)
- [Quick start](#quick-start)
- [Project structure](#project-structure)
- [Security and execution boundaries](#security-and-execution-boundaries)
- [Documentation](#documentation)
- [Acknowledgments](#acknowledgments)

## The problem

Prediction markets show a price, a probability, and a possible payout. Collectors think about a particular player, a team, or the next card they want. Finding the relevant market, understanding executable depth, and comparing a possible win with actual card inventory usually means switching between unrelated tools.

A listing price also says little about fair market value, and seeing a card in a preview does not reserve it or guarantee delivery.

## The solution

Slabline connects market discovery with collectible discovery. Select an outcome and a stake to see the shares available at current depth, the estimated payout if correct, and matching graded cards. Browse to a specific card and explicitly set the stake needed to target it.

The app brings together Gemini's market catalog and live books, Collector Crypt's listings and slab images, Card Hedge valuations, and Grail's tokenized collectibles. Pull & Predict adds a pack-opening experience: reveal a budget first, then decide which prediction to make.

The current demo follows the full product journey with persistent practice positions, cash or collectible reward choices, shareable receipts, and recoverable Solana devnet actions. Actual cash balances, simulated balances, wallet assets, and physical-card eligibility remain separate.

## Demo

**[Open slabline.xyz](https://slabline.xyz)** on desktop or mobile. Public discovery works without signing in. Sign in and select **Devnet** in settings for the saved demo account; use **Top up** to add practice cash (the amount defaults to $100).

| Experience            | Try it                                                             | What it demonstrates                                                                             |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Live market discovery | [Markets](https://slabline.xyz)                                    | Real Gemini events, outcome artwork, search, live-game discovery, prices, and depth              |
| Prediction to slab    | [Wembanyama replay](https://slabline.xyz/demo?stake=39.90)         | A recorded $39.90 order buys 145 YES shares; a winning replay unlocks a $145 card reward preview |
| Prediction to Grail   | [Jensen replay](https://slabline.xyz/demo?scenario=grail&stake=25) | An illustrative $25 position pays $100 on a win and becomes a saved simulated JENSEN holding     |
| Pack opening          | [Pull & Predict](https://slabline.xyz/pull-predict)                | Pick a tier and theme, reveal a budget, then select and review a prediction                      |
| Holdings and rewards  | [Portfolio](https://slabline.xyz/portfolio)                        | Positions, partial sales, claims, collectibles, Grail holdings, and unplayed packs               |

For the recorded replay, use **Finish a replay** in settings to apply Yes, No, or Void to the saved position. Ordinary live-data paper positions settle against Gemini's published result. Replay outcomes are explicitly presenter-controlled.

A demo collectible is a Solana devnet representation, not the mainnet slab or a physical-card purchase. The Jensen rehearsal does not execute an EVM swap. See the [demo walkthrough](docs/DEMO.md) for the complete presentation flow.

## Features

| Feature                     | What is implemented                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Market discovery            | Active and resolved market search, categories, favorites, outcome artwork, featured matchups, and provider-reported live games with freshness checks |
| Live order books            | Gemini WebSocket books relayed through the worker and server-sent events, with reconnect handling                                                    |
| Exact trade estimates       | Integer-based depth walking, partial-fill estimates, quantity increments, winning payout, and explicit unknown-fee states                            |
| Collectible targets         | Relevant team/player listings, actual slab images, card filters, target-card stake calculation, and separately displayed Card Hedge FMV/comps        |
| Persistent practice trading | Account-backed $100 demo ledger, top-ups, position increases, weighted entries, partial sales, and settlement                                        |
| Pull & Predict              | Four pack tiers, published odds, team/player search, animated reveals, saved openings, and post-reveal market selection                              |
| Verifiable randomness       | A deployed native Rust consumer for MagicBlock VRF on Solana devnet, with independently checked finalized receipts                                   |
| Portfolio and rewards       | Open and settled positions, cash claims, collectible reward selection, simulated Grail holdings, wallet collection, and recoverable packs            |
| Position sharing            | Private PNG previews, copy/download actions, and explicitly published immutable share links with anonymous snapshots                                 |
| Identity and profiles       | Privy sign-in, embedded/external wallets, signed ownership proofs, and opt-in public profiles with username search                                   |
| Wallet reads                | Network-scoped SOL/native USDC balances and paginated Solana asset inventory                                                                         |
| Grail integration           | Public catalog and pool verification, direct Uniswap transaction preparation, recovery and reconciliation; live execution gated                      |
| Funding previews            | Authenticated Relay quote reviews for supported mainnet and testnet routes; execution disabled                                                       |
| Mobile experience           | Responsive layouts, bottom navigation, installable home-screen app metadata, and an offline launch message                                           |

Implementation and verification are tracked separately in [integration evidence](docs/INTEGRATION_VERIFICATION.md). A prepared transaction or successful simulation is not a completed purchase.

## Hackathon tracks and integrations

**Target bounty: Best Project built with Gemini Prediction Markets.** Slabline uses Gemini's official SDK for public event discovery, live order books, executable-depth previews, and published outcomes. The collectible matching and pack experience build directly on that data.

The [UBC hackathon guide](https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/edit?tab=t.0#heading=h.ykfx32xz9suf) lists Gemini as a sponsor bounty and accepts market-data and/or trading API integrations. It also requires one main track. The project aligns with **Consumer Applications** through its collector-facing experience and with **Best use of Solana** through devnet collectibles and VRF. These describe project fit; the confirmed bounty focus is Gemini, and this README does not record a completed Devpost entry.

| Integration               | Role in Slabline                                                     | Current boundary                                                                                                 |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Gemini Prediction Markets | Events, live books, depth estimates, and settlement data             | Public reads work; private reads require approved OAuth and scopes; live orders and withdrawals gated            |
| Collector Crypt           | Graded-card catalog, slab images, and devnet purchase tooling        | Catalog available; buyer-funded devnet purchase inspection/simulation implemented; signing is wallet-allowlisted |
| Card Hedge                | Fair market value estimates and comparable sales                     | Matched live data supported; missing matches remain unavailable                                                  |
| Grail / Uniswap           | Tokenized collectible discovery and direct pool trading flows        | Base v3 and Robinhood v4 adapters; mainnet execution gated                                                       |
| Solana / Metaplex Core    | User-owned devnet collectible representations and asset verification | Devnet assets do not redeem physical cards                                                                       |
| MagicBlock                | VRF requests and immutable onchain randomness receipts               | Consumer deployed and request/fulfillment verified on devnet                                                     |
| Privy                     | Google/email login, embedded wallets, external wallet connections    | Authenticated actions still require account and wallet ownership checks                                          |
| QuickNode                 | Budgeted RPC and DAS reads for chain state and inventory             | Streams remain disabled; RPC use is not a QuickNode Streams bounty claim                                         |
| Relay                     | Cross-chain funding quotes and provider status reads                 | Quote-only; no signing or broadcast endpoint                                                                     |
| Railway                   | Web service, worker, and managed PostgreSQL                          | Separate services with private worker networking                                                                 |

Phygitals read adapters also exist in the repository, but its packs are outside the current UI scope and purchases remain disabled.

## How it works

### From a prediction to a collectible

```mermaid
flowchart TD
    A[Browse real Gemini markets] --> B[Choose outcome and stake]
    B --> C[Walk current order-book depth]
    C --> D[Preview winning payout and matching collectibles]
    D --> E[Confirm a practice position]
    E --> F[Saved portfolio position]
    F --> G{Settlement result}
    G -->|Win| H[Available demo reward]
    G -->|Loss| I[Close with no payout]
    G -->|Void| J[Refund remaining position cost]
    H --> K[Claim demo cash]
    H --> L[Select collectible rewards]
    L --> M[Wallet-signed devnet collectible]
```

A binary winning share pays $1. Estimates use available depth rather than assuming the displayed price fills the entire order. Matching listings are previews; availability and price can change before checkout. Live Gemini USD, demo cash, Solana USDC, and EVM assets are distinct balances.

### Application architecture

```mermaid
flowchart LR
    U[Browser and connected wallets] --> W[Next.js web app and API]
    P[Privy identity] --> W
    G[Gemini public API and WebSocket] --> K[Bun worker]
    K -->|Catalog and SSE books| W
    C[Collector Crypt, Card Hedge, Grail] --> K
    W --> D[(PostgreSQL)]
    K --> D
    W --> R[Relay quote API]
    W --> S[Solana RPC and DAS]
    U -->|Signed devnet request| V[Pull receipt program]
    V --> B[MagicBlock VRF]
    B -->|Scoped callback| V
    W -->|Verify finalized receipt| V
```

The worker handles provider ingestion, live books, cached snapshots, and reconciliation. The web app handles authenticated routes, quote reviews, portfolio views, and user-approved wallet flows. Shared domain code owns exact arithmetic and state rules; PostgreSQL persists account state, openings, audit records, and transaction recovery data.

## Pull & Predict

<p align="center">
  <img src="apps/web/public/packs/pull-25.webp" alt="$25 Pull & Predict pack" width="22%" />
  <img src="apps/web/public/packs/pull-50.webp" alt="$50 Pull & Predict pack" width="22%" />
  <img src="apps/web/public/packs/pull-100.webp" alt="$100 Pull & Predict pack" width="22%" />
  <img src="apps/web/public/packs/pull-200.webp" alt="$200 Pull & Predict pack" width="22%" />
</p>

A pack awards a **budget for buying a prediction position**. The user chooses the market and side after the reveal. It does not award a guaranteed winning payout or a physical card.

| Pack price | 0.6× · 62% | 1.2× · 28% | 2× · 6.4% | 4× · 3.6% | Expected buying budget |
| ---------- | ---------- | ---------- | --------- | --------- | ---------------------- |
| $25        | $15        | $30        | $50       | $100      | $24.50                 |
| $50        | $30        | $60        | $100      | $200      | $49                    |
| $100       | $60        | $120       | $200      | $400      | $98                    |
| $200       | $120       | $240       | $400      | $800      | $196                   |

The expected buying budget is **98% of the pack price**, a **2% gross opening edge before costs**. Pack variance and prediction risk are separate; this is not a 98% investment return or principal protection. Purchases currently use demo cash.

1. Choose a tier and search for a team or player.
2. Review the odds and create a persistent opening with a single debit.
3. Request randomness through the configured mode and reveal the saved budget. Skip and reduced-motion options bypass the animation.
4. Open **Your packs** or resume from Portfolio to choose a matching market and outcome.
5. Review a fresh depth quote and redeem the budget once. Unspent remainder returns to demo cash; stale or unavailable quotes leave the award recoverable.

`PULL_RANDOMNESS=demo-csprng` uses explicitly labeled server-generated practice randomness. `magicblock-devnet` uses a wallet-signed Solana request and a verified MagicBlock receipt. The server does not silently substitute a practice draw for a failed VRF request.

See the [product specification](docs/PULL_PREDICT_SPEC.md) and [randomness setup](docs/PULL_RANDOMNESS.md).

## Solana programs and verification

| Program or account            | Devnet address                                 | Role                                                                                     |
| ----------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Slabline Pull receipt program | `H8FMsd2jGRQomPQ9iFEhNsYif3Uko1WBoFbsNognWRWx` | Native Rust consumer; binds a draw to its payer and seed and stores one immutable result |
| MagicBlock Solana VRF         | `Vrf1RNUjXmQGjmQrQLvJHs9SNkvDJEsRVFPkfSQUwGz`  | Verifies oracle randomness and invokes the scoped consumer callback                      |
| MagicBlock queue              | `Cuj97ggrhhidhbu39TijNVqE74xvKJ69gDervRUXAxGh` | Devnet queue used by the consumer's randomness requests                                  |

Metaplex Core (`CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d`) handles the wallet-signed creation of devnet collectible representations. The app also checks Core asset accounts when verifying ownership.

The app checks transaction success and finality, program ownership, payer, seed, fulfillment state, and receipt bytes before assigning the budget. Only MagicBlock's program-scoped callback signer can fulfill the receipt. The demo ledger and deployed program's upgrade authority remain part of the trust model.

**Verified November 19, 2026:** consumer deployment, a real wallet-signed request, finalized fulfillment, and a separate ledger-bound opening that debited $25 once, awarded $15, bought a $14.88 recorded-book position, and returned $0.12 to demo cash.

- [Consumer deployment](https://explorer.solana.com/tx/5z91AikWKxXhSxjJuyh5D3EWfqMNGx1DuGuYxE7tjo3rTFUFeqBvhgjso9UEPv3LjeXX1MGntSUXnJUZqmFWLzsd?cluster=devnet)
- [Wallet-signed request](https://explorer.solana.com/tx/3UDESGSfvnrc4oA4vFv1E2WuN74imaDMrpuYzNnLhRNhK8WbJfQk8iUcMW294cuSdFUUwFEuUaoicvoLLLRYY4Rk?cluster=devnet)
- [Fulfilled receipt](https://explorer.solana.com/address/3vZvxg4vQcJqsygDD2nE4nSGCHCEr6c1tZcEMypkzQJc?cluster=devnet)
- [Ledger-bound request](https://explorer.solana.com/tx/39XYTBMqsRcGSoeoDfJoR22AFUR23aCofHNsPJ3zUHjGFtBLUBF5HBGwMvPqcpFRD9bFvRv7QHJaxL3iSBsq4CbQ?cluster=devnet)

Source and build instructions: [programs/pull-randomness](programs/pull-randomness) and [verification details](docs/PULL_RANDOMNESS.md). These receipts demonstrate devnet randomness and ledger integration, not Gemini trade execution.

## Tech stack

| Layer                    | Technologies                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Runtime and workspace    | Bun 1.3.11, Bun workspaces, strict TypeScript 5.9                                          |
| Frontend                 | Next.js App Router, React, Tailwind CSS, Radix UI / shadcn-style components, Lucide, Inter |
| Charts                   | TradingView Lightweight Charts                                                             |
| API and client state     | tRPC, Zod, TanStack Query, HTTP routes, server-sent events                                 |
| Data                     | PostgreSQL, Drizzle ORM and migrations, exact decimal strings / integer smallest units     |
| Prediction markets       | Official `@gemini-markets/sdk` 0.1.1 and WebSocket order books                             |
| Identity                 | Privy React and Node SDKs, signed Solana wallet proofs                                     |
| Solana                   | `@solana/kit`, Metaplex Core / Umi, native Rust program, MagicBlock VRF                    |
| EVM                      | viem, Base and Robinhood RPC, Uniswap v3 SwapRouter02 and v4 UniversalRouter / Permit2     |
| Collectibles and funding | Collector Crypt, Card Hedge, Grail, Relay quote API, QuickNode RPC / DAS                   |
| Share images             | Server-side image rendering, Sharp, bundled Inter fonts, persisted PNG snapshots           |
| Hosting and checks       | Railway web + worker + PostgreSQL, GitHub Actions, Bun tests, TypeScript, Prettier         |

## Quick start

### Prerequisites

- Bun **1.3.11+**.
- Node.js **22+** for Next.js tooling; CI uses Node 24.
- PostgreSQL for saved accounts, positions, shares, profiles, and pack openings.
- A Privy app for authenticated demo and wallet flows. Public browsing does not require login credentials.

### Install and configure

```sh
git clone https://github.com/hamzaskewl/collectiblemarkets.git
cd collectiblemarkets
bun install --frozen-lockfile
cp .env.example .env
```

On PowerShell, use `Copy-Item .env.example .env` for the last step. Edit the local `.env` before running migrations:

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/collectiblemarkets
APP_URL=http://localhost:3000
WORKER_URL=http://localhost:4001
DEMO_MODE=simulated
SOLANA_NETWORK=devnet
SOLANA_RPC_URL=https://api.devnet.solana.com
PULL_RANDOMNESS=demo-csprng
```

Set matching `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_ID`, plus server-only `PRIVY_APP_SECRET`, to enable sign-in. Add `http://localhost:3000` to Privy's allowed origins. See [identity setup](docs/IDENTITY_SETUP.md) for wallet proofs, Gemini OAuth, and token encryption.

| Optional configuration                                                                              | Enables                                                              |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `CARD_HEDGE_API_KEY`, `ENABLE_PUBLIC_FMV`                                                           | Licensed public FMV/comps display for matched cards                  |
| `QUICKNODE_RPC_URL`, `QUICKNODE_DAS_RPC_URL`, `QUICKNODE_BUDGET_*` and credit settings              | Metered RPC and wallet inventory reads within a persistent allowance |
| `RELAY_API_KEY`                                                                                     | Server-side funding quote previews                                   |
| `PULL_RANDOMNESS=magicblock-devnet`, `PULL_MAGICBLOCK_PROGRAM_ID`, `PULL_MAGICBLOCK_DEVNET_RPC_URL` | Verified devnet VRF openings; users need devnet SOL                  |
| Gemini OAuth credentials, `TOKEN_ENCRYPTION_KEY`, and verified production approval                  | Authorized private account reads                                     |

The full configuration and disabled-by-default execution flags are in [.env.example](.env.example). Keep secrets in ignored environment files or Railway service variables.

### Run locally

```sh
bun run db:migrate
bun run dev
```

Web: **http://localhost:3000**. Worker: **http://localhost:4001**. Run all migrations before trying saved positions, shares, profiles, or Pull & Predict. Missing provider configuration produces explicit unavailable states rather than fabricated data.

### Validate and build

```sh
bun run check
bun test
bun run format:check
bun run build
```

Database-backed tests require a migrated PostgreSQL database; CI provisions PostgreSQL 17 and runs migrations before the suite. Tests cover depth arithmetic, account isolation, wallet proofs, quote validation, reward accounting, pack odds, replay protection, and transaction recovery.

For production, run `bun run start:web` and `bun run start:worker` as separate services. See [Railway deployment](docs/DEPLOYMENT.md) for build commands, health checks, private networking, and the `slabline.xyz` origin.

## Project structure

```text
collectiblemarkets/
├── apps/
│   ├── web/
│   │   ├── src/app/            # Market, portfolio, wallet, pack and API routes
│   │   ├── src/components/     # Trading, rewards, identity and sharing UI
│   │   ├── src/lib/            # Web helpers and client state
│   │   └── public/             # Brand assets, pack artwork, fonts and demo media
│   └── worker/src/             # Provider ingestion, live books and reconciliation
├── packages/
│   ├── domain/src/             # Exact math, matching, odds and state rules
│   ├── integrations/src/       # Provider adapters, authentication and execution gates
│   └── db/                     # Drizzle schema, migrations and persistence tests
├── programs/pull-randomness/   # Native Rust Solana VRF consumer
├── scripts/                   # Public-data and devnet verification utilities
├── docs/                      # Setup, demos, evidence and security boundaries
├── .github/workflows/ci.yml    # Typecheck, formatting, database tests and build
├── .env.example               # Configuration template; no credentials
├── ARCHITECTURE.md             # Product and implementation contract
├── DESIGN.md                   # Interface and brand guidance
└── PRODUCT.md                  # Product context
```

## Security and execution boundaries

| Boundary             | Implementation                                                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Money and quantities | Exact arithmetic; demo cash, Gemini USD, Solana SOL/USDC, and EVM assets stay separate                                 |
| Account isolation    | Authenticated routes, user/network-scoped private queries, ownership checks, and one-use wallet-proof nonces           |
| Credentials          | Server-only provider keys and encrypted Gemini token bundles; no private keys in client code                           |
| Financial actions    | Explicit reviews and signatures, permission gates, persistent idempotency keys, and independent reconciliation         |
| Pack recovery        | Persistent seeds and openings, account locks, single debit/redemption, and recovery of submitted requests              |
| Public sharing       | Preparing a preview stays private; link publication is explicit; public PNG snapshots are immutable and anonymous      |
| Collectible claims   | A preview is not a reservation; devnet representations and token fractions do not establish physical redemption rights |

**Gemini:** production OAuth approval, account scopes, jurisdiction, and funding permissions remain release gates. Selecting Mainnet does not enable orders or withdrawals.

**Relay:** previews expire after 30 seconds. Supported previews include Ethereum/Base native USDC to Solana mainnet USDC and test ETH between Sepolia and Base Sepolia. Solana devnet is not listed by the integrated testnet API. Provider status is not proof of received funds; execution, sponsorship, permits, and deposit-address flows remain off.

**Collector Crypt and Grail:** devnet Collector Crypt signing requires both `ENABLE_CC_DEVNET_TESTS=true` and an exact `CC_DEVNET_TEST_WALLET` match. Its test-USDC mint differs from Circle's devnet USDC. Grail flows require exact approvals, bounded slippage, user-paid ETH, wallet signatures, and independent transfer reconciliation. Mainnet purchase release remains gated; unknown submissions require recovery before another attempt.

**QuickNode:** web and worker share a PostgreSQL credit ledger for a verified billing period. Each allowed RPC call reserves 1,000 credits, including batch members, retries, and failures; unknown methods are rejected. The cutoff cannot exceed 75% of included credits. Missing, expired, or exhausted budgets use supported public RPC fallbacks, while DAS ownership checks stop. Other applications' usage and Streams are outside this RPC allowance; Streams stay disabled.

See [security boundaries](docs/SECURITY.md) and [integration verification](docs/INTEGRATION_VERIFICATION.md) for implementation evidence and remaining external blockers.

## Documentation

| Document                                                  | Purpose                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------ |
| [Architecture](ARCHITECTURE.md)                           | Product scope, integration rules, and source-of-truth requirements |
| [Product](PRODUCT.md) / [Design](DESIGN.md)               | Users, brand, and interface principles                             |
| [Demo walkthrough](docs/DEMO.md)                          | Repeatable presentation scenarios                                  |
| [Pull & Predict specification](docs/PULL_PREDICT_SPEC.md) | Pack economics, state, and user flow                               |
| [MagicBlock randomness](docs/PULL_RANDOMNESS.md)          | Program setup, request verification, and devnet receipts           |
| [Integration evidence](docs/INTEGRATION_VERIFICATION.md)  | Verified behavior, dated observations, and blockers                |
| [Identity setup](docs/IDENTITY_SETUP.md)                  | Privy, wallet proofs, and Gemini OAuth                             |
| [Deployment](docs/DEPLOYMENT.md)                          | Railway services and public origin configuration                   |
| [Security](docs/SECURITY.md)                              | Authentication, data, and execution boundaries                     |
| [QuickNode Stream notes](docs/QUICKNODE_STREAM.md)        | Deferred, gated Stream setup; no active Stream claimed             |

## Acknowledgments

Built independently by [hamzaskewl](https://github.com/hamzaskewl) for UBC 2026. Thanks to Gemini, Solana, MagicBlock, Privy, Collector Crypt, Card Hedge, Grail, QuickNode, Relay, Metaplex, and Railway for the APIs and infrastructure used here.

Charts use [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/). Provider images belong to their respective owners. Slabline is independently operated and does not imply provider endorsement.

README structure inspired by [Hoppy](https://github.com/hamzaskewl/hoppy).
