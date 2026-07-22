# saas-auth-gateway

Identity & Access Management (IAM) platform inspired by Auth0, Clerk,
Keycloak, and AWS Cognito. Built with Node.js 22, Fastify, TypeScript
(strict), Prisma, and PostgreSQL.

Status: **Phase 1 — foundation.** See [`TODO.md`](./TODO.md) for the
roadmap and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the design.

## Requirements

- Node.js `22.x`
- pnpm `>=9`
- Docker + Docker Compose

## Quick start

```bash
# Install dependencies
pnpm install

# Copy env template
cp .env.example .env

# Boot Postgres via Docker
docker compose up -d postgres

# Generate Prisma client
pnpm prisma:generate

# Start the dev server
pnpm dev
```

The server listens on `http://localhost:3000` and exposes:

- `GET /` — service metadata
- `GET /health/live` — liveness probe
- `GET /health/ready` — readiness probe

## Scripts

| Command                   | Purpose                                   |
| ------------------------- | ----------------------------------------- |
| `pnpm dev`                | Run Fastify with hot reload (`tsx watch`) |
| `pnpm build`              | Compile TypeScript to `dist/`             |
| `pnpm start`              | Run the compiled server                   |
| `pnpm typecheck`          | `tsc --noEmit`                            |
| `pnpm lint`               | ESLint (zero warnings)                    |
| `pnpm format`             | Prettier write                            |
| `pnpm test`               | Vitest run                                |
| `pnpm test:coverage`      | Vitest with coverage thresholds           |
| `pnpm prisma:generate`    | Regenerate the Prisma client              |
| `pnpm prisma:migrate:dev` | Apply migrations in development           |

## Docker

```bash
docker compose up --build
```

Brings up PostgreSQL and the application on ports `5432` and `3000`.

## License

UNLICENSED — for portfolio purposes.
