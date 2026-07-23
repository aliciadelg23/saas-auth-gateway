import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import { DashboardOverviewResponse } from './schemas.js'
import type { AppContainer } from '../../../container.js'
import { PERMISSIONS } from '../../../core/rbac/permissions.js'
import { ForbiddenError } from '../../../core/shared/errors.js'
import { requirePrincipal } from '../../../infra/http/hooks/authenticate.js'
import { ErrorResponse } from '../../auth/http/schemas.js'

interface Deps {
  container: AppContainer
}

const dashboardRoutes: FastifyPluginAsync<Deps> = async (
  app: FastifyInstance,
  { container }: Deps,
) => {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const guard = container.services.requirePermission

  routes.get(
    '/v1/tenants/:tenantId/dashboard/overview',
    {
      preHandler: [container.services.authenticate, guard(PERMISSIONS.dashboard.read)],
      schema: {
        tags: ['dashboard'],
        summary: 'Tenant-scoped dashboard overview',
        params: z.object({ tenantId: z.string().min(1) }),
        response: {
          200: DashboardOverviewResponse,
          401: ErrorResponse,
          403: ErrorResponse,
        },
      },
    },
    async (req) => {
      const principal = requirePrincipal(req)
      if (principal.tenantId !== req.params.tenantId) {
        throw new ForbiddenError('Principal is not scoped to this tenant')
      }
      const overview = await container.useCases.getDashboardOverview.execute({
        tenantId: req.params.tenantId,
      })
      return {
        ...overview,
        recentAuditEvents: overview.recentAuditEvents.map((event) => ({
          ...event,
          createdAt: event.createdAt.toISOString(),
        })),
      }
    },
  )
}

export const registerDashboardRoutes = fp(dashboardRoutes, {
  name: 'dashboard-routes',
})
