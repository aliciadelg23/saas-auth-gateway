import type { PrismaClient, Session as PrismaSession } from '@prisma/client'

import type { Session } from '../../../core/auth/entities.js'
import type { SessionRepository } from '../../../core/auth/ports.js'

function toDomain(row: PrismaSession): Session {
  return {
    id: row.id,
    userId: row.userId,
    tenantId: row.tenantId,
    familyId: row.familyId,
    ip: row.ip,
    userAgent: row.userAgent,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
  }
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    userId: string
    tenantId: string
    ip: string | null
    userAgent: string | null
    expiresAt: Date
  }): Promise<Session> {
    const row = await this.prisma.session.create({ data: input })
    return toDomain(row)
  }

  async findById(id: string): Promise<Session | null> {
    const row = await this.prisma.session.findUnique({ where: { id } })
    return row ? toDomain(row) : null
  }

  async revoke(id: string, reason: string): Promise<void> {
    await this.prisma.session.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason },
    })
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    })
  }
}
