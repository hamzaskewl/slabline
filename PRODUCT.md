# Collectible Markets

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Bun, strict TypeScript, Next.js App Router, Tailwind, shadcn/ui, tRPC, Zod, TanStack Query, Drizzle, PostgreSQL, Lightweight Charts, Railway. Explicitly selected by the user.

## Users and purpose

UBC 2026 hackathon visitors browse real prediction markets and see what an estimated winning payout could buy from a real collectible catalog. Account holders can eventually authorize separate trading, funding and collectible purchases.

## Capabilities and constraints

ARCHITECTURE.md is authoritative. Never fabricate execution, prices, ownership, bridge completion or shipping. Separate Gemini USD from Solana SOL/USDC. Default to simulated trades, with devnet onchain testing. Live financial actions require verified provider permissions and user approvals. Actual slab imagery comes only from provider metadata.

## Brand commitments

Original exchange interface under the name Collectible Markets. No implication of Gemini ownership or endorsement.

## Evidence on hand

User specification only at initialization. All integration verification must be recorded in docs/INTEGRATION_VERIFICATION.md.

## Product principles

Public data first. Explicit provenance. User-controlled funds. Recoverable partial success. Plain, truthful errors.
