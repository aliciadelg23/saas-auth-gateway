import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import {
  ErrorResponse,
  LoginBody,
  LogoutBody,
  RefreshBody,
  RegisterBody,
  RegisterResponse,
  TokenResponse,
} from './schemas.js'
import type { AppContainer } from '../../../container.js'

export interface AuthRoutesOptions {
  container: AppContainer
}

const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  app: FastifyInstance,
  { container }: AuthRoutesOptions,
) => {
  const routes = app.withTypeProvider<ZodTypeProvider>()

  routes.post(
    '/v1/auth/register',
    {
      schema: {
        tags: ['auth'],
        summary: 'Register a new user in a tenant',
        body: RegisterBody,
        response: {
          201: RegisterResponse,
          400: ErrorResponse,
          404: ErrorResponse,
          409: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const result = await container.useCases.registerUser.execute(req.body)
      return reply.status(201).send(result)
    },
  )

  routes.post(
    '/v1/auth/login',
    {
      schema: {
        tags: ['auth'],
        summary: 'Exchange e-mail + password for a token pair',
        body: LoginBody,
        response: {
          200: TokenResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const result = await container.useCases.loginWithPassword.execute({
        tenantSlug: req.body.tenantSlug,
        email: req.body.email,
        password: req.body.password,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      })
      return reply.status(200).send({
        tokenType: result.tokenType,
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
        refreshToken: result.refreshToken,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString(),
        sessionId: result.sessionId,
        userId: result.userId,
        tenantId: result.tenantId,
      })
    },
  )

  routes.post(
    '/v1/auth/refresh',
    {
      schema: {
        tags: ['auth'],
        summary: 'Rotate the refresh token and mint a new access token',
        body: RefreshBody,
        response: {
          200: TokenResponse,
          401: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const result = await container.useCases.rotateRefreshToken.execute({
        refreshToken: req.body.refreshToken,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      })
      return reply.status(200).send({
        tokenType: result.tokenType,
        accessToken: result.accessToken,
        accessTokenExpiresAt: result.accessTokenExpiresAt.toISOString(),
        refreshToken: result.refreshToken,
        refreshTokenExpiresAt: result.refreshTokenExpiresAt.toISOString(),
        sessionId: result.sessionId,
        userId: result.userId,
        tenantId: result.tenantId,
      })
    },
  )

  routes.post(
    '/v1/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Revoke the session tied to the presented refresh token',
        body: LogoutBody,
        response: {
          204: {
            type: 'null',
            description: 'Session revoked',
          },
        },
      },
    },
    async (req, reply) => {
      await container.useCases.logout.execute({ refreshToken: req.body.refreshToken })
      return reply.status(204).send()
    },
  )

  routes.get(
    '/.well-known/jwks.json',
    {
      schema: {
        tags: ['auth'],
        summary: 'Publish the JWKS for access-token verification',
      },
    },
    async () => container.services.tokenIssuer.jwks(),
  )
}

export const registerAuthRoutes = fp(authRoutes, {
  name: 'auth-routes',
})
