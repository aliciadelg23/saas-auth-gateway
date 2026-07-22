import type { FastifyServerOptions } from 'fastify'

import type { Env } from '../../config/index.js'

type LoggerOptions = Exclude<FastifyServerOptions['logger'], undefined>

/**
 * Build the pino logger configuration for Fastify.
 *
 * Development gets `pino-pretty` for readability. Any other environment
 * emits structured JSON, which is what log aggregators expect.
 * The redaction list keeps secrets out of logs regardless of the format.
 */
export function buildLoggerOptions(env: Env): LoggerOptions {
  return {
    level: env.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        '*.password',
        '*.token',
        '*.refreshToken',
        '*.accessToken',
      ],
      censor: '[REDACTED]',
    },
    ...(env.NODE_ENV === 'development'
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' },
          },
        }
      : {}),
  }
}
