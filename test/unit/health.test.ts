import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildApp } from '../../src/app.js'
import { loadEnv } from '../../src/config/index.js'
import { buildContainer } from '../../src/container.js'
import { makeTestPrismaClient, requireTestDatabase } from '../support/test-prisma.js'

describe('health endpoints', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    requireTestDatabase()
    const env = loadEnv({
      ...process.env,
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'false',
    })
    const prisma = makeTestPrismaClient(env)
    const container = buildContainer(env, { prisma })
    app = await buildApp({ env, container })
  })

  afterAll(async () => {
    await app.close()
  })

  it('returns 200 for /health/live', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/live' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'live' })
  })

  it('returns 200 for /health/ready when the database is reachable', async () => {
    const res = await app.inject({ method: 'GET', url: '/health/ready' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ready' })
  })
})
