import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod'
import { ZodError } from 'zod'

import { DomainError } from '../../../core/shared/errors.js'

interface ErrorBody {
  error: {
    code: string
    message: string
    details?: unknown
    requestId?: string
  }
}

function buildBody(
  code: string,
  message: string,
  details: unknown,
  requestId: string | undefined,
): ErrorBody {
  const body: ErrorBody = { error: { code, message } }
  if (details !== undefined) body.error.details = details
  if (requestId !== undefined) body.error.requestId = requestId
  return body
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | Error, req: FastifyRequest, reply: FastifyReply) => {
    const requestId = String(req.id)

    if (error instanceof DomainError) {
      reply.log.info({ code: error.code, err: error }, 'domain error')
      return reply
        .status(error.status)
        .send(buildBody(error.code, error.message, error.details, requestId))
    }

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((issue) => ({
        path: issue.instancePath,
        message: issue.message,
      }))
      return reply
        .status(400)
        .send(buildBody('VALIDATION_ERROR', 'Request validation failed', details, requestId))
    }

    if (error instanceof ZodError) {
      return reply.status(400).send(
        buildBody(
          'VALIDATION_ERROR',
          'Request validation failed',
          error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
          requestId,
        ),
      )
    }

    const fastifyError = error as FastifyError
    if (typeof fastifyError.statusCode === 'number' && fastifyError.statusCode < 500) {
      const code = fastifyError.code || 'REQUEST_ERROR'
      return reply
        .status(fastifyError.statusCode)
        .send(buildBody(code, fastifyError.message, undefined, requestId))
    }

    reply.log.error({ err: error }, 'unhandled error')
    return reply
      .status(500)
      .send(
        buildBody('INTERNAL_SERVER_ERROR', 'An unexpected error occurred', undefined, requestId),
      )
  })

  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    return reply
      .status(404)
      .send(
        buildBody(
          'ROUTE_NOT_FOUND',
          `Route ${req.method} ${req.url} not found`,
          undefined,
          String(req.id),
        ),
      )
  })
}
