import { PrismaClient } from '@prisma/client'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export interface PrismaPluginOptions {
  prisma?: PrismaClient
}

/**
 * Own the Prisma client lifecycle. Boots on register, disconnects on
 * `onClose`. Passing an external instance is supported so integration
 * tests can share the client with the seeder.
 */
const prismaPlugin: FastifyPluginAsync<PrismaPluginOptions> = async (
  app: FastifyInstance,
  opts: PrismaPluginOptions,
) => {
  const prisma =
    opts.prisma ??
    new PrismaClient({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    })

  await prisma.$connect()

  app.decorate('prisma', prisma)

  app.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect()
  })
}

export const registerPrisma = fp(prismaPlugin, {
  name: 'prisma',
})
