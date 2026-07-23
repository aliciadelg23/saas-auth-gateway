# Architecture — saas-auth-gateway

This document describes the internal architecture of the platform. It is
opinionated on purpose: an IAM system is a security-critical piece of
infrastructure and every layer here exists to make bad code hard to
write and good code easy to review.

The stack is Node.js 22, Fastify, TypeScript strict, Prisma, and
PostgreSQL. Everything is containerized with Docker and orchestrated
locally via Docker Compose.

## 1. Design Goals

1. **Security by construction.** Authentication and authorization
   defaults deny access. Sensitive material is never logged.
2. **Deterministic boundaries.** Every module has one entry point, one
   exit point, and no implicit dependencies on siblings.
3. **Testability.** The domain layer is pure TypeScript with no
   framework imports; adapters live at the edges.
4. **Multi-tenant from day one.** A `tenantId` is a first-class
   parameter of every repository query.
5. **Operability.** Structured logs, traces, metrics, and audit trails
   are non-negotiable.

## 2. High-Level Layout

```text
saas-auth-gateway/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── main.ts                    # Composition root; boots the HTTP app
│   ├── app.ts                     # Fastify factory (no side effects)
│   │
│   ├── config/                    # Typed configuration loader
│   │   ├── env.ts
│   │   └── index.ts
│   │
│   ├── core/                      # Pure domain (no framework, no I/O)
│   │   ├── auth/
│   │   │   ├── entities/
│   │   │   ├── value-objects/
│   │   │   ├── errors/
│   │   │   └── ports/             # Repository & service interfaces
│   │   ├── tenants/
│   │   ├── rbac/
│   │   └── shared/                # Common value objects (Email, Password, Id)
│   │
│   ├── modules/                   # Feature slices (application layer)
│   │   ├── auth/
│   │   │   ├── application/       # Use cases / services
│   │   │   ├── http/              # Fastify routes, schemas, mappers
│   │   │   └── index.ts           # Module registration
│   │   ├── tenants/
│   │   ├── rbac/
│   │   ├── oauth/
│   │   └── admin/
│   │
│   ├── infra/                     # Adapters (framework, DB, external APIs)
│   │   ├── db/
│   │   │   ├── prisma-client.ts
│   │   │   └── repositories/      # Prisma-backed repositories
│   │   ├── crypto/                # Argon2, JWT, JWKS
│   │   ├── email/                 # SMTP / provider adapters
│   │   ├── cache/                 # Redis client
│   │   └── http/
│   │       ├── plugins/           # helmet, cors, rate-limit, sensible
│   │       ├── hooks/             # authn, tenant resolver, request-id
│   │       └── errors/            # HTTP error mapper
│   │
│   ├── container.ts               # Dependency-injection wiring
│   └── types/                     # Ambient / cross-cutting types
│
├── test/
│   ├── unit/
│   ├── integration/               # Boots real Postgres via Testcontainers
│   └── e2e/                       # HTTP-level tests against the running app
│
├── docker/
│   ├── Dockerfile
│   └── entrypoint.sh
│
├── docker-compose.yml
├── .github/workflows/ci.yml
├── package.json
├── tsconfig.json
└── ...
```

## 3. Layered Design

The codebase follows a Ports & Adapters (a.k.a. Hexagonal) layout with
three logical rings.

### 3.1 `core/` — Domain

- Pure TypeScript. No `fastify`, no `@prisma/client`, no `process.env`.
- Contains entities, value objects, invariants, and **ports** (interfaces).
- Ports name the capabilities the domain requires: `UserRepository`,
  `PasswordHasher`, `Clock`, `TokenIssuer`. Adapters implement them.
- Errors are domain errors (`InvalidCredentialsError`,
  `TenantNotFoundError`), never HTTP errors.

### 3.2 `modules/` — Application

- Feature-oriented slices. Each slice owns its use cases and HTTP
  surface for that feature.
- Application services orchestrate ports from `core/`.
- HTTP routes are thin: parse and validate the request, invoke the
  service, map the result to an HTTP response.
- Cross-slice communication happens only through domain events (via an
  event bus) or through explicit application-service calls — never
  through direct database access.

### 3.3 `infra/` — Adapters

- Every port defined in `core/` has exactly one implementation here per
  environment (production, tests may substitute).
- Framework plumbing lives here: Fastify plugins, hooks, error mappers,
  Prisma repositories, Redis clients, SMTP transports.
- Anything that touches the outside world (network, disk, clock,
  randomness) is an adapter and must be injected.

## 4. Repository Pattern

Repositories are the only door to persistence. The contract is:

```typescript
export interface UserRepository {
  findById(tenantId: TenantId, id: UserId): Promise<User | null>
  findByEmail(tenantId: TenantId, email: Email): Promise<User | null>
  create(user: User): Promise<User>
  update(user: User): Promise<User>
  softDelete(tenantId: TenantId, id: UserId): Promise<void>
}
```

Rules:

- Every method that reads or writes tenant-owned data **takes a
  `tenantId` as its first argument**. This is enforced by the interface,
  not by convention. Cross-tenant queries live in dedicated admin-only
  repositories.
- Repositories return domain entities, never Prisma models. A mapper
  converts between the two at the boundary.
- Repositories never leak query builders. Complex reads become named
  query methods (`findActiveWithMfaEnrolled`).
- Transactions are exposed via a `UnitOfWork` port so application
  services can compose multi-repository writes without knowing about
  Prisma.

## 5. Service Layer

Application services encode use cases. Each use case is a class with a
single `execute` method and constructor-injected dependencies.

```typescript
export class LoginWithPassword {
  constructor(
    private readonly users: UserRepository,
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
    private readonly clock: Clock,
    private readonly audit: AuditSink,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    /* ... */
  }
}
```

Rules:

- Services depend only on ports, never on concrete adapters.
- Services are transactional units: either all side effects commit or
  none do (via `UnitOfWork`).
- Services emit domain events on success (`UserLoggedIn`,
  `PasswordChanged`) which the audit sink and webhook dispatcher
  subscribe to.
- Services never format HTTP responses — that is the route handler's
  job.

## 6. Dependency Injection

Dependency wiring is centralized in `src/container.ts`. The container
is a thin factory function, not a framework, because:

- It is trivial to test (`buildContainer({ overrides })`).
- It has zero runtime magic — every dependency is explicit.
- It avoids decorator-based DI which requires `reflect-metadata` and
  couples the domain to TypeScript emit settings.

Sketch:

```typescript
export function buildContainer(env: Env) {
  const prisma = new PrismaClient(/* ... */)
  const clock: Clock = new SystemClock()
  const hasher: PasswordHasher = new Argon2Hasher(env.PASSWORD_PEPPER)

  const users: UserRepository = new PrismaUserRepository(prisma)
  const tokens: TokenIssuer = new JwtTokenIssuer(env.JWT_PRIVATE_KEY)

  const loginUseCase = new LoginWithPassword(users, credentials, hasher, tokens, clock, audit)

  return { prisma, loginUseCase /* ... */ }
}
```

Fastify then registers a decorator that exposes the container to each
route via `request.container`.

## 7. Authentication Strategy

- **Primary bearer credential.** Access tokens are JWTs signed with
  RS256. Private keys live in a KMS in production and in an
  environment-injected PEM locally.
- **Refresh tokens** are opaque, high-entropy strings stored hashed in
  Postgres. Each refresh rotates the token and invalidates the previous
  one. Detected reuse of a rotated refresh token revokes the entire
  session family (breach signal).
- **Session model.** Each login creates a `Session` row with device
  fingerprint, IP, and user-agent. `Session.familyId` groups the
  rotating refresh tokens.
- **Token claims.** `iss`, `sub`, `aud`, `exp`, `iat`, `jti`, plus
  `tenant_id`, `session_id`, and `scope`. No PII beyond the subject id.
- **JWKS.** Public keys are exposed at
  `/.well-known/jwks.json`. Keys rotate on a schedule; old keys stay
  published for the tail of their token lifetime.
- **MFA.** TOTP (RFC 6238) and WebAuthn/Passkeys. Step-up
  authentication is expressed as an `acr` claim in the token.
- **Passwords.** Argon2id with a server-wide pepper and per-user salt.
  Cost parameters are tuned to at least 500 ms on the target hardware.

## 8. Authorization Strategy (RBAC + optional ABAC)

- **Deny by default.** No permission check means no access. Every
  protected route calls the permission service explicitly; there is no
  "trust the JWT scope" shortcut.
- **Model.**
  - `Permission` is a fine-grained verb over a resource:
    `users.read`, `users.create`, `tenants.settings.write`.
  - `Role` is a named bundle of permissions, scoped to a tenant.
  - `RoleAssignment` binds a subject (user or service account) to a
    role, optionally further scoped to an organization, team, or
    resource id.
- **Evaluation.** A single `PermissionService.can(subject, action,
resource)` call is the only entry point. It returns a decision plus
  the reason (matched role, matched policy, deny cause) — the reason
  is logged, not returned to the client.
- **ABAC extension.** For conditions that go beyond membership
  ("only during business hours", "only same-region tenants"), a small
  condition DSL evaluates attributes attached to the subject, action,
  and resource. It is expressed as JSON (CEL-inspired) and compiled at
  load time.
- **PDP surface.** Internal callers use the in-process function.
  External services get an HTTP endpoint (`POST /v1/authz/check`) that
  returns the same decision.

## 9. Multi-Tenant Strategy

The default posture is **shared database, shared schema, row-level
isolation** — the sweet spot between operational cost and blast radius
for a SaaS at this scale.

- Every tenant-owned table carries a non-nullable `tenantId` FK to
  `Tenant`.
- The domain-layer `TenantId` value object cannot be constructed from
  an untrusted string; it is minted at the tenant-resolver boundary and
  flows through the request as a typed value.
- Repositories accept `TenantId` as an explicit parameter. A lint rule
  and a code review checklist reject tenant-scoped repository methods
  that lack this parameter.
- The tenant is resolved at the edge from one of, in order: (a) a
  validated host header (`tenant.example.com`), (b) a header
  (`X-Tenant-Id`) signed by the caller when using an M2M token,
  (c) the `tenant_id` claim on the access token.
- Cross-tenant access is only possible through a dedicated "platform
  admin" role, and every such request is annotated in the audit log
  with `platform_admin_action=true`.
- **Escape hatches.** A tenant may be promoted to a dedicated schema
  (or database) without code changes: the repository is keyed by
  tenant, and a routing layer picks the datasource. This is a
  Milestone 14+ concern.

## 10. Configuration & Secrets

- All configuration flows through `src/config/env.ts`, which validates
  at boot with `zod`. The app refuses to start if a required variable
  is missing or malformed.
- Secrets are never logged. The env schema tags secret keys and the
  logger's serializer redacts them.
- Local development uses `.env` (gitignored) with a documented
  `.env.example`.

## 11. Observability

- **Logging.** `pino` with a JSON serializer, correlation IDs via
  `@fastify/request-context`, and a redaction list.
- **Tracing.** OpenTelemetry auto-instrumentation for Fastify, Prisma,
  and outbound HTTP. Spans carry `tenant.id`, `user.id`, and
  `session.id` as attributes.
- **Metrics.** Prometheus-compatible `/metrics` endpoint. Counters for
  auth outcomes, latency histograms per route, and gauges for active
  sessions.
- **Health.** `/health/live` (process up) and `/health/ready` (DB
  reachable, migrations applied).
- **Audit.** Every state-changing use case emits an `AuditEvent` that
  the audit sink persists in an append-only table.

## 12. Testing Strategy

- **Unit tests** exercise domain and application layers with in-memory
  fakes for every port.
- **Integration tests** boot a real Postgres via Testcontainers and
  run repositories and use cases end-to-end.
- **HTTP tests** boot the Fastify app in-process and drive it with
  `light-my-request`. They cover route wiring, validation, and error
  mapping.
- **Contract tests** freeze the OpenAPI surface; a schema drift breaks
  CI.
- Coverage target: 85% on `core/` and `modules/`, 70% overall.

## 13. Error Handling

- Domain errors extend a `DomainError` base. Each has a stable code
  (`AUTH_INVALID_CREDENTIALS`) and a human message that is safe to
  return.
- A Fastify `setErrorHandler` maps domain errors to HTTP responses.
  Unknown errors return a generic 500 and are logged with the full
  stack.
- Validation errors from `zod` schemas surface as 400 responses with a
  machine-readable list of field violations.

## 14. Release & Compatibility

- Semantic versioning; breaking changes to the public API require a
  major bump.
- The API surface is versioned in the URL (`/v1/`). A `/v2/` may be
  introduced without deleting `/v1/`.
- Migrations are backward-compatible for at least one release cycle
  (expand/contract pattern).
- Container images are pinned by digest in production manifests.

## 15. Non-Goals (for now)

- No custom crypto — we use audited libraries only.
- No home-grown password rules beyond length + breach check.
- No graph database. RBAC/ABAC is expressible in Postgres for the size
  of the target deployments.
- No monorepo. If a second deployable emerges we revisit.

## 16. Implementation status (post-Milestone 4)

The Fastify + Prisma implementation currently mirrors the design as
follows.

### 16.1 Layout, as built

```text
src/
├── config/                     # Zod-validated env loader
├── core/                       # Pure domain — no framework, no I/O
│   ├── auth/                   # Tenant + user + session + refresh
│   │   ├── entities.ts
│   │   ├── errors.ts
│   │   └── ports.ts
│   ├── rbac/
│   │   ├── entities.ts
│   │   ├── errors.ts
│   │   ├── permissions.ts      # Catalog + system-role definitions
│   │   └── ports.ts
│   ├── api-keys/
│   │   ├── entities.ts
│   │   ├── errors.ts
│   │   └── ports.ts
│   ├── audit/
│   │   ├── entities.ts         # AuditEvent + AUDIT_ACTIONS catalog
│   │   └── ports.ts
│   └── shared/
│       ├── clock.ts
│       ├── email.ts
│       ├── errors.ts
│       ├── pagination.ts
│       ├── page-builder.ts     # cursorWhere + buildPage helpers
│       ├── principal.ts
│       └── tenant-scope.ts     # assertTenantAccess
├── infra/
│   ├── audit/                  # PrismaAuditSink + NoopAuditSink
│   ├── crypto/                 # argon2, jose JWT, HMAC refresh, HMAC api key
│   ├── db/
│   │   ├── prisma-client.ts    # Fastify plugin
│   │   └── repositories/       # tenant, user, credential, session,
│   │                           # refresh-token, role, user-role,
│   │                           # api-key, audit-log
│   ├── http/
│   │   ├── errors/             # setErrorHandler mapper
│   │   ├── hooks/              # authenticate + requirePermission
│   │   └── plugins/            # security, swagger, validation, health
│   └── logging/                # Pino config with redaction list
├── modules/
│   ├── auth/                   # register, login, refresh, logout
│   ├── rbac/                   # create/list/assign/unassign role
│   ├── api-keys/               # create, list, revoke, hydrate
│   ├── audit/                  # list with filters
│   └── dashboard/              # tenant overview
├── container.ts                # Composition root
├── app.ts
└── main.ts
```

### 16.2 RBAC

- Permissions are string constants declared in
  `core/rbac/permissions.ts` (`iam.<resource>.<verb>`). This catalog
  is exposed publicly at `GET /v1/permissions` for admin UIs.
- `Role` is tenant-scoped; the `(tenantId, name)` composite is
  unique. A role owns a set of permissions through the
  `role_permissions` join.
- `UserRole` binds a user to a role; a user's effective permission
  set is the union of every role they hold in the tenant.
- `RbacPermissionEvaluator` implements `PermissionEvaluator.userCan`
  by loading distinct permissions across a user's roles in one
  query. Denials propagate as `PermissionDeniedError` (403 with
  code `PERMISSION_DENIED`).
- System roles (`owner`, `admin`, `member`) are seeded per tenant
  by `pnpm prisma:seed` and marked `isSystem=true`. The seed is
  idempotent — permissions get replaced on rerun.

### 16.3 API keys

- Token format: `sag_<hex-prefix>_<base64url-secret>`. Using hex for
  the prefix guarantees the `_` separator never collides with a
  base64url character inside the prefix.
- Storage keeps the public `prefix` (indexed unique) plus
  `tokenHash = HMAC-SHA256(secret, plaintext)`. The plaintext is
  handed to the caller exactly once at creation.
- Each key has a `scopes: string[]` list. When a request presents a
  key, `authenticate` looks it up by prefix, verifies the HMAC,
  checks expiry + revocation, and fires an async `lastUsedAt`
  touch. `requirePermission` then checks the scope list directly —
  there is no role indirection for machine identities.
- Compromise recovery: `DELETE /v1/tenants/:tenantId/api-keys/:id`
  sets `revokedAt`; subsequent requests get `401
  INVALID_API_KEY`. The audit trail preserves the deletion.

### 16.4 Audit trail

- `AuditSink.record` is fire-and-forget: it catches persistence
  errors and logs a warning instead of throwing. A broken audit
  trail must never block the auth flow it is documenting.
- Use cases emit stable action strings from `AUDIT_ACTIONS`
  (`auth.user.registered`, `auth.user.logged_in`,
  `auth.user.login_failed`, `auth.refresh_token.rotated`,
  `auth.refresh_token.reuse_detected`, `auth.session.revoked`,
  `iam.role.created`, `iam.role.assigned`, …). Login failures are
  recorded with `outcome=failure` so brute-force patterns surface
  in the audit log without extra machinery.
- Reads go through `GET /v1/tenants/:tenantId/audit-logs`, which
  supports `action`, `actorId`, `resourceType`, `resourceId`,
  `outcome`, `since`, `until` filters and cursor pagination keyed
  on `(createdAt DESC, id DESC)`.

### 16.5 Pagination

- Cursor payload is the base64url-encoded JSON `{ createdAt, id }`
  of the last row. Rows sort by `createdAt DESC, id DESC` so ties
  break deterministically.
- `core/shared/page-builder.ts` centralizes the `cursorWhere` clause
  and the `buildPage` mapper so every list repository shares one
  implementation. Adding a new listable aggregate means declaring
  the domain shape + wiring the mapper.

### 16.6 Authentication pipeline

- The route pre-handler `authenticate` accepts:
  - `Authorization: Bearer <JWT>` — verifies signature + issuer +
    audience, then checks the associated session is neither
    revoked nor expired.
  - `Authorization: Bearer sag_...` (or `X-API-Key: sag_...`) —
    parses the API key, HMACs the plaintext, verifies the hash
    matches the stored value, checks expiry + revocation, and
    asynchronously touches `lastUsedAt`.
- The narrowed `Principal` (`user` or `api-key`) attaches to the
  Fastify request via a typed decoration.
- `requirePermission(action)` is a factory that returns a
  pre-handler enforcing the given permission for the current
  principal. Users dispatch to `PermissionEvaluator`; API keys
  dispatch to the embedded scope list.

### 16.7 Tenant scoping

Every tenant-scoped route runs `assertTenantAccess(principal,
req.params.tenantId)` before touching a repository. This is the
last line of defense against a valid credential trying to reach
another tenant's data. It sits in `core/shared/tenant-scope.ts` so
the check is unambiguous and reusable across modules.

### 16.8 Dashboard

`GetDashboardOverview` fires five counts (users, active users,
roles, live API keys, active sessions) and a recent-audit-events
select in a single `Promise.all`, so the admin UI can render its
landing page in one round-trip.
