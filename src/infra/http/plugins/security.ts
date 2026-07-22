import compress from '@fastify/compress'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { fastifyRequestContext } from '@fastify/request-context'
import sensible from '@fastify/sensible'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

import type { Env } from '../../../config/index.js'

export interface SecurityPluginOptions {
  env: Env
}

const securityPlugin: FastifyPluginAsync<SecurityPluginOptions> = async (
  app: FastifyInstance,
  { env }: SecurityPluginOptions,
) => {
  await app.register(sensible)

  await app.register(fastifyRequestContext, {
    hook: 'onRequest',
    defaultStoreValues: {},
  })

  await app.register(helmet, {
    ...(env.NODE_ENV === 'production' ? {} : { contentSecurityPolicy: false }),
    crossOriginEmbedderPolicy: false,
  })

  const origins = env.CORS_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  await app.register(cors, {
    origin: origins.length === 0 || origins.includes('*') ? true : origins,
    credentials: true,
  })

  await app.register(compress, {
    global: true,
    encodings: ['gzip', 'deflate'],
  })

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
    hook: 'onRequest',
    keyGenerator: (req) => {
      const forwarded = req.headers['x-forwarded-for']
      if (typeof forwarded === 'string' && forwarded.length > 0) {
        return forwarded.split(',')[0]?.trim() ?? req.ip
      }
      return req.ip
    },
  })
}

export const registerSecurity = fp(securityPlugin, {
  name: 'security',
})
