import swagger from '@fastify/swagger'
import swaggerUi from '@fastify/swagger-ui'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { jsonSchemaTransform } from 'fastify-type-provider-zod'

import type { Env } from '../../../config/index.js'

export interface SwaggerPluginOptions {
  env: Env
}

const swaggerPlugin: FastifyPluginAsync<SwaggerPluginOptions> = async (
  app: FastifyInstance,
  { env }: SwaggerPluginOptions,
) => {
  if (!env.SWAGGER_ENABLED) return

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'saas-auth-gateway',
        description: 'Identity & Access Management platform HTTP API',
        version: '0.1.0',
      },
      servers: [{ url: `http://${env.HOST}:${env.PORT.toString()}` }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
    transform: jsonSchemaTransform,
  })

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
  })
}

export const registerSwagger = fp(swaggerPlugin, {
  name: 'swagger',
})
