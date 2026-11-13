# Security boundaries

The anonymous API is read-only. Public market feeds and catalogs never authorize trading. App identity, a proved Solana wallet and an authorized Gemini account are distinct identities.

No keypairs, tokens or provider secrets are stored in browser storage. Local storage currently contains only public cart metadata and clearly labeled simulated positions. Treat both as untrusted planning data. They never authorize spending or prove ownership.

Money is represented as decimal strings and integer micro-units. Monetary transitions require server persistence, unique idempotency keys, audited provider IDs and independent reconciliation. Unknown fees and missing values remain unknown. Inactive adapters fail closed.

Mainnet feature flags default false. Current release exposes no real-money mutation. Adding a flag alone cannot enable money movement. Production release requires provider review, jurisdiction/terms checks, image/data redistribution permission, transaction inspection, and signed onchain test evidence.

Provider reads use bounded timeouts, safe retry policies, schema checks, bounded caches and explicit unavailable results. Card images use fixed HTTPS host allowlists; no arbitrary image proxy fetches. Browser requests access the worker through web's fixed server URL.

Before public real-money release: rate-limit at ingress, durable webhook job queue, rotating replay controls, session/wallet ownership tests, encrypted OAuth refresh tokens, wallet proof nonces, CSRF/PKCE state binding, token redaction, signed request validation and recovery exercises are required.
