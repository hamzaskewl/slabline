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

**Hackathon entries**

- ✅ **Gemini Prediction Markets** — sponsor bounty
- ✅ **Best use of Solana** — chain award

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

**[Open slabline.xyz](https://slabline.xyz)** on desktop or mobile. Browse markets and rewards without an account. To try trades, packs, and claims, sign in, select **Devnet** in settings, then use **Top up** in Portfolio to add practice cash. The starting balance is $100; top-ups let you try every pack tier.

**Start with the Wembanyama replay for the complete prediction-and-card demo, or Pull & Predict for the pack experience.** The replay lets you choose the result immediately, so you do not need to wait for a real game to finish.

### Everything you can try

| Demo                                | Where to open it                                                                                     | What to do                                                                                                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Discover real markets               | [Markets](https://slabline.xyz)                                                                      | Search teams and players, switch categories, sort results, browse active/resolved events, and save favorites. Open an outcome to inspect its chart and order book.                |
| Find live games                     | [Live](https://slabline.xyz/?category=live)                                                          | Browse qualifying games in progress and the featured matchups. This view can be empty when no current games qualify.                                                              |
| Target a particular card            | [Wembanyama replay](https://slabline.xyz/demo?stake=39.90)                                           | Change your stake to see the possible payout and matching slab. In live markets, browse matching cards and use the selected card's target action to calculate the required stake. |
| Buy, add, and sell                  | [Position demo](https://slabline.xyz/demo?stake=25)                                                  | Buy a practice position, buy more of the same side, then sell part of it or exit fully. Watch shares, average entry, and available balance update.                                |
| Finish a prediction                 | Settings → **Finish a replay**                                                                       | Select a saved replay position and apply Yes, No, or Void. A loss has no payout; a void refunds the remaining position cost.                                                      |
| Claim a card                        | [Portfolio](https://slabline.xyz/portfolio) → **Claim**                                              | After a replay win, select a card, review the reward allocation, and approve the devnet collectible transaction in your wallet.                                                   |
| Keep the cash                       | [Portfolio](https://slabline.xyz/portfolio) → **Claim**                                              | Choose the cash option on an unclaimed winning position to move the payout into your available practice balance.                                                                  |
| Try a Grail reward                  | [Jensen replay](https://slabline.xyz/demo?scenario=grail&stake=25)                                   | Buy the Omniverse YES position and finish it as a win to see the payout become a simulated JENSEN holding.                                                                        |
| Open a prediction pack              | [Pull & Predict](https://slabline.xyz/pull-predict)                                                  | Choose $25, $50, $100, or $200, search a team/player, review the odds, and open the pack. Choose your prediction after the budget reveal.                                         |
| Resume an unfinished pack           | [Your packs](https://slabline.xyz/pull-predict/packs) or [Portfolio](https://slabline.xyz/portfolio) | Reload after opening, recover the saved budget, select an outcome, and review the fresh quote before buying.                                                                      |
| Browse collectible inventory        | [Rewards](https://slabline.xyz/rewards)                                                              | Explore Cards and Grail tokens, search and filter listings, and compare asking prices with available Card Hedge valuations.                                                       |
| Share a position                    | [Portfolio](https://slabline.xyz/portfolio) → position → **Share**                                   | Preview the card, copy or download its PNG, or explicitly publish a link. Open the link while signed out to see the same snapshot.                                                |
| Inspect your holdings               | [Portfolio](https://slabline.xyz/portfolio)                                                          | Review open/settled predictions, available cash, collected cards, unplayed packs, and Grail holdings. Refresh to check that saved state persists.                                 |
| Connect a wallet and edit a profile | [Profile](https://slabline.xyz/profile)                                                              | Connect or verify a wallet, change network preferences, and optionally publish a username, name, and bio. Public profiles can be found in profile search.                         |
| View wallet assets                  | Profile and Portfolio                                                                                | With a verified wallet, inspect network-specific SOL/native USDC balances and paginated collection assets.                                                                        |
| Try the mobile app                  | [Slabline](https://slabline.xyz) on your phone                                                       | Use bottom navigation, swipe featured markets, and add the app to your home screen. Prices and account actions still require a connection.                                        |

### Walkthrough: win a Wembanyama card

1. Open the [Wembanyama replay](https://slabline.xyz/demo?stake=39.90), sign in, and select Devnet. Start with no open YES position in this replay for the exact figures below.
2. Review and confirm the $39.90 order. The recorded book gives you **145 YES shares**, with a **$145 payout if correct**.
3. Open settings → **Finish a replay**, select the San Antonio position, and apply **Yes wins**.
4. Open Portfolio → **Claim**, select the archived $145 Wembanyama PSA 10 card, and follow the wallet confirmation to create its devnet representation. A funded devnet wallet is needed for the network fee.
5. Return to Portfolio to inspect the card and saved claim. To demonstrate cash instead, use a separate winning replay and choose the cash option before allocating its reward to a card.

The replay uses recorded Gemini depth and an archived listing, so the demonstration remains repeatable when the live listing changes. The resulting devnet collectible does not purchase or redeem the physical card.

### Walkthrough: grow or sell a position

Open the [position demo](https://slabline.xyz/demo?stake=25), buy once, then enter another stake and buy the same side again. Your existing position grows and its average entry updates. The reward preview includes the shares you already hold.

Switch to Sell, enter part of your shares, review the bid quote, and confirm. Proceeds return to practice cash while the remaining position stays open. Use Max to exit completely, or buy more to rebuild the position. YES and NO positions remain separate.

### Walkthrough: win a Grail holding

Open the [Jensen replay](https://slabline.xyz/demo?scenario=grail&stake=25). Its illustrative 25¢ entry turns **$25 into 100 YES shares**. Confirm the order, then use **Finish a replay** on the Omniverse position and apply **Yes wins**. The **$100 payout** becomes a saved simulated JENSEN holding in Portfolio. Reload to see it persist.

This demonstrates the Grail reward path when there is no matching slab. It does not perform a real EVM swap or acquire real JENSEN tokens.

### Walkthrough: open a pack and choose a prediction

1. Open [Pull & Predict](https://slabline.xyz/pull-predict), choose a tier, and search for a team or player with available markets.
2. Review the price and all four reward probabilities. Top up your practice balance if needed, then open the pack.
3. In MagicBlock mode, approve the devnet randomness request in your wallet and wait for the verified result. Request and receipt links let you inspect the onchain proof. Server-randomness practice mode is labeled separately.
4. Watch or skip the reveal. The result is a **buying budget**, not a winning prediction.
5. Continue to **Your packs**, choose a market and side, review the current quote, and confirm. The position appears in Portfolio; any unspent budget returns to practice cash.
6. To demonstrate recovery, reload after the reveal and reopen the saved pack from Portfolio. You keep the same opening and budget.

Ordinary positions based on live markets settle only when Gemini publishes the result. **Finish a replay** applies to the recorded demo scenarios. All practice balances and payouts are simulated; wallet actions described above use Solana devnet. Advanced Collector Crypt inspection/simulation tools are under [About → Transaction tools](https://slabline.xyz/about); signing remains restricted to the configured test wallet.

## Features

| Feature                     | What is implemented                                                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Market discovery            | Active and resolved market search, categories, favorites, outcome artwork, featured matchups, and provider-reported live games with freshness checks |
| Live order books            | Gemini WebSocket books delivered through the worker and server-sent events, with reconnect handling                                                  |
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
| Mobile experience           | Responsive layouts, bottom navigation, installable home-screen app metadata, and an offline launch message                                           |

Implementation and verification are tracked separately in [integration evidence](docs/INTEGRATION_VERIFICATION.md). A prepared transaction or successful simulation is not a completed purchase.

## Hackathon tracks and integrations

- ✅ **Gemini Prediction Markets** — real event discovery, live order books, depth-based trade previews, and published settlement results through Gemini's official SDK.
- ✅ **Best use of Solana** — wallet-signed devnet collectibles and a deployed MagicBlock VRF consumer for pack openings, with finalized receipts verified by the app.

See the [UBC hackathon guide](https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/edit?tab=t.0#heading=h.ykfx32xz9suf) for the bounty and chain-award requirements.

| Integration               | Role in Slabline                                                     | Current boundary                                                                                                 |
| ------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Gemini Prediction Markets | Events, live books, depth estimates, and settlement data             | Public reads work; private reads require approved OAuth and scopes; live orders and withdrawals gated            |
| Collector Crypt           | Graded-card catalog, slab images, and devnet purchase tooling        | Catalog available; buyer-funded devnet purchase inspection/simulation implemented; signing is wallet-allowlisted |
| Card Hedge                | Fair market value estimates and comparable sales                     | Matched live data supported; missing matches remain unavailable                                                  |
| Grail / Uniswap           | Tokenized collectible discovery and direct pool trading flows        | Base v3 and Robinhood v4 adapters; mainnet execution gated                                                       |
| Solana / Metaplex Core    | User-owned devnet collectible representations and asset verification | Devnet assets do not redeem physical cards                                                                       |
| MagicBlock                | VRF requests and immutable onchain randomness receipts               | Consumer deployed and request/fulfillment verified on devnet                                                     |
| Privy                     | Google/email login, embedded wallets, external wallet connections    | Authenticated actions still require account and wallet ownership checks                                          |
| Railway                   | Web service, worker, and managed PostgreSQL                          | Separate services with private worker networking                                                                 |

Phygitals read adapters also exist in the repository, but its packs are outside the current UI scope and purchases remain disabled.

## How it works

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

| Layer                 | Technologies                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------ |
| Runtime and workspace | Bun 1.3.11, Bun workspaces, strict TypeScript 5.9                                          |
| Frontend              | Next.js App Router, React, Tailwind CSS, Radix UI / shadcn-style components, Lucide, Inter |
| Charts                | TradingView Lightweight Charts                                                             |
| API and client state  | tRPC, Zod, TanStack Query, HTTP routes, server-sent events                                 |
| Data                  | PostgreSQL, Drizzle ORM and migrations, exact decimal strings / integer smallest units     |
| Prediction markets    | Official `@gemini-markets/sdk` 0.1.1 and WebSocket order books                             |
| Identity              | Privy React and Node SDKs, signed Solana wallet proofs                                     |
| Solana                | `@solana/kit`, Metaplex Core / Umi, native Rust program, MagicBlock VRF                    |
| EVM                   | viem, Base and Robinhood RPC, Uniswap v3 SwapRouter02 and v4 UniversalRouter / Permit2     |
| Collectibles          | Collector Crypt, Card Hedge, Grail                                                         |
| Share images          | Server-side image rendering, Sharp, bundled Inter fonts, persisted PNG snapshots           |
| Hosting and checks    | Railway web + worker + PostgreSQL, GitHub Actions, Bun tests, TypeScript, Prettier         |

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

| Optional configuration                                                                              | Enables                                             |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `CARD_HEDGE_API_KEY`, `ENABLE_PUBLIC_FMV`                                                           | Licensed public FMV/comps display for matched cards |
| `PULL_RANDOMNESS=magicblock-devnet`, `PULL_MAGICBLOCK_PROGRAM_ID`, `PULL_MAGICBLOCK_DEVNET_RPC_URL` | Verified devnet VRF openings; users need devnet SOL |
| Gemini OAuth credentials, `TOKEN_ENCRYPTION_KEY`, and verified production approval                  | Authorized private account reads                    |

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

**Collector Crypt and Grail:** devnet Collector Crypt signing requires both `ENABLE_CC_DEVNET_TESTS=true` and an exact `CC_DEVNET_TEST_WALLET` match. Its test-USDC mint differs from Circle's devnet USDC. Grail flows require exact approvals, bounded slippage, user-paid ETH, wallet signatures, and independent transfer reconciliation. Mainnet purchase release remains gated; unknown submissions require recovery before another attempt.

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

## Acknowledgments

An independent UBC 2026 project by [hamzaskewl](https://github.com/hamzaskewl), using Gemini, Solana, MagicBlock, Privy, Collector Crypt, Card Hedge, Grail, Metaplex, and Railway.

Charts use [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/). Provider images belong to their respective owners. Slabline is independently operated and does not imply provider endorsement.
