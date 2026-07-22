import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod'

const validationPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.setValidatorCompiler(validatorCompiler)
  app.setSerializerCompiler(serializerCompiler)
}

export const registerValidation = fp(validationPlugin, {
  name: 'validation',
})
