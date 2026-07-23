import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { loadEnv, type Env } from '../../src/config/index.js'
import { buildContainer, type AppContainer } from '../../src/container.js'
import { PERMISSIONS, SYSTEM_ROLES } from '../../src/core/rbac/permissions.js'
import {
  makeTestPrismaClient,
  requireTestDatabase,
  resetDatabase,
} from '../support/test-prisma.js'

const TENANT_SLUG = 'acme-authz'
const OWNER_EMAIL = 'owner@acme.test'
const OWNER_PASSWORD = 'Owner-Password-1!'

async function bootstrapTenantWithOwner(container: AppContainer): Promise<{
  tenantId: string
  ownerId: string
  ownerRoleId: string
}> {
  const tenant = await container.repositories.tenants.create({
    slug: TENANT_SLUG,
    name: 'Acme Authz',
  })
  const ownerRole = await container.repositories.roles.create({
    tenantId: tenant.id,
    name: SYSTEM_ROLES.owner,
    description: 'System role: owner',
    isSystem: true,
    permissions: Object.values(PERMISSIONS).flatMap((group) => Object.values(group)),
  })
  const registration = await container.useCases.registerUser.execute({
    tenantSlug: TENANT_SLUG,
    email: OWNER_EMAIL,
    password: OWNER_PASSWORD,
    displayName: 'Acme Owner',
  })
  await container.repositories.userRoles.assign({
    userId: registration.userId,
    roleId: ownerRole.id,
    grantedBy: null,
  })
  return { tenantId: tenant.id, ownerId: registration.userId, ownerRoleId: ownerRole.id }
}

describe('rbac + api keys + audit + dashboard', () => {
  let app: FastifyInstance
  let container: AppContainer
  let env: Env
  let ctx: { tenantId: string; ownerId: string; ownerRoleId: string; accessToken: string }

  beforeAll(async () => {
    requireTestDatabase()
    env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'false',
      RATE_LIMIT_MAX: '10000',
    })
    const prisma = makeTestPrismaClient(env)
    container = buildContainer(env, { prisma })
    app = await buildApp({ env, container })
  })

  beforeEach(async () => {
    await resetDatabase(container.prisma)
    const bootstrap = await bootstrapTenantWithOwner(container)
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { tenantSlug: TENANT_SLUG, email: OWNER_EMAIL, password: OWNER_PASSWORD },
    })
    const body = login.json() as { accessToken: string }
    ctx = { ...bootstrap, accessToken: body.accessToken }
  })

  afterAll(async () => {
    await app.close()
  })

  it('rejects unauthenticated requests to protected routes', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${ctx.tenantId}/roles`,
    })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: { code: 'UNAUTHORIZED' } })
  })

  it('rejects users lacking the required permission', async () => {
    const guestRole = await container.repositories.roles.create({
      tenantId: ctx.tenantId,
      name: 'guest',
      description: null,
      isSystem: false,
      permissions: [PERMISSIONS.dashboard.read],
    })
    const guest = await container.useCases.registerUser.execute({
      tenantSlug: TENANT_SLUG,
      email: 'guest@acme.test',
      password: 'GuestPass-1!',
    })
    await container.repositories.userRoles.assign({
      userId: guest.userId,
      roleId: guestRole.id,
      grantedBy: null,
    })
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { tenantSlug: TENANT_SLUG, email: 'guest@acme.test', password: 'GuestPass-1!' },
    })
    const { accessToken } = login.json() as { accessToken: string }
    const res = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${ctx.tenantId}/roles`,
      headers: { authorization: `Bearer ${accessToken}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: { code: 'PERMISSION_DENIED' } })
  })

  it('creates, lists, assigns, and unassigns a role', async () => {
    const create = await app.inject({
      method: 'POST',
      url: `/v1/tenants/${ctx.tenantId}/roles`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
      payload: {
        name: 'auditor',
        description: 'read-only auditor',
        permissions: [PERMISSIONS.audit.read, PERMISSIONS.dashboard.read],
      },
    })
    expect(create.statusCode).toBe(201)
    const created = create.json() as { id: string; permissions: string[] }
    expect(created.permissions).toEqual(
      expect.arrayContaining([PERMISSIONS.audit.read, PERMISSIONS.dashboard.read]),
    )

    const list = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${ctx.tenantId}/roles`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
    })
    expect(list.statusCode).toBe(200)
    const items = (list.json() as { items: { name: string }[] }).items.map((i) => i.name)
    expect(items).toContain('auditor')
    expect(items).toContain('owner')

    const bob = await container.useCases.registerUser.execute({
      tenantSlug: TENANT_SLUG,
      email: 'bob@acme.test',
      password: 'BobPass-1!',
    })
    const assign = await app.inject({
      method: 'POST',
      url: `/v1/tenants/${ctx.tenantId}/users/${bob.userId}/roles/${created.id}`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
    })
    expect(assign.statusCode).toBe(204)

    const unassign = await app.inject({
      method: 'DELETE',
      url: `/v1/tenants/${ctx.tenantId}/users/${bob.userId}/roles/${created.id}`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
    })
    expect(unassign.statusCode).toBe(204)
  })

  it('rejects role creation with an unknown permission', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/v1/tenants/${ctx.tenantId}/roles`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
      payload: {
        name: 'weird',
        permissions: ['not.a.real.permission'],
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: { code: 'UNKNOWN_PERMISSION' } })
  })

  it('mints an API key, authenticates with it, then revokes it', async () => {
    const create = await app.inject({
      method: 'POST',
      url: `/v1/tenants/${ctx.tenantId}/api-keys`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
      payload: {
        name: 'ci-runner',
        scopes: [PERMISSIONS.dashboard.read, PERMISSIONS.audit.read],
      },
    })
    expect(create.statusCode).toBe(201)
    const key = create.json() as { id: string; plaintext: string; prefix: string }
    expect(key.plaintext).toMatch(/^sag_/)

    const dashboard = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${ctx.tenantId}/dashboard/overview`,
      headers: { authorization: `Bearer ${key.plaintext}` },
    })
    expect(dashboard.statusCode).toBe(200)
    const body = dashboard.json() as { counts: { users: number } }
    expect(body.counts.users).toBeGreaterThanOrEqual(1)

    const revoke = await app.inject({
      method: 'DELETE',
      url: `/v1/tenants/${ctx.tenantId}/api-keys/${key.id}`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
    })
    expect(revoke.statusCode).toBe(204)

    const rejected = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${ctx.tenantId}/dashboard/overview`,
      headers: { authorization: `Bearer ${key.plaintext}` },
    })
    expect(rejected.statusCode).toBe(401)
  })

  it('rejects API keys that lack the required scope', async () => {
    const create = await app.inject({
      method: 'POST',
      url: `/v1/tenants/${ctx.tenantId}/api-keys`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
      payload: { name: 'narrow-key', scopes: [PERMISSIONS.dashboard.read] },
    })
    const { plaintext } = create.json() as { plaintext: string }

    const rejected = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${ctx.tenantId}/audit-logs`,
      headers: { authorization: `Bearer ${plaintext}` },
    })
    expect(rejected.statusCode).toBe(403)
    expect(rejected.json()).toMatchObject({ error: { code: 'PERMISSION_DENIED' } })
  })

  it('queries audit logs with filters and pagination', async () => {
    // Emit several audit events through real flows.
    await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        tenantSlug: TENANT_SLUG,
        email: OWNER_EMAIL,
        password: 'wrong-password',
      },
    })
    await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        tenantSlug: TENANT_SLUG,
        email: OWNER_EMAIL,
        password: OWNER_PASSWORD,
      },
    })

    const all = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${ctx.tenantId}/audit-logs`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
    })
    expect(all.statusCode).toBe(200)
    const body = all.json() as { items: { action: string; outcome: string }[] }
    expect(body.items.length).toBeGreaterThan(0)

    const failuresOnly = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${ctx.tenantId}/audit-logs?outcome=failure`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
    })
    const failures = (failuresOnly.json() as { items: { outcome: string }[] }).items
    expect(failures.length).toBeGreaterThan(0)
    for (const item of failures) expect(item.outcome).toBe('failure')

    const paged = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${ctx.tenantId}/audit-logs?limit=1`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
    })
    const pagedBody = paged.json() as { items: unknown[]; nextCursor: string | null }
    expect(pagedBody.items).toHaveLength(1)
    expect(pagedBody.nextCursor).toBeTruthy()
  })

  it('returns dashboard overview with counts and recent activity', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${ctx.tenantId}/dashboard/overview`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      tenantId: string
      counts: { users: number; activeSessions: number; roles: number }
      recentAuditEvents: unknown[]
    }
    expect(body.tenantId).toBe(ctx.tenantId)
    expect(body.counts.users).toBe(1)
    expect(body.counts.activeSessions).toBeGreaterThanOrEqual(1)
    expect(body.counts.roles).toBeGreaterThanOrEqual(1)
  })

  it('rejects cross-tenant access even for a valid user', async () => {
    const otherTenant = await container.repositories.tenants.create({
      slug: 'other-tenant',
      name: 'Other',
    })
    const res = await app.inject({
      method: 'GET',
      url: `/v1/tenants/${otherTenant.id}/dashboard/overview`,
      headers: { authorization: `Bearer ${ctx.accessToken}` },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })
  })

  it('exposes the permission catalog', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/permissions' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { permissions: string[] }
    expect(body.permissions).toContain(PERMISSIONS.roles.read)
    expect(body.permissions).toContain(PERMISSIONS.audit.read)
  })
})
