import { z } from 'zod'

const roleNameSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, {
    message: 'Role name must be kebab-case lowercase alphanumerics',
  })

export const CreateRoleBody = z.object({
  name: roleNameSchema,
  description: z.string().min(1).max(280).optional(),
  permissions: z.array(z.string().min(1)).min(1).max(200),
})

export const AssignRoleParams = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  roleId: z.string().min(1),
})

export const ListRolesQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export const RoleResponse = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const RoleListResponse = z.object({
  items: z.array(RoleResponse),
  nextCursor: z.string().nullable(),
})
