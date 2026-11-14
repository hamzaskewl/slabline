Collectible Markets — Codex Handoff
Version: 2026-11-12 · Goal: Build during the UBC 2026 hackathon (submission Nov 20, noon CST). Status: specification, not evidence of working production integrations.
Product
A consumer-first prediction-market application using Gemini's actual market catalog, live order books, and authorized user trading, with a distinctive reward preview: as a user enters a USD prediction size, show real, currently listed graded cards in their slab images whose purchase prices could fit the estimated full winning payout. At settlement, winners can select multiple cards/packs, review fair-market-value estimates and recent comps, then explicitly authorize funding their own Solana wallet and purchasing collectibles. No guaranteed collectible or funds are reserved simply because a preview was shown.

Name: Collectible Markets. Avoid imitating Gemini's exact copyrighted visual design or claiming the product is operated by Gemini.

Mobile is the primary web experience. The same URLs serve the desktop website, mobile browser and installed home-screen app. Use a compact market feed, horizontal category filters and bottom navigation on phones. Keep controls clear of the home indicator and cutouts. Bottom tabs navigate within the current app on tap and suppress link previews on long press. Keep ordinary links, text selection and pinch zoom available elsewhere.

Ship a standalone web app manifest, home-screen icons and an offline launch message. Fetch prices, accounts and transaction state from the network. Verify narrow portrait and short landscape layouts, touch navigation, and installation metadata when changing the app shell.

Current product scope (2026-11-13)

- Apply every UI change to mobile and desktop. Remove promotional slogans and repeated integration explanations from app flows; keep required attribution and technical status on About. Keep simulation and unavailable actions unambiguous.
- Discover active markets only when available card inventory or Grail tokens relate to the event's subject or sport. No unrelated inventory fallback. Sports rewards are the default; non-sports rewards, including Pokemon, require a related active market.
- Rewards default to highest listing ask, with search, price bounds, sport/category, grader, grade, autograph/rookie and sort filters. Follow Collector Crypt cursor pagination; no arbitrary $1,000 ceiling.
- Hide Phygitals packs and absent FMV/comps from this UI scope. Their adapters remain available for later work.
- Read Grail’s public catalog and pool metadata; verify pool identity against Uniswap deployments onchain. In-app purchases use user-owned EVM wallets: Base v3 USDC pairs via SwapRouter02, Robinhood v4 asset pairs via UniversalRouter/Permit2. No 0x service. Payment assets come from each actual pool; USDG is not a substitute for AMZN/SPY/NVDA. Exact approvals, bounded slippage, short deadlines and user signatures for every transaction. Persist review/sign/broadcast/confirmation state, serialize wallet actions and independently reconcile transfers after three confirmations. Unknown submissions require recovery, never automatic resubmission. Gas sponsorship stays OFF; users pay ETH. Physical redemption remains on Grail; token ownership does not imply whole-card ownership. Live execution remains gated pending an approved user-signed test. Base Sepolia, Robinhood testnet and Solana devnet are available for wallet testing; actual Grail pools are mainnet deployments. Gemini withdrawal and bridge steps remain blocked until account permissions and executable routes are verified.
- Report blockers in chat; do not create additional user-facing Markdown reports.

Locked technical choices

- Bun runtime/package manager/workspaces. TypeScript strict throughout.
- Next.js App Router, Tailwind CSS, shadcn/ui, Lucide; mobile-responsive, polished exchange-style product.
- tRPC + Zod + TanStack Query for app APIs and caching.
- Drizzle ORM + PostgreSQL (Railway Postgres). Use migrations and indexes; money uses exact decimal strings/integer smallest units, never JS floats for settlement.
- Privy social-first login (Google/email etc.), auto-provision a user-controlled embedded Solana wallet when appropriate, and support connecting Phantom/Solflare/Backpack as external wallets. Let user select/verify destination wallet. Use Privy's official React SDK and @solana/kit; don't run a second conflicting wallet connector stack.
- Gemini OAuth as a separate linked connection from app login; server-side confidential flow + CSRF state, least-privilege scopes, encrypted refresh tokens, short-lived access tokens. Users require individual eligible Gemini accounts. Production OAuth app needs Gemini review.
- Official Gemini TS SDK @gemini-markets/sdk (server entrypoint) for supported REST/WebSocket operations; use raw documented APIs only when SDK lacks a feature.
- Railway deployment: web (Next.js), worker (Bun long-lived data + job process), postgres. Prefer no Docker. Deploy web/worker from same Bun workspace repository with separate start commands.
- TradingView Lightweight Charts for quote/history visualization; SSE from our real-time gateway to browser for price updates (orders go over authenticated app API). Optional Postgres LISTEN/NOTIFY or Redis later; not required for single-instance MVP.
- QuickNode Streams plus Solana RPC for filtered transaction ingestion, confirmation and owner reconciliation.
- Relay SDK/API only as conditional EVM-to-Solana bridge fallback, with quote-based fee/route checks, not as a promised free or automatic withdrawal method.
  Repo layout
  collectible-markets/
  apps/web/ Next.js pages, components, tRPC router, Privy provider
  apps/worker/ Gemini WS, sync jobs, FMV queue, QuickNode webhook/processing
  packages/db/ Drizzle schema, migrations, queries
  packages/integrations/ Gemini / CollectorCrypt / Phygitals / CardHedge / Relay / Solana
  packages/domain/ Zod schemas, decimals, quote & eligibility math, state machines
  packages/ui/ optional reusable UI primitives
  docs/ API capability matrix, security, demo notes
  .env.example
  Implement adapters with documented typed functions, e.g. listMarkets, subscribeBook, getGeminiBalances, getPositions, listCards, getFMV, getComps, buildBuyTransaction, broadcastSignedTransaction, getFundingRoute, estimateFees, trackTransfer.
  Screens and interaction

1. / — live discovery by category: sports, esports, crypto, economics, etc.; search, market imagery, logos when authorized/available, clear fallback icons.
2. /markets/[id] — Gemini-like functionality with original design: structured event/child markets, YES/NO sides, best executable bid/ask, depth, history chart, stake entry, estimated fees, estimated total payout, related graded card reward images. Recompute on book/stake changes; never show a guaranteed card.
3. /portfolio — Gemini account status, available USD, pending orders, positions and settlement; require linked Gemini OAuth for private data.
4. /rewards — search/filter live Collector Crypt listings and Phygitals packs; real front/back/slab images, grade, cert, asking price, available listing state, Card Hedge FMV/confidence/last comps where licensing permits.
5. /cart — multi-card selection with max = net spendable funds, default goal 80–100% of budget; never confiscate remainder. Price and availability recheck before each buy.
6. /wallet — distinct Gemini USD and Solana SOL/USDC balances; deposits, transfers, route quotes, explicit conversion/withdrawal consent, statuses, failures and holds.
7. /collection and /redeem — verify asset ownership on Solana; link out to provider's physical redemption initially; show integrated shipping only when partner credentials and wallet-signature flow are available.
   Visual assets: Use provider-supplied imageUrl for Gemini events when present, Collector Crypt frontImage / backImage for the actual slab, and Phygitals' published pack/chase-card images. Do not fabricate slabs or rely on a generic card image for a real listing. Configure image CDN host allowlists and attribution. Team logos/headshots must come from an authorized asset source; image fallbacks if missing. No hotlink/scraping assumption that violates TOS.
   Integrations and boundaries
   Gemini (source of truth for predictions)

- Public event catalog GET /v1/prediction-markets/events, preserve nested child events, instrumentSymbol, contract outcomes, tick/quantity increments, and optional images/sports metadata.
- Stream book/best prices/trades with official SDK via Gemini WebSocket; subscribe only to active/visible symbols, recover snapshots after WS gap/reconnect. Keep current book in worker memory; persist market metadata and sparse history. Efficiently push updates via SSE.
- Quote real purchasable contract quantities by walking ask depth, respecting price/size increments and actual fees. Show estimated total payout, not just profit; distinguish pre-trade estimate, filled positions, settled value. Never turn an approximate probability into a firm execution quote.
- Authenticated OAuth scopes for account balances, terms acceptance, order placement/cancel, fills, positions and settlements; explicit order confirmation and clear trade status. Use sandbox or clearly labeled simulator until verified production permissions are granted.
- No user can trade Gemini markets solely by signing with Solana wallet; require their own Gemini identity and authorized account.
  Collector Crypt (primary exact-card inventory)
- Public marketplace API https://api.collectorcrypt.com, devnet https://dev-api.collectorcrypt.com. Search cards and filter by price; map mint, category, card name, player, set/year, grade, cert, actual front/back images, ask, seller, availability.
- POST /marketplace/buy returns unsigned base64 transaction; buyer wallet signs; broadcast via documented endpoint; independently confirm on Solana before marking purchased.
- Multi-item cart is not one atomic transaction. Per-item order states and idempotency. If a later card fails, earlier completed buys stay bought; remaining USDC stays user-controlled.
- Physical redemption via /partner/v1 shipping API requires partner onboarding, key and scopes, and onchain burn/payment signatures. First MVP can link to Collector Crypt's site.
  Phygitals (packs first)
- Public pack reads /api/vm/available, /api/vm/chase/{slug}; authenticated POST /api/vm/buy/crypto requires user-scoped API key, linked wallet and valid signed payment. Do not assume arbitrary listed-card search/buy exists in public API.
- Pack delivery on Solana after buy; API key never in frontend. Vault/physical claim is separately permissioned and signature-based; optional after base flow.
- Production catalog is documented; do not assume public devnet availability. Provide clear mock flow for demo without spending mainnet funds.
  Card Hedge (FMV)
- Backend-only API (trial/paid), exact-match by grader + grade + cert where supported; otherwise year, publisher, set, card no, parallel, player, grader, grade.
- Store provider card ID, raw attribution, FMV, confidence, methodology, timestamp and up to five verified comparable completed sales with URLs and dates. Price display must be feature-gated on data redistribution rights. Low-confidence or no exact match -> label appropriately, no fake estimate.
- Use valuation job queue, persistent cache (12–24h initially), per-provider rate limits, and popular-card prioritization; do not refetch FMV per page view. Listing ask is not FMV. Markups above threshold can be flagged or excluded.
  QuickNode (Solana bounty + ownership)
- Configure at least one real QuickNode Stream with filter and webhook destination for relevant marketplace program/card transfers, historical backfill where available. Verify signed/origin-authenticated webhook, dedupe transaction signatures, check finalized/confirmed state and independently reconcile asset owner. Document stream config in README.
  Funds: the explicit, user-authorized redemption orchestrator
  Not a pooled treasury, not an internal promise of money, not an unattended transfer. Gemini funds and Solana wallet funds remain distinct. A user selects a specific amount to redeem, reviews a detailed quote, and explicitly confirms.

Preferred routing (gemini_usd -> solana_usdc):

1. Check Gemini available USD and withdrawals eligibility (not total balances or unsettled positions).
2. Get a spot conversion quote and, with orders:create permission and user confirmation, execute USD -> USDC; reconcile actual fill and remaining balance.
3. Call authenticated GET /v2/network/USDC for that user's network permissions, prefer Solana only if enabled. Check crypto:send authorization, available-for-withdrawal, fee estimate and approved wallet destination. Adding an address may trigger a 7-day waiting period; cannot bypass.
4. Ask user to confirm exact network, address, amount and fees, then call documented POST /v2/withdraw/solana/usdc only if actually available for their account; use stable clientTransferId idempotency. Track via transfer status (POST /v2/transfers) AND Solana RPC before enabling checkout.
   Fallback routing only if direct Solana is unavailable and supported end-to-end:
5. Withdraw Gemini USDC over a permitted EVM network to a user-owned, supported EVM address (Privy can also provision an EVM wallet if required); Gemini's approved-address and network/hold requirements still apply.
6. Obtain live Relay quote for USDC on that EVM chain -> USDC on user's Solana wallet. Show bridge fees, gas, limits, expected output and expiry; user authorizes source transaction; verify Relay completion and destination Solana USDC. Never imply zero fees.
7. A direct Gemini CEX withdrawal into a Relay deposit address must be researched and explicitly verified (CEX support/screening, address whitelist, memo, route lifetime). Never default to sending to a temporary bridge address. If unsupported, show manual wallet-controlled path.
   Funding state machine: draft -> quote_ready -> awaiting_user_approval -> converting -> conversion_confirmed -> withdrawal_submitted -> withdrawal_pending -> received_on_solana -> checkout_ready, with held, approval_pending, unsupported, failed, cancelled, refund_pending, reconciliation_required branches. Persist transitions, audit provider IDs and idempotency keys; no duplicate financial actions on retries/reloads. Do not auto-spend all Gemini cash—only the selected winnings/budget. A settled prediction credit can be spent elsewhere on Gemini; verify available USD at action time.

After receipt: select up to budget of exact listings, show FMV + fees, confirm each purchase, reconcile per-card tokens; remaining assets stay in user wallet.
Data and caching
Postgres tables minimum: users, linked_gemini_accounts (encrypted secrets), wallet_links, markets, contracts, market_snapshots, positions, settlements, assets, listings, fmv_valuations, comparable_sales, entity_aliases, carts, cart_items, funding_intents, conversions, withdrawals, relay_requests, orders, order_items, onchain_events, audit_events.

Index provider IDs, active player/team IDs, wallet addresses, listing status, TTL fields. Preserve raw external IDs and network. Derive view models server-side. Postgres persists snapshots, not every tick; active order books live in worker memory, recover on reconnect. Use TanStack Query stale-times and SSE invalidations; optionally add Redis only when horizontal scaling needs shared state.
Security and legal release gates

- Never store keypairs, OAuth secrets, Gemini refresh tokens, Phygitals API keys, Card Hedge keys, or withdrawal permissions in browser/localStorage; use Railway environment secrets and encryption at rest for per-user OAuth tokens.
- Use request auth + wallet proof, CSRF/PKCE/state validation where applicable, webhook signature verification, per-user isolation, rate limiting, replay prevention, audit logs, errors/redaction. No financial action on page load.
- Do not assume Gemini production OAuth approval, sport-market jurisdiction eligibility, crypto send scope, Solana USDC withdrawal, Card Hedge redistribution rights, marketplace image licenses, or Collector Crypt shipping-partner permissions.
- SIMULATED and SANDBOX must be unmistakable and no live funds may move in simulated mode. Feature-gate live orders/withdrawals/redemptions until verified and approved.
- Review payment, gambling/event-contract, and data redistribution rules before public real-money launch.
  Environment / modes
  DEMO_MODE=simulated|sandbox|live (default simulated), ENABLE_LIVE_TRADING=false, ENABLE_GEMINI_CRYPTO_SEND=false, ENABLE_RELAY=false, ENABLE_CC_PURCHASES=false, ENABLE_PHY_PACK_BUYS=false, ENABLE_PUBLIC_FMV=false, ENABLE_PARTNER_REDEMPTION=false. Configure production/sandbox/devnet endpoints independently. GEMINI_OAUTH_CLIENT_ID, GEMINI_OAUTH_CLIENT_SECRET, PRIVY_APP_ID, PRIVY_APP_SECRET, DATABASE_URL, GEMINI_*, CARD_HEDGE_API_KEY, PHYGITALS_API_KEY, QUICKNODE_RPC_URL, QUICKNODE_WEBHOOK_SECRET, RELAY_API_KEY in env; no real values in Git.
  Acceptance / testing
- Anonymous user can browse Gemini markets + live quote previews from public data. UI gracefully handles no sport image/no matching cards.
- Social sign-in yields embedded Solana wallet; Phantom wallet connect/link works. Account isolation tested.
- Linked Gemini OAuth accurately shows available USD, positions, settlement status, and cannot accidentally trade without confirmation.
- Depth-walk payout tests: partial fills, slippage, min quantity, fee rounding; no floating point drift.
- A verified listing shows actual provider slab image and correctly matched FMV/comps; misleading grade and stale listing rejected.
- Cart rejects over-budget and duplicate asset; partial purchases and failed broadcast are recoverable.
- Funding path checks actual permissions; inactive until allowed. Repeated submit cannot double convert/withdraw. Wrong chain/address causes hard stop. Relay quote failures fall back to manual path, never fabricated success.
- QuickNode filtered stream -> webhook -> ownership reconciliation demonstrably works in supported environment.
- Railway web + worker + Postgres deployment instructions, .env.example, tests, lint/typecheck, README, demo video checklist and hackathon bounty evidence.
  Official documentation / first source checks
- Gemini: https://developer.gemini.com/prediction-markets-spec ; https://developer.gemini.com/authentication/oauth ; https://developer.gemini.com/tools ; https://developer.gemini.com/rest/fund-management ; https://developer.gemini.com/trading/rest-api/market-data/get-network
- Collector Crypt: https://docs.collectorcrypt.com/marketplace/api ; https://docs.collectorcrypt.com/vault/shipping-api-v1
- Phygitals: https://www.phygitals.com/docs/public-api
- Privy: https://docs.privy.io/ ; https://www.privy.io/pricing
- Relay: https://docs.relay.link/llms.txt ; https://docs.relay.link/security/unsupported-exchanges.md
- Card Hedge: https://api.cardhedger.com/docs
- QuickNode: https://www.quicknode.com/docs/streams
  Open questions Codex must research and report BEFORE enabling live funding: Gemini OAuth production approval and scope availability; per-account USDC Solana withdrawal and address preapproval; Gemini crypto-to-USD conversion route; Relay quote and CEX compatibility; Card Hedge license to display FMV; Phygitals third-party/user-scoped API authorization; real Collector Crypt devnet sample inventory. Do not silently paper over missing APIs or permissions.
