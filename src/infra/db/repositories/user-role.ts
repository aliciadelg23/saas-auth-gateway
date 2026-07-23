import type { PrismaClient, UserRole as PrismaUserRole } from '@prisma/client'

import type { UserRoleAssignment } from '../../../core/rbac/entities.js'
import type { UserRoleRepository } from '../../../core/rbac/ports.js'

function toDomain(row: PrismaUserRole): UserRoleAssignment {
  return {
    id: row.id,
    userId: row.userId,
    roleId: row.roleId,
    grantedAt: row.grantedAt,
    grantedBy: row.grantedBy,
  }
}

export class PrismaUserRoleRepository implements UserRoleRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async assign(input: {
    userId: string
    roleId: string
    grantedBy: string | null
  }): Promise<UserRoleAssignment> {
    const row = await this.prisma.userRole.upsert({
      where: { user_role_unique: { userId: input.userId, roleId: input.roleId } },
      update: {},
      create: { userId: input.userId, roleId: input.roleId, grantedBy: input.grantedBy },
    })
    return toDomain(row)
  }

  async unassign(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.deleteMany({ where: { userId, roleId } })
  }

  async listForUser(userId: string): Promise<UserRoleAssignment[]> {
    const rows = await this.prisma.userRole.findMany({ where: { userId } })
    return rows.map(toDomain)
  }

  async permissionsForUser(userId: string): Promise<string[]> {
    const rows = await this.prisma.rolePermission.findMany({
      where: { role: { assignments: { some: { userId } } } },
      select: { permission: true },
      distinct: ['permission'],
    })
    return rows.map((r) => r.permission)
  }
}
