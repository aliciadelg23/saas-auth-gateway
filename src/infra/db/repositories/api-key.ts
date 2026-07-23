import type { ApiKey as PrismaApiKey, PrismaClient } from '@prisma/client'

import type { ApiKey } from '../../../core/api-keys/entities.js'
import type { ApiKeyRepository } from '../../../core/api-keys/ports.js'
import { buildPage, cursorWhere } from '../../../core/shared/page-builder.js'
import { normalizeLimit } from '../../../core/shared/pagination.js'

function toDomain(row: PrismaApiKey): ApiKey {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    prefix: row.prefix,
    tokenHash: row.tokenHash,
    scopes: row.scopes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
  }
}

export class PrismaApiKeyRepository implements ApiKeyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByPrefix(prefix: string): Promise<ApiKey | null> {
    const row = await this.prisma.apiKey.findUnique({ where: { prefix } })
    return row ? toDomain(row) : null
  }

  async findById(tenantId: string, id: string): Promise<ApiKey | null> {
    const row = await this.prisma.apiKey.findFirst({ where: { id, tenantId } })
    return row ? toDomain(row) : null
  }

  async list(
    tenantId: string,
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{ items: ApiKey[]; nextCursor: string | null }> {
    const limit = normalizeLimit(opts.limit)
    const rows = await this.prisma.apiKey.findMany({
      where: { tenantId, ...cursorWhere(opts.cursor) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })
    return buildPage(rows, limit, toDomain)
  }

  async create(input: {
    tenantId: string
    name: string
    prefix: string
    tokenHash: string
    scopes: readonly string[]
    createdBy: string | null
    expiresAt: Date | null
  }): Promise<ApiKey> {
    const row = await this.prisma.apiKey.create({
      data: {
        tenantId: input.tenantId,
        name: input.name,
        prefix: input.prefix,
        tokenHash: input.tokenHash,
        scopes: [...input.scopes],
        createdBy: input.createdBy,
        expiresAt: input.expiresAt,
      },
    })
    return toDomain(row)
  }

  async touch(id: string, at: Date): Promise<void> {
    await this.prisma.apiKey.update({ where: { id }, data: { lastUsedAt: at } })
  }

  async revoke(id: string, reason: string): Promise<void> {
    await this.prisma.apiKey.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason },
    })
  }
}
