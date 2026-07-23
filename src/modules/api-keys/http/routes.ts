import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import {
  ApiKeyCreatedResponse,
  ApiKeyListResponse,
  ApiKeyResponse,
  CreateApiKeyBody,
  ListApiKeysQuery,
} from './schemas.js'
import type { AppContainer } from '../../../container.js'
import type { ApiKey } from '../../../core/api-keys/entities.js'
import { PERMISSIONS } from '../../../core/rbac/permissions.js'
import { ForbiddenError } from '../../../core/shared/errors.js'
import { requirePrincipal } from '../../../infra/http/hooks/authenticate.js'
import { ErrorResponse } from '../../auth/http/schemas.js'

interface Deps {
  container: AppContainer
}

function serialize(key: ApiKey) {
  return {
    id: key.id,
    tenantId: key.tenantId,
    name: key.name,
    prefix: key.prefix,
    scopes: [...key.scopes],
    createdBy: key.createdBy,
    createdAt: key.createdAt.toISOString(),
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
  }
}

const tenantParamSchema = z.object({ tenantId: z.string().min(1) })

function assertTenantAccess(principalTenantId: string, requestedTenantId: string): void {
  if (principalTenantId !== requestedTenantId) {
    throw new ForbiddenError('Principal is not scoped to this tenant')
  }
}

const apiKeyRoutes: FastifyPluginAsync<Deps> = async (
  app: FastifyInstance,
  { container }: Deps,
) => {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const guard = container.services.requirePermission

  routes.get(
    '/v1/tenants/:tenantId/api-keys',
    {
      preHandler: [container.services.authenticate, guard(PERMISSIONS.apiKeys.read)],
      schema: {
        tags: ['api-keys'],
        summary: 'List API keys for a tenant',
        params: tenantParamSchema,
        querystring: ListApiKeysQuery,
        response: { 200: ApiKeyListResponse, 401: ErrorResponse, 403: ErrorResponse },
      },
    },
    async (req) => {
      const principal = requirePrincipal(req)
      assertTenantAccess(principal.tenantId, req.params.tenantId)
      const result = await container.useCases.listApiKeys.execute({
        tenantId: req.params.tenantId,
        ...(req.query.cursor !== undefined ? { cursor: req.query.cursor } : {}),
        ...(req.query.limit !== undefined ? { limit: req.query.limit } : {}),
      })
      return { items: result.items.map(serialize), nextCursor: result.nextCursor }
    },
  )

  routes.post(
    '/v1/tenants/:tenantId/api-keys',
    {
      preHandler: [container.services.authenticate, guard(PERMISSIONS.apiKeys.write)],
      schema: {
        tags: ['api-keys'],
        summary: 'Mint a new API key (plaintext returned once only)',
        params: tenantParamSchema,
        body: CreateApiKeyBody,
        response: {
          201: ApiKeyCreatedResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const principal = requirePrincipal(req)
      assertTenantAccess(principal.tenantId, req.params.tenantId)
      const result = await container.useCases.createApiKey.execute({
        tenantId: req.params.tenantId,
        name: req.body.name,
        scopes: req.body.scopes,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
        actorId: principal.type === 'user' ? principal.userId : null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      })
      return reply.status(201).send({ ...serialize(result.key), plaintext: result.plaintext })
    },
  )

  routes.delete(
    '/v1/tenants/:tenantId/api-keys/:keyId',
    {
      preHandler: [container.services.authenticate, guard(PERMISSIONS.apiKeys.write)],
      schema: {
        tags: ['api-keys'],
        summary: 'Revoke an API key',
        params: z.object({ tenantId: z.string().min(1), keyId: z.string().min(1) }),
        response: { 204: z.null(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const principal = requirePrincipal(req)
      assertTenantAccess(principal.tenantId, req.params.tenantId)
      await container.useCases.revokeApiKey.execute({
        tenantId: req.params.tenantId,
        keyId: req.params.keyId,
        actorId: principal.type === 'user' ? principal.userId : null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      })
      return reply.status(204).send()
    },
  )

  // Expose a single-row lookup so tests and admin UIs can hydrate a key's
  // metadata without re-listing.
  routes.get(
    '/v1/tenants/:tenantId/api-keys/:keyId',
    {
      preHandler: [container.services.authenticate, guard(PERMISSIONS.apiKeys.read)],
      schema: {
        tags: ['api-keys'],
        summary: 'Get an API key by id',
        params: z.object({ tenantId: z.string().min(1), keyId: z.string().min(1) }),
        response: { 200: ApiKeyResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (req) => {
      const principal = requirePrincipal(req)
      assertTenantAccess(principal.tenantId, req.params.tenantId)
      const key = await container.repositories.apiKeys.findById(
        req.params.tenantId,
        req.params.keyId,
      )
      if (!key) {
        const { ApiKeyNotFoundError } = await import('../../../core/api-keys/errors.js')
        throw new ApiKeyNotFoundError(req.params.keyId)
      }
      return serialize(key)
    },
  )
}

export const registerApiKeyRoutes = fp(apiKeyRoutes, {
  name: 'api-key-routes',
})
