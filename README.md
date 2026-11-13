# Collectible Markets

UBC 2026 hackathon prototype. Source of truth: [ARCHITECTURE.md](ARCHITECTURE.md).

Implementation is in progress. Public market/catalog reads and simulated trading are separate from permission-gated financial integrations. No end-to-end live purchase or funding is claimed.

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

## Checkpoints

Every major implementation step is a branch and pull request, checked before merge. GitHub Actions runs type checking, tests and a production build.
