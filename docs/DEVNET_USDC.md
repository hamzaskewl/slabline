# Devnet deposits and withdrawals

Slabline's practice ledger can be deposited to and withdrawn from using its own six-decimal SPL token on Solana devnet. This is a test token with no monetary value, not Circle USDC. The UI uses **USDC** under explicit **Devnet** context. Native Circle USDC and Collector Crypt's test token remain separate and are not accepted by this flow.

Mint: `DvRqDmYYxHTazj68tQEmBn1HAynesDoSP7DShGwmWfNL`.

Top up remains a free ledger faucet. Cash claims, sales and pack remainders credit the same available balance. Withdraw USDC reserves that balance, requires the verified destination wallet's signature, and mints the exact amount to its associated token account. Deposit USDC requires a wallet-signed burn and credits the ledger only after finalization. Users can withdraw practice funds and winnings; this does not enable live Gemini trading, real cash withdrawals, or physical-card redemption.

The global header shows only spendable cash. In devnet it reads the same account ledger as Portfolio, including withdrawal reservations. In mainnet it reads authorized Gemini available USD, and displays an unavailable state when that balance cannot be read. It never substitutes portfolio value or onchain token inventory.

## Persistence and recovery

Transfers use the existing `withdrawals` operation table with `demo:usdc:` keys. Ledger row locks serialize spending and reservations. Keys bind direction, wallet and amount; only one unfinished transfer per account is allowed. Thirty new transfers per user per hour bounds devnet fee sponsorship.

The server's isolated devnet mint authority pays fees. Its partial signature makes the transaction ID known before the user signs, including when a wallet independently broadcasts. Both directions require the user's signature in the memo. The memo also includes the unique operation ID, preventing identical transfers in one blockhash window from sharing a transaction ID.

Submitted bytes must exactly match the saved message and all signatures must verify. The signed transaction is persisted before broadcasting. Retries rebroadcast that same transaction, never mint a replacement. Network errors keep the reservation pending. Finalized failure or verified expiry releases a withdrawal reservation once; successful deposits credit once. Confirmation can be resumed from Recent transfers after closing the dialog or reloading. Prepared transactions cannot be cancelled immediately because the wallet could already have broadcast them; the system waits for finalization or expiry. If RPC history has been pruned, absence is not sufficient to refund automatically.

## Configuration

- `SLABLINE_DEVNET_USDC_MINT`: the devnet mint above.
- `SLABLINE_DEVNET_USDC_AUTHORITY_SEED`: server-only base64 32-byte Ed25519 seed. Never expose it in client variables, logs, or version control.
- The mint must belong to the original SPL Token program, have six decimals, have the configured authority, and have no freeze authority. Native Circle and Collector Crypt mints are explicitly rejected.

`scripts/setup-devnet-usdc.ts` creates a fresh mint and authority, saves secrets in the gitignored `.env.devnet-usdc.local`, and funds the authority with 0.1 devnet SOL from an explicitly supplied devnet payer. `--railway-env` uses `PULL_DEVNET_DEPLOYER_KEYPAIR_JSON` from the process environment. `scripts/name-devnet-usdc.ts` adds immutable Metaplex metadata. These scripts refuse mainnet configuration. Back up the server authority securely before removing the local setup file.

No schema migration is required. Configure the web service and deploy the updated source. The worker does not need the mint authority.

## Verification on November 20, 2026

- Targeted database, token-instruction, signature, reward-accounting and financial-gate tests: 14 passed, 112 assertions.
- Route regression tests: 2 passed, 9 assertions, covering devnet-only error responses and authentication.
- An isolated local account claimed 2.5 practice dollars, withdrew 2.5 tokens on devnet, and deposited all 2.5 back. Final ledger: 102.5; final wallet token balance: zero. Repeated checks did not change balances.
- Withdrawal: `42g5Eq3Rkw6zrTM5ByLhferZndfYWM1T4eKLDTdWdN3JazwMP8Gb4dAzzgNmXheHWzH15GbpnnWntJJ5t6E3sri9`.
- Deposit: `3uyWubNfXR33D8iGno73bQjAacLaj8kP4ieEPwqod93iWYpxzYvDLVbyhxcXyvdKmC3qMgTTz2einMsDZr3ebXS3`.
- These are real finalized devnet transfers using a generated test wallet, not a Privy login/signing test. UI tests use mocked wallet/account responses and the real components; live authenticated browser verification is recorded separately when performed.
- Railway web deployment `f222526b-4ce6-4a6e-b70b-e8ee91c5234e` reached SUCCESS. Live health and token metadata returned 200, unauthenticated devnet transfer reads returned 401, and mainnet requests returned 409 with the Devnet instruction. The live portfolio loaded correctly while signed out; live Privy wallet approval remains untested in this session.
- Component interactions and header balance updates passed at 1440, 390 and 320 pixels. Independent screenshot review approved the interface, including the compact 320-pixel summary. These UI interactions used simulated wallet and account responses.
