# Collectible Markets

UBC 2026 hackathon prototype. Source of truth: [ARCHITECTURE.md](ARCHITECTURE.md).

Public market discovery, Gemini WebSocket books through SSE, exact depth estimates, actual slab catalog images, separate Phygitals packs, cart planning and explicitly simulated positions are implemented. The dark discovery interface follows the user's Gemini/Polymarket references. No end-to-end live purchase or funding is claimed.

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

Identity configuration: [docs/IDENTITY_SETUP.md](docs/IDENTITY_SETUP.md). Integration evidence and exact blockers: [docs/INTEGRATION_VERIFICATION.md](docs/INTEGRATION_VERIFICATION.md). Railway settings: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Security boundaries: [docs/SECURITY.md](docs/SECURITY.md).

The app remains useful without credentials. It reports provider outages and unknown FMV/fees rather than inventing data. Practice is a named fixture selected explicitly, never an automatic live-data fallback.
