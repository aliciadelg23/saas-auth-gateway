import Fastify, { type FastifyInstance } from 'fastify'

import type { Env } from './config/index.js'
import type { AppContainer } from './container.js'
import { registerPrisma } from './infra/db/prisma-client.js'
import { registerErrorHandler } from './infra/http/errors/error-handler.js'
import { registerHealthRoutes } from './infra/http/plugins/health.js'
import { registerSecurity } from './infra/http/plugins/security.js'
import { registerSwagger } from './infra/http/plugins/swagger.js'
import { registerValidation } from './infra/http/plugins/validation.js'
import { buildLoggerOptions } from './infra/logging/logger.js'
import { registerApiKeyRoutes } from './modules/api-keys/http/routes.js'
import { registerAuditRoutes } from './modules/audit/http/routes.js'
import { registerAuthRoutes } from './modules/auth/http/routes.js'
import { registerDashboardRoutes } from './modules/dashboard/http/routes.js'
import { registerRbacRoutes } from './modules/rbac/http/routes.js'

export interface BuildAppOptions {
  env: Env
  container: AppContainer
}

export async function buildApp({ env, container }: BuildAppOptions): Promise<FastifyInstance> {
  const app: FastifyInstance = Fastify({
    logger: buildLoggerOptions(env),
    disableRequestLogging: false,
    trustProxy: true,
    genReqId(req) {
      const header = req.headers['x-request-id']
      if (typeof header === 'string' && header.length > 0) return header
      return globalThis.crypto.randomUUID()
    },
  })

  registerErrorHandler(app)

  await app.register(registerValidation)
  await app.register(registerSecurity, { env })
  await app.register(registerPrisma, { prisma: container.prisma })
  await app.register(registerSwagger, { env })

  await app.register(registerHealthRoutes)
  await app.register(registerAuthRoutes, { container })
  await app.register(registerRbacRoutes, { container })
  await app.register(registerApiKeyRoutes, { container })
  await app.register(registerAuditRoutes, { container })
  await app.register(registerDashboardRoutes, { container })

  app.get('/', async () => ({
    name: 'saas-auth-gateway',
    status: 'ok',
    version: '0.1.0',
  }))

  return app
}
