import type { PrismaClient, User as PrismaUser } from '@prisma/client'

import type { User, UserStatus } from '../../../core/auth/entities.js'
import type { UserRepository } from '../../../core/auth/ports.js'

function toDomain(row: PrismaUser): User {
  return {
    id: row.id,
    tenantId: row.tenantId,
    email: row.email,
    emailNormalized: row.emailNormalized,
    emailVerifiedAt: row.emailVerifiedAt,
    displayName: row.displayName,
    status: row.status as UserStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(tenantId: string, emailNormalized: string): Promise<User | null> {
    const row = await this.prisma.user.findUnique({
      where: { tenant_email_unique: { tenantId, emailNormalized } },
    })
    return row ? toDomain(row) : null
  }

  async findById(tenantId: string, id: string): Promise<User | null> {
    const row = await this.prisma.user.findFirst({ where: { id, tenantId } })
    return row ? toDomain(row) : null
  }

  async create(input: {
    tenantId: string
    email: string
    emailNormalized: string
    displayName: string | null
  }): Promise<User> {
    const row = await this.prisma.user.create({ data: input })
    return toDomain(row)
  }
}
