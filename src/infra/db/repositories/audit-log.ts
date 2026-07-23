import type { AuditLog as PrismaAuditLog, Prisma, PrismaClient } from '@prisma/client'

import type { ActorType, AuditRecord } from '../../../core/audit/entities.js'
import type { AuditLogQuery, AuditLogRepository } from '../../../core/audit/ports.js'
import {
  decodeCursor,
  encodeCursor,
  normalizeLimit,
} from '../../../core/shared/pagination.js'

function toDomain(row: PrismaAuditLog): AuditRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    actorType: row.actorType as ActorType,
    actorId: row.actorId,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId,
    ip: row.ip,
    userAgent: row.userAgent,
    metadata: (row.metadata ?? {}) as Readonly<Record<string, unknown>>,
    outcome: row.outcome as AuditRecord['outcome'],
    createdAt: row.createdAt,
  }
}

function buildWhere(
  query: Omit<AuditLogQuery, 'limit' | 'cursor'>,
): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {}
  if (query.tenantId !== undefined) where.tenantId = query.tenantId
  if (query.action !== undefined) where.action = query.action
  if (query.actorId !== undefined) where.actorId = query.actorId
  if (query.resourceType !== undefined) where.resourceType = query.resourceType
  if (query.resourceId !== undefined) where.resourceId = query.resourceId
  if (query.outcome !== undefined) where.outcome = query.outcome
  if (query.since !== undefined || query.until !== undefined) {
    where.createdAt = {
      ...(query.since ? { gte: query.since } : {}),
      ...(query.until ? { lte: query.until } : {}),
    }
  }
  return where
}

export class PrismaAuditLogRepository implements AuditLogRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(query: AuditLogQuery): Promise<{ items: AuditRecord[]; nextCursor: string | null }> {
    const limit = normalizeLimit(query.limit)
    const cursor = decodeCursor(query.cursor)
    const baseWhere = buildWhere(query)
    const where: Prisma.AuditLogWhereInput = cursor
      ? {
          AND: [
            baseWhere,
            {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                {
                  AND: [{ createdAt: new Date(cursor.createdAt) }, { id: { lt: cursor.id } }],
                },
              ],
            },
          ],
        }
      : baseWhere

    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })
    const items = rows.slice(0, limit).map(toDomain)
    const last = items[items.length - 1]
    const nextCursor =
      rows.length > limit && last
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : null
    return { items, nextCursor }
  }

  async count(query: Omit<AuditLogQuery, 'limit' | 'cursor'>): Promise<number> {
    return this.prisma.auditLog.count({ where: buildWhere(query) })
  }
}
