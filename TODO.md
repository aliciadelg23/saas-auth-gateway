# saas-auth-gateway — Roadmap

Production-grade Identity & Access Management (IAM) platform inspired by
Auth0, Clerk, Keycloak, and AWS Cognito. Delivered incrementally across
milestones; each milestone leaves the system deployable and testable.

Legend: `[ ]` pending · `[~]` in progress · `[x]` done.

---

## Milestone 1 — Project Foundation

- [x] Initialize repository (`saas-auth-gateway`)
- [x] Configure Node.js 22 + pnpm + TypeScript strict
- [x] Configure ESLint + Prettier + EditorConfig
- [x] Configure Husky + lint-staged (pre-commit hooks)
- [x] Configure Docker + Docker Compose (Postgres + app)
- [x] Configure Prisma with baseline schema
- [x] Configure GitHub Actions CI (lint, typecheck, build, test)
- [x] Create `TODO.md` and `ARCHITECTURE.md`
- [x] Bootstrap Fastify server with health endpoint
- [x] Verify build and boot in Docker

## Milestone 2 — Domain Model & Persistence

- [ ] Prisma schema: `Tenant`, `User`, `Credential`, `Session`, `Role`,
      `Permission`, `RoleAssignment`, `RefreshToken`, `AuditLog`,
      `EmailVerificationToken`, `PasswordResetToken`, `OAuthAccount`,
      `ApiKey`, `WebhookEndpoint`, `WebhookDelivery`
- [ ] Baseline migration + seed script
- [ ] Repository interfaces for every aggregate
- [ ] Prisma-backed repository implementations
- [ ] Transaction boundaries + Unit of Work abstraction
- [ ] Soft-delete convention + `deletedAt` filtering
- [ ] Multi-tenant discriminator column enforced at repository layer

## Milestone 3 — Core Authentication (Password-based)

- [ ] User registration (`POST /v1/auth/register`)
- [ ] Password hashing with Argon2id + pepper
- [ ] Password policy (length, breach check via k-anonymity — optional)
- [ ] Login with credentials (`POST /v1/auth/login`)
- [ ] Access token (JWT, RS256) + refresh token (opaque, rotating)
- [ ] Token introspection endpoint (`POST /v1/oauth/introspect`)
- [ ] Logout + refresh-token revocation
- [ ] Rate limiting per IP + per user
- [ ] Brute-force lockout with exponential backoff
- [ ] Email verification flow (token issuance + confirmation)
- [ ] Password reset flow (request + confirm)
- [ ] Session management (list, revoke by id, revoke all)

## Milestone 4 — Multi-Factor Authentication (MFA)

- [ ] TOTP enrollment (RFC 6238) with backup codes
- [ ] WebAuthn / Passkeys registration + assertion (FIDO2)
- [ ] Recovery codes (single-use)
- [ ] Step-up authentication for sensitive operations
- [ ] MFA challenge endpoint

## Milestone 5 — OAuth 2.1 & OIDC Provider

- [ ] Authorization Code + PKCE flow
- [ ] Client Credentials flow
- [ ] Refresh Token flow with rotation
- [ ] Device Authorization Grant (RFC 8628)
- [ ] `/.well-known/openid-configuration` discovery
- [ ] JWKS endpoint with key rotation
- [ ] ID Token issuance (OIDC)
- [ ] `/userinfo` endpoint
- [ ] Consent screen (server-rendered minimal UI)
- [ ] Client registration (`POST /v1/oauth/clients`)
- [ ] Dynamic Client Registration (RFC 7591) — optional

## Milestone 6 — Social Login / Federated Identity

- [ ] Google (OIDC)
- [ ] GitHub (OAuth 2)
- [ ] Microsoft (OIDC)
- [ ] Generic OIDC connector
- [ ] Account linking (link/unlink external identities)
- [ ] Just-in-time provisioning

## Milestone 7 — RBAC & Fine-Grained Authorization

- [ ] Role and Permission CRUD
- [ ] Role assignment to users (scoped by tenant + optional resource)
- [ ] Permission evaluation service (deny by default)
- [ ] Policy decision point exposed as gRPC-optional / HTTP
- [ ] Attribute-Based Access Control (ABAC) extension — condition DSL
- [ ] `/v1/authz/check` bulk-check endpoint

## Milestone 8 — Multi-Tenancy

- [ ] Tenant provisioning API
- [ ] Tenant subdomain routing (host-based tenant resolver)
- [ ] Tenant-scoped configuration (branding, allowed IdPs, policies)
- [ ] Row-level isolation via `tenantId` guard middleware
- [ ] Tenant admin roles + invitation flow

## Milestone 9 — Organizations, Teams, and Invitations

- [ ] Organizations (a tenant may host many organizations)
- [ ] Team membership + hierarchical roles
- [ ] Invitation tokens with expiry
- [ ] SCIM 2.0 endpoints — user provisioning (optional)

## Milestone 10 — API Keys, M2M, and Personal Access Tokens

- [ ] Personal Access Tokens (PATs) with scopes
- [ ] Machine-to-Machine API keys (scoped, rotatable)
- [ ] Signed request verification (HMAC or OAuth 2 client credentials)

## Milestone 11 — Webhooks & Event Bus

- [ ] Domain events emitted for auth lifecycle
- [ ] Webhook endpoint registration
- [ ] Signed delivery + retries with exponential backoff
- [ ] Dead-letter queue + delivery introspection

## Milestone 12 — Audit, Observability, and Compliance

- [ ] Structured audit log for every mutation
- [ ] OpenTelemetry traces + metrics
- [ ] Prometheus `/metrics` endpoint
- [ ] Log correlation IDs propagated across requests
- [ ] Health, readiness, and liveness probes
- [ ] Data export (GDPR — user data portability)
- [ ] Data erasure (GDPR — right to be forgotten)

## Milestone 13 — Admin Console (API-first, minimal UI)

- [ ] Admin API surface (users, tenants, roles, audit search)
- [ ] Server-rendered admin console (HTMX-style minimal, optional)
- [ ] Read-only impersonation with mandatory audit trail

## Milestone 14 — Hardening & Performance

- [ ] CSRF protection for cookie-authenticated flows
- [ ] CSP + HSTS + security headers via `@fastify/helmet`
- [ ] Redis-backed rate limiter + token cache
- [ ] Load test suite (k6) with SLO targets
- [ ] Zero-downtime migration playbook
- [ ] Chaos test for token revocation propagation

## Milestone 15 — Release Engineering

- [ ] Semantic-release + changelog automation
- [ ] Signed container images
- [ ] SBOM generation
- [ ] Terraform module for reference deployment (optional)
- [ ] Public API reference documentation (OpenAPI 3.1)
