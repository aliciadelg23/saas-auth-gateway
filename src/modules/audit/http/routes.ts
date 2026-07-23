import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { AuditLogListResponse, AuditLogQuery } from './schemas.js'
import type { AppContainer } from '../../../container.js'
import { PERMISSIONS } from '../../../core/rbac/permissions.js'
import { assertTenantAccess } from '../../../core/shared/tenant-scope.js'
import { requirePrincipal } from '../../../infra/http/hooks/authenticate.js'
import { ErrorResponse } from '../../auth/http/schemas.js'

interface Deps {
  container: AppContainer
}

const auditRoutes: FastifyPluginAsync<Deps> = async (
  app: FastifyInstance,
  { container }: Deps,
) => {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const guard = container.services.requirePermission

  routes.get(
    '/v1/tenants/:tenantId/audit-logs',
    {
      preHandler: [container.services.authenticate, guard(PERMISSIONS.audit.read)],
      schema: {
        tags: ['audit'],
        summary: 'Query the audit log for a tenant',
        params: z.object({ tenantId: z.string().min(1) }),
        querystring: AuditLogQuery,
        response: { 200: AuditLogListResponse, 401: ErrorResponse, 403: ErrorResponse },
      },
    },
    async (req) => {
      const principal = requirePrincipal(req)
      assertTenantAccess(principal, req.params.tenantId)
      const query = req.query
      const result = await container.useCases.listAuditLogs.execute({
        tenantId: req.params.tenantId,
        ...(query.action !== undefined ? { action: query.action } : {}),
        ...(query.actorId !== undefined ? { actorId: query.actorId } : {}),
        ...(query.resourceType !== undefined ? { resourceType: query.resourceType } : {}),
        ...(query.resourceId !== undefined ? { resourceId: query.resourceId } : {}),
        ...(query.outcome !== undefined ? { outcome: query.outcome } : {}),
        ...(query.since !== undefined ? { since: new Date(query.since) } : {}),
        ...(query.until !== undefined ? { until: new Date(query.until) } : {}),
        ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
        ...(query.limit !== undefined ? { limit: query.limit } : {}),
      })
      return {
        items: result.items.map((r) => ({
          ...r,
          metadata: r.metadata as Record<string, unknown>,
          createdAt: r.createdAt.toISOString(),
        })),
        nextCursor: result.nextCursor,
      }
    },
  )
}

export const registerAuditRoutes = fp(auditRoutes, {
  name: 'audit-routes',
})
