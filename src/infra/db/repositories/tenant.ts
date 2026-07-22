import type { PrismaClient, Tenant as PrismaTenant } from '@prisma/client'

import type { Tenant, TenantStatus } from '../../../core/auth/entities.js'
import type { TenantRepository } from '../../../core/auth/ports.js'

function toDomain(row: PrismaTenant): Tenant {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: row.status as TenantStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PrismaTenantRepository implements TenantRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBySlug(slug: string): Promise<Tenant | null> {
    const row = await this.prisma.tenant.findUnique({ where: { slug } })
    return row ? toDomain(row) : null
  }

  async findById(id: string): Promise<Tenant | null> {
    const row = await this.prisma.tenant.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async create(input: { slug: string; name: string }): Promise<Tenant> {
    const row = await this.prisma.tenant.create({ data: input })
    return toDomain(row)
  }
}
