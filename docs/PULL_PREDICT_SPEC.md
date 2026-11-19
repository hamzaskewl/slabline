# Pull & Predict

Status: implementation specification, November 19, 2026. This is a separate product section at `/pull-predict`, selected from the Predict dropdown below Slabline. Existing prediction workflows remain available.

## Economics

A pack buys a random budget to spend opening a prediction position. It does not promise a settlement payout or immediate resale value. Pack prices are $25, $50, $100, and $200. The immutable version-one distribution is 62% at 0.6 times price, 28% at 1.2 times price, 6.4% at 2 times price, and 3.6% at 4 times price. Expected buying budget is exactly 98% of price; gross house edge is 2%, before operator costs. All accounting uses integer minor units or existing exact decimal primitives.

| Price | 62% | 28% | 6.4% | 3.6% | Expected budget |
| --- | --- | --- | --- | --- | --- |
| $25 | $15 | $30 | $50 | $100 | $24.50 |
| $50 | $30 | $60 | $100 | $200 | $49 |
| $100 | $60 | $120 | $200 | $400 | $98 |
| $200 | $120 | $240 | $400 | $800 | $196 |

Opening variance and position risk are distinct. Neither 98% return nor the minimum pull protects principal. Present costs, awarded budget, executable quantity, payout if correct, and estimated sell proceeds as distinct facts. Do not inflate rarity based on an outcome's low probability.

## Flow and persistence

1. Choose a pack and browse/search available market themes (all, team, player). Use actual active provider markets; no invented markets or fabricated liquidity.
2. Review price and every reward probability before purchase. Authenticate and use the existing persistent demo account for practice purchases.
3. Persist the opening ID, owner, pack version, price, randomness method, and unique seed before requesting randomness; reserve/debit once in a database transaction.
4. Reveal the budget only from the recorded draw. Reload, request retry, wallet retry, or quote failure must not generate another draw or charge.
5. Choose an eligible market and outcome, review a fresh executable depth quote, and confirm purchase using the segregated budget. Preserve unspent remainder; reject stale or unavailable execution without consuming the award.
6. Record the resulting ordinary demo position so portfolio sales and settlement use existing behavior. Retain a recoverable receipt and opening history.

A theme is a discovery filter, not permission to substitute a different market or side. Insufficient matching markets produce a useful empty state and broader search option. Mainnet funding remains gated; demo balances are never presented as actual USDC.

## Randomness

Integrate an existing Solana randomness protocol on devnet, with ORAO VRF under evaluation. A wallet signs only an inspected devnet request. Verify program ownership, account format, seed, payer, transaction success/finality and fulfilled bytes server-side. Bind the request to the paid opening before fulfillment. Reject historical/unrelated requests and duplicate proof consumption. Convert bytes to a probability bucket without modulo bias. Show request/receipt links with network context.

A separately labeled server CSPRNG practice draw can support demo usability; it must never masquerade as Solana VRF or silently replace a failed onchain request. No claim of being unexploitable: VRF addresses randomness integrity, while authorization, replay protection, database transactions and request binding protect the rest of the flow. A server-backed demo ledger remains trusted even when randomness is verifiable.

## Interface and verification

Follow DESIGN.md: graphite surfaces, Inter, compact bordered panels, ice-blue actions, exact tabular monetary figures, restrained animation with reduced-motion support. No marketing hero. Accessible dropdown, labeled controls, keyboard navigation, announced pending/error/reveal states and phone-safe action areas. Verify 320, 375, 390, 430, 768 and desktop widths, including long market names and $800 pulls.

Required checks: exact expected value across all four prices, draw boundaries and unbiased sampling, insufficient balance, replay and concurrency, cross-account denial, unchanged draw on reload, quote failure recovery, outcome choice, single redemption, retained remainder, portfolio integration, and rejected forged randomness evidence. Run typecheck, relevant/full tests and production build, then inspect rendered responsive flows.

## Hackathon alignment

Source: https://docs.google.com/document/d/1QaySCo7u3VxMVNdk3C5Ab3ewc2E46AuLntti-Uzx5EY/edit

The guide permits devnet and using existing Solana programs. It requires core onchain functionality and README program IDs plus an explanation of their role. Consumer Applications is a suitable main-track choice for the consumer pack experience; select one main track and Best Use of Solana, never both chain awards. Working implementation evidence and a 2–3 minute video are required. Deadline: November 20, 2026 at noon CST. Documentation must distinguish implemented, verified, and externally blocked behavior.
