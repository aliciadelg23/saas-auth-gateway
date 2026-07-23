import type { PrismaClient } from '@prisma/client'

import type { Role } from '../../../core/rbac/entities.js'
import type { RoleRepository } from '../../../core/rbac/ports.js'
import { buildPage, cursorWhere } from '../../../core/shared/page-builder.js'
import { normalizeLimit } from '../../../core/shared/pagination.js'

interface RoleRow {
  id: string
  tenantId: string
  name: string
  description: string | null
  isSystem: boolean
  createdAt: Date
  updatedAt: Date
  permissions: { permission: string }[]
}

function toDomain(row: RoleRow): Role {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    description: row.description,
    isSystem: row.isSystem,
    permissions: row.permissions.map((p) => p.permission),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PrismaRoleRepository implements RoleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(tenantId: string, id: string): Promise<Role | null> {
    const row = await this.prisma.role.findFirst({
      where: { id, tenantId },
      include: { permissions: true },
    })
    return row ? toDomain(row) : null
  }

  async findByName(tenantId: string, name: string): Promise<Role | null> {
    const row = await this.prisma.role.findUnique({
      where: { tenant_role_name_unique: { tenantId, name } },
      include: { permissions: true },
    })
    return row ? toDomain(row) : null
  }

  async list(
    tenantId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: Role[]; nextCursor: string | null }> {
    const limit = normalizeLimit(opts.limit)
    const rows = await this.prisma.role.findMany({
      where: { tenantId, ...cursorWhere(opts.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { permissions: true },
    })
    return buildPage(rows, limit, toDomain)
  }

  async create(input: {
    tenantId: string
    name: string
    description: string | null
    isSystem: boolean
    permissions: readonly string[]
  }): Promise<Role> {
    const row = await this.prisma.role.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        description: input.description,
        isSystem: input.isSystem,
        permissions: {
          create: [...new Set(input.permissions)].map((permission) => ({ permission })),
        },
      },
      include: { permissions: true },
    })
    return toDomain(row)
  }

  async replacePermissions(roleId: string, permissions: readonly string[]): Promise<Role> {
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } })
      if (permissions.length > 0) {
        await tx.rolePermission.createMany({
          data: [...new Set(permissions)].map((permission) => ({ roleId, permission })),
        })
      }
      return tx.role.findUniqueOrThrow({
        where: { id: roleId },
        include: { permissions: true },
      })
    })
    return toDomain(row)
  }

  async delete(roleId: string): Promise<void> {
    await this.prisma.role.delete({ where: { id: roleId } })
  }
}
