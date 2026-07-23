import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'

import {
  AssignRoleParams,
  CreateRoleBody,
  ListRolesQuery,
  RoleListResponse,
  RoleResponse,
} from './schemas.js'
import type { AppContainer } from '../../../container.js'
import { ALL_PERMISSIONS, PERMISSIONS } from '../../../core/rbac/permissions.js'
import { assertTenantAccess } from '../../../core/shared/tenant-scope.js'
import { requirePrincipal } from '../../../infra/http/hooks/authenticate.js'
import { ErrorResponse } from '../../auth/http/schemas.js'

interface Deps {
  container: AppContainer
}

const tenantParamSchema = z.object({ tenantId: z.string().min(1) })

const rbacRoutes: FastifyPluginAsync<Deps> = async (app: FastifyInstance, { container }: Deps) => {
  const routes = app.withTypeProvider<ZodTypeProvider>()
  const guard = container.services.requirePermission

  routes.get(
    '/v1/tenants/:tenantId/roles',
    {
      preHandler: [container.services.authenticate, guard(PERMISSIONS.roles.read)],
      schema: {
        tags: ['rbac'],
        summary: 'List roles for a tenant',
        params: tenantParamSchema,
        querystring: ListRolesQuery,
        response: { 200: RoleListResponse, 401: ErrorResponse, 403: ErrorResponse },
      },
    },
    async (req) => {
      const principal = requirePrincipal(req)
      assertTenantAccess(principal, req.params.tenantId)
      const result = await container.useCases.listRoles.execute({
        tenantId: req.params.tenantId,
        ...(req.query.cursor !== undefined ? { cursor: req.query.cursor } : {}),
        ...(req.query.limit !== undefined ? { limit: req.query.limit } : {}),
      })
      return {
        items: result.items.map((role) => ({
          ...role,
          permissions: [...role.permissions],
          createdAt: role.createdAt.toISOString(),
          updatedAt: role.updatedAt.toISOString(),
        })),
        nextCursor: result.nextCursor,
      }
    },
  )

  routes.post(
    '/v1/tenants/:tenantId/roles',
    {
      preHandler: [container.services.authenticate, guard(PERMISSIONS.roles.write)],
      schema: {
        tags: ['rbac'],
        summary: 'Create a role in a tenant',
        params: tenantParamSchema,
        body: CreateRoleBody,
        response: {
          201: RoleResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          409: ErrorResponse,
        },
      },
    },
    async (req, reply) => {
      const principal = requirePrincipal(req)
      assertTenantAccess(principal, req.params.tenantId)
      const role = await container.useCases.createRole.execute({
        tenantId: req.params.tenantId,
        name: req.body.name,
        description: req.body.description ?? null,
        permissions: req.body.permissions,
        actorId: principal.type === 'user' ? principal.userId : null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      })
      return reply.status(201).send({
        ...role,
        permissions: [...role.permissions],
        createdAt: role.createdAt.toISOString(),
        updatedAt: role.updatedAt.toISOString(),
      })
    },
  )

  routes.post(
    '/v1/tenants/:tenantId/users/:userId/roles/:roleId',
    {
      preHandler: [container.services.authenticate, guard(PERMISSIONS.roles.assign)],
      schema: {
        tags: ['rbac'],
        summary: 'Assign a role to a user',
        params: AssignRoleParams,
        response: { 204: z.null(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const principal = requirePrincipal(req)
      assertTenantAccess(principal, req.params.tenantId)
      await container.useCases.assignRole.execute({
        tenantId: req.params.tenantId,
        userId: req.params.userId,
        roleId: req.params.roleId,
        actorId: principal.type === 'user' ? principal.userId : null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      })
      return reply.status(204).send()
    },
  )

  routes.delete(
    '/v1/tenants/:tenantId/users/:userId/roles/:roleId',
    {
      preHandler: [container.services.authenticate, guard(PERMISSIONS.roles.assign)],
      schema: {
        tags: ['rbac'],
        summary: 'Unassign a role from a user',
        params: AssignRoleParams,
        response: { 204: z.null(), 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse },
      },
    },
    async (req, reply) => {
      const principal = requirePrincipal(req)
      assertTenantAccess(principal, req.params.tenantId)
      await container.useCases.unassignRole.execute({
        tenantId: req.params.tenantId,
        userId: req.params.userId,
        roleId: req.params.roleId,
        actorId: principal.type === 'user' ? principal.userId : null,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      })
      return reply.status(204).send()
    },
  )

  routes.get(
    '/v1/permissions',
    {
      schema: {
        tags: ['rbac'],
        summary: 'Return the permission catalog',
        response: {
          200: z.object({ permissions: z.array(z.string()) }),
        },
      },
    },
    async () => ({ permissions: [...ALL_PERMISSIONS] }),
  )
}

export const registerRbacRoutes = fp(rbacRoutes, {
  name: 'rbac-routes',
})
