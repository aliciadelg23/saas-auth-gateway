import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

const LiveResponse = z.object({ status: z.literal('live') })
const ReadyResponse = z.object({ status: z.literal('ready') })
const NotReadyResponse = z.object({
  status: z.literal('not-ready'),
  reason: z.string(),
})

const healthPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  routes.get(
    '/health/live',
    {
      schema: {
        tags: ['health'],
        summary: 'Liveness probe',
        response: { 200: LiveResponse },
      },
    },
    async () => ({ status: 'live' as const }),
  )

  routes.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        summary: 'Readiness probe (checks database connectivity)',
        response: {
          200: ReadyResponse,
          503: NotReadyResponse,
        },
      },
    },
    async (_req, reply) => {
      if (!('prisma' in app)) {
        return { status: 'ready' as const }
      }
      try {
        await app.prisma.$queryRaw`SELECT 1`
        return { status: 'ready' as const }
      } catch (error) {
        reply.log.warn({ err: error }, 'readiness probe: database unreachable')
        return reply
          .status(503)
          .send({ status: 'not-ready' as const, reason: 'database-unreachable' })
      }
    },
  )
}

export const registerHealthRoutes = fp(healthPlugin, {
  name: 'health-routes',
})
