# saas-auth-gateway

Production-grade Identity & Access Management (IAM) platform inspired by
Auth0, Clerk, Keycloak, and AWS Cognito. Built with Node.js 22,
Fastify, TypeScript strict, Prisma, and PostgreSQL 16.

Status: **Phases 1–4 shipped** — foundation, authentication, RBAC,
API keys, audit trail, and dashboard. See [`TODO.md`](./TODO.md) for
the full roadmap and [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the
design rationale.

## Feature summary

- **Authentication.** E-mail + password with Argon2id (OWASP 2024
  parameters + server-wide pepper), RS256 access tokens (JWKS
  published at `/.well-known/jwks.json`), opaque refresh tokens
  stored as HMAC-SHA256, refresh-token rotation with reuse
  detection, and idempotent logout.
- **RBAC.** Tenant-scoped roles and a first-class permission
  catalog. `PermissionEvaluator` merges role permissions for a
  user; `requirePermission(action)` guards every mutating endpoint.
- **API keys.** Bearer tokens shaped as `sag_<prefix>_<secret>`.
  Only the HMAC-SHA256 fingerprint is stored; the plaintext is
  handed to the client exactly once at creation. Per-key scope
  list acts as its authorization envelope.
- **Audit trail.** Every write and every failed login lands in
  `audit_logs` with actor, action, resource, and structured
  metadata. Sink failures are swallowed so the audit trail can
  never block the primary auth flow.
- **Dashboard.** Tenant-scoped overview (users, active sessions,
  roles, API keys, recent audit events) in a single request.
- **Pagination + filters.** Cursor pagination (`?cursor=…&limit=…`)
  on every list endpoint, keyed on `(createdAt DESC, id DESC)` for
  deterministic ties. Audit-log listing accepts `action`,
  `actorId`, `resourceType`, `resourceId`, `outcome`, `since`,
  `until` filters.
- **Multi-tenant.** Every tenant-owned aggregate carries a
  non-nullable `tenantId`. HTTP routes reject principals that are
  scoped to a different tenant.
- **Observability.** Structured Pino logs with secret redaction,
  correlation ids on every request, and Prisma database probe on
  `/health/ready`.
- **Docs.** OpenAPI 3.1 generated from Zod schemas at `/docs`
  (Swagger UI) — every route contributes its request + response
  shape.

## Requirements

- Node.js `22.x` (pinned via `.nvmrc`)
- pnpm `>=9`
- Docker + Docker Compose (for local Postgres and the production
  image)

## Quick start

```bash
pnpm install
cp .env.example .env

# Boot Postgres locally
docker compose up -d postgres

# Apply migrations and seed a tenant + owner + system roles
pnpm prisma:migrate:deploy
pnpm prisma:seed

# Start the API
pnpm dev
```

The server listens on `http://localhost:3000`. Try:

```bash
curl http://localhost:3000/health/ready
curl http://localhost:3000/v1/permissions
open http://localhost:3000/docs   # OpenAPI + Swagger UI
```

Log in as the seeded admin (`admin@acme.test` / `ChangeMe!123`):

```bash
curl -X POST http://localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"tenantSlug":"acme","email":"admin@acme.test","password":"ChangeMe!123"}'
```

## Endpoint reference

Every endpoint returns JSON. Errors share the shape
`{"error": {"code": "STRING", "message": "…", "details": …, "requestId": "…"}}`.

### Public

- `GET /` — service metadata
- `GET /health/live` — liveness probe
- `GET /health/ready` — readiness probe (checks Postgres)
- `GET /.well-known/jwks.json` — JWKS for verifying access tokens
- `GET /v1/permissions` — permission catalog
- `GET /docs` — OpenAPI viewer (Swagger UI)

### Authentication

- `POST /v1/auth/register` — `{ tenantSlug, email, password, displayName? }`
- `POST /v1/auth/login` — returns access + refresh token pair
- `POST /v1/auth/refresh` — rotates the refresh token
- `POST /v1/auth/logout` — revokes the session + refresh family

### RBAC (require `iam.roles.*` permissions)

- `GET  /v1/tenants/:tenantId/roles`
- `POST /v1/tenants/:tenantId/roles`
- `POST /v1/tenants/:tenantId/users/:userId/roles/:roleId`
- `DELETE /v1/tenants/:tenantId/users/:userId/roles/:roleId`

### API keys (require `iam.api-keys.*` permissions)

- `GET    /v1/tenants/:tenantId/api-keys`
- `POST   /v1/tenants/:tenantId/api-keys`
- `GET    /v1/tenants/:tenantId/api-keys/:keyId`
- `DELETE /v1/tenants/:tenantId/api-keys/:keyId`

Authenticate a request with an API key by sending
`Authorization: Bearer sag_<prefix>_<secret>` (or `X-API-Key`).

### Audit & dashboard

- `GET /v1/tenants/:tenantId/audit-logs` (`iam.audit.read`)
- `GET /v1/tenants/:tenantId/dashboard/overview` (`iam.dashboard.read`)

## Permission catalog

| Permission                              | Notes                                     |
| --------------------------------------- | ----------------------------------------- |
| `iam.tenants.read` / `.write`           | Tenant metadata (admin-only surface, WIP) |
| `iam.users.read` / `.write` / `.delete` | User management (WIP)                     |
| `iam.roles.read` / `.write` / `.assign` | Role CRUD + assignments                   |
| `iam.api-keys.read` / `.write`          | API key lifecycle                         |
| `iam.audit.read`                        | Audit log listing                         |
| `iam.dashboard.read`                    | Dashboard overview                        |

System roles seeded per tenant:

- `owner` — every permission
- `admin` — everything except tenant mutation
- `member` — read-only baseline

## Scripts

| Command                             | Purpose                                    |
| ----------------------------------- | ------------------------------------------ |
| `pnpm dev`                          | Fastify with hot reload (`tsx watch`)      |
| `pnpm build`                        | Compile TypeScript to `dist/`              |
| `pnpm start`                        | Run the compiled server                    |
| `pnpm typecheck`                    | `tsc --noEmit`                             |
| `pnpm lint`                         | ESLint with zero warnings                  |
| `pnpm format` / `pnpm format:check` | Prettier                                   |
| `pnpm test` / `pnpm test:coverage`  | Vitest                                     |
| `pnpm prisma:generate`              | Regenerate the Prisma client               |
| `pnpm prisma:migrate:dev`           | Create + apply a migration                 |
| `pnpm prisma:migrate:deploy`        | Apply migrations (CI / prod)               |
| `pnpm prisma:seed`                  | Seed default tenant + system roles + admin |

## Docker

`docker-compose.yml` publishes Postgres on `5432` and the app on
`3000`. `docker/Dockerfile` is a multi-stage build (`deps` → `build`
→ `runtime`) that runs as a non-root `app` user and ships a
Node-based `HEALTHCHECK` against `/health/live`.

```bash
docker compose up --build
```

## CI

`.github/workflows/ci.yml` runs on every push and pull request to
`main`:

1. Installs dependencies via pnpm cache
2. Runs `prisma:generate` and `prisma:migrate:deploy` against a
   Postgres 16 service container
3. `format:check`, `lint`, `typecheck`, `build`, `test`
4. Docker image smoke build with layer cache

## Architecture at a glance

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full write-up.
Quick map:

```
src/
├── config/            # Zod-validated env loader
├── core/              # Pure domain — no I/O, no framework
│   ├── auth/          # Tenant + user + session + refresh contracts
│   ├── rbac/          # Roles, permissions catalog, evaluator port
│   ├── api-keys/      # ApiKey entity + minter contract
│   ├── audit/         # AuditEvent + sink contract
│   └── shared/        # Errors, Clock, Email, Principal, pagination
├── infra/             # Adapters
│   ├── crypto/        # Argon2, JWT (jose), HMAC refresh, HMAC api key
│   ├── db/            # Prisma client plugin + all repositories
│   ├── audit/         # Prisma-backed audit sink
│   ├── http/
│   │   ├── errors/    # Fastify error handler + domain-error mapper
│   │   ├── hooks/     # authenticate, requirePermission
│   │   └── plugins/   # security, validation, swagger, health
│   └── logging/       # Pino config with redaction
├── modules/           # Feature slices (application + http)
│   ├── auth/
│   ├── rbac/
│   ├── api-keys/
│   ├── audit/
│   └── dashboard/
├── container.ts       # Composition root
├── app.ts             # Fastify factory
└── main.ts            # Boot
```

## License

UNLICENSED — for portfolio purposes.
