# Integration verification

Updated 2026-11-12 (America/Chicago). A code adapter is not evidence of a completed financial action. Status vocabulary: **verified in code** (with stated test), **documented but untested**, **permission blocked**, **mock**.

| Provider action | Status | Evidence / exact blocker | Official documentation |
|---|---|---|---|
| Gemini public discovery | verified in code | Official SDK 0.1.1 `predictions.listEvents`; real active markets returned locally. Nested events preserved. | https://developer.gemini.com/prediction-markets-spec/markets |
| Gemini live book | verified in code | Official SDK self-healing order book -> worker -> SSE; actual Houston/Washington book seen locally. No live order sent. | https://developer.gemini.com/tools/typescript-sdk/websocket |
| Depth estimate | verified in code | Exact BigInt math; tests cover depth, partial fills, increments, unknown fees and budget invariants. Live fees remain unverified. | https://developer.gemini.com/tools/typescript-sdk/quickstart |
| Practice orders | mock | Explicit invented `SIMULATED-HOME-YES` fixture; device-local simulated positions only. No real settlement. | ARCHITECTURE.md |
| Gemini OAuth/private data | permission blocked | No client credentials or production app review; own eligible Gemini account required. | https://developer.gemini.com/authentication/oauth |
| Gemini order/settlement | permission blocked | Terms, jurisdiction, scopes and OAuth prerequisites not verified. No trade endpoint exposed. | https://developer.gemini.com/prediction-markets-spec |
| Gemini network permissions | documented but untested | `GET /v2/network/USDC` is account-specific; Solana availability cannot be inferred. | https://developer.gemini.com/trading/rest-api/market-data/get-network |
| Gemini withdrawal | permission blocked | `crypto:send`, approved address/hold, account access, fees and transfer reconciliation required. | https://developer.gemini.com/rest/fund-management |
| Collector Crypt catalog | verified in code | Real `/marketplace?step=100&marketplaceSource=CC` reads. Filter to graded USDC listings; provider image URLs only. Raw is not a grading company. | https://docs.collectorcrypt.com/marketplace/api |
| Collector Crypt devnet inventory | documented but untested | Devnet read returned no confirmed buyable sample inventory; cannot claim test purchase. | https://docs.collectorcrypt.com/marketplace/api |
| Collector Crypt buy/sign/broadcast | documented but untested | Builder returns bare base64 string, broadcast uses `signedTransaction`; release requires inspected instructions, signed test, independent confirmation and owner reconciliation. Mainnet disabled. | https://docs.collectorcrypt.com/marketplace/api |
| Collector Crypt shipping | permission blocked | Partner onboarding/key/scopes and wallet-signature flow missing. External redemption link only. | https://docs.collectorcrypt.com/vault/shipping-api-v1 |
| Phygitals pack read | verified in code | Real public `/api/vm/available` returned Rookie Pack and other packs. Separate from exact-card catalog. | https://www.phygitals.com/docs/public-api |
| Phygitals pack purchase | permission blocked | User-scoped key with `vm.buy.crypto`, connected wallet and actual signed payment required. No shared key purchases. | https://www.phygitals.com/docs/public-api |
| Card Hedge valuation/comps | permission blocked | API credential, exact endpoint contract and redistribution rights missing; no ask-as-FMV or invented comps. | https://api.cardhedger.com/docs |
| Marketplace imagery rights | permission blocked | Public catalog supplies images; display attribution is present. Public commercial redistribution license not established. Confirm before public real-money release. | https://docs.collectorcrypt.com/marketplace/api |
| Privy social/Solana wallet | permission blocked | SDK installed; app ID, app secret, enabled social providers and allowed origins needed in Privy dashboard. No user key material stored. | https://docs.privy.io/ |
| Relay bridge | permission blocked | Live owned-wallet quote, screening, chain/token support, gas and expiry not verified. Direct CEX->Relay route is not offered. Absence from a blocklist is not approval. | https://docs.relay.link/security/unsupported-exchanges.md |
| QuickNode Stream | permission blocked | QuickNode account/RPC/Stream and webhook secret not configured. No bounty evidence claimed. | https://www.quicknode.com/docs/streams |
| Railway services | documented but untested | Project, managed PostgreSQL, web and worker provisioned; deployment verification pending source connection. | https://docs.railway.com/guides/monorepo |

All mainnet money-moving actions remain disabled even if an environment flag is accidentally enabled. Live release requires replacing the blocked adapter with verified implementation and tests, exact provider permissions, and explicit per-action user approvals. No bridge, trade, withdrawal, purchase, shipping or full bounty completion is claimed.
