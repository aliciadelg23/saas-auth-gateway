import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { loadEnv, type Env } from '../../src/config/index.js'
import { buildContainer, type AppContainer } from '../../src/container.js'
import { makeTestPrismaClient, requireTestDatabase, resetDatabase } from '../support/test-prisma.js'

const TENANT_SLUG = 'acme-test'
const USER_EMAIL = 'jane.doe@acme.test'
const USER_PASSWORD = 'S3cure-Password!'

describe('auth flows', () => {
  let app: FastifyInstance
  let container: AppContainer
  let env: Env

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
    await container.repositories.tenants.create({ slug: TENANT_SLUG, name: 'Acme Test' })
  })

  afterAll(async () => {
    await app.close()
  })

  async function register(overrides: Partial<{ email: string; password: string }> = {}) {
    return app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        tenantSlug: TENANT_SLUG,
        email: overrides.email ?? USER_EMAIL,
        password: overrides.password ?? USER_PASSWORD,
        displayName: 'Jane Doe',
      },
    })
  }

  async function login(overrides: Partial<{ email: string; password: string }> = {}) {
    return app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        tenantSlug: TENANT_SLUG,
        email: overrides.email ?? USER_EMAIL,
        password: overrides.password ?? USER_PASSWORD,
      },
    })
  }

  it('registers a new user in a tenant', async () => {
    const res = await register()
    expect(res.statusCode).toBe(201)
    const body = res.json() as { userId: string; tenantId: string; email: string }
    expect(body.email).toBe(USER_EMAIL)
    expect(body.userId).toMatch(/^[a-z0-9]+$/i)
  })

  it('rejects duplicate registration in the same tenant', async () => {
    await register()
    const res = await register()
    expect(res.statusCode).toBe(409)
    expect(res.json()).toMatchObject({ error: { code: 'USER_ALREADY_EXISTS' } })
  })

  it('rejects registration when tenant does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        tenantSlug: 'ghost-tenant',
        email: USER_EMAIL,
        password: USER_PASSWORD,
      },
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ error: { code: 'TENANT_NOT_FOUND' } })
  })

  it('logs in with valid credentials and mints an access + refresh token', async () => {
    await register()
    const res = await login()
    expect(res.statusCode).toBe(200)
    const body = res.json() as {
      accessToken: string
      refreshToken: string
      tokenType: string
      sessionId: string
    }
    expect(body.tokenType).toBe('Bearer')
    expect(body.accessToken.split('.').length).toBe(3)
    expect(body.refreshToken.length).toBeGreaterThan(30)
  })

  it('rejects login with the wrong password', async () => {
    await register()
    const res = await login({ password: 'wrong-password' })
    expect(res.statusCode).toBe(401)
    expect(res.json()).toMatchObject({ error: { code: 'INVALID_CREDENTIALS' } })
  })

  it('rotates the refresh token and revokes the old one', async () => {
    await register()
    const loginRes = await login()
    const { refreshToken } = loginRes.json() as { refreshToken: string }

    const rotated = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken },
    })
    expect(rotated.statusCode).toBe(200)
    const next = rotated.json() as { refreshToken: string; accessToken: string }
    expect(next.refreshToken).not.toBe(refreshToken)

    const replay = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken },
    })
    expect(replay.statusCode).toBe(401)
    expect(replay.json()).toMatchObject({
      error: { code: 'REFRESH_TOKEN_REUSE_DETECTED' },
    })
  })

  it('logs out and invalidates the refresh token', async () => {
    await register()
    const { refreshToken } = (await login()).json() as { refreshToken: string }

    const logout = await app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refreshToken },
    })
    expect(logout.statusCode).toBe(204)

    const attempt = await app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken },
    })
    expect(attempt.statusCode).toBe(401)
  })

  it('exposes a JWKS document with the signing key', async () => {
    const res = await app.inject({ method: 'GET', url: '/.well-known/jwks.json' })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { keys: Record<string, unknown>[] }
    expect(body.keys).toHaveLength(1)
    expect(body.keys[0]).toMatchObject({ kty: 'RSA', use: 'sig', alg: 'RS256' })
  })

  it('verifies the issued access token', async () => {
    await register()
    const { accessToken } = (await login()).json() as { accessToken: string }
    const payload = await container.services.tokenIssuer.verifyAccessToken(accessToken)
    expect(payload.tenantId).toBeDefined()
    expect(payload.sessionId).toBeDefined()
  })
})
