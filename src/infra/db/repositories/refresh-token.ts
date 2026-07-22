import type { PrismaClient, RefreshToken as PrismaRefreshToken } from '@prisma/client'

import type { RefreshToken } from '../../../core/auth/entities.js'
import type {
  CreateRefreshTokenInput,
  RefreshTokenRepository,
  RotateRefreshTokenInput,
} from '../../../core/auth/ports.js'

function toDomain(row: PrismaRefreshToken): RefreshToken {
  return {
    id: row.id,
    sessionId: row.sessionId,
    tokenHash: row.tokenHash,
    familyId: row.familyId,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    rotatedAt: row.rotatedAt,
    revokedAt: row.revokedAt,
    revokedReason: row.revokedReason,
    replacedById: row.replacedById,
    ip: row.ip,
    userAgent: row.userAgent,
  }
}

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByHash(tokenHash: string): Promise<RefreshToken | null> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash } })
    return row ? toDomain(row) : null
  }

  async create(input: CreateRefreshTokenInput): Promise<RefreshToken> {
    const row = await this.prisma.refreshToken.create({ data: input })
    return toDomain(row)
  }

  async rotate(input: RotateRefreshTokenInput): Promise<RefreshToken> {
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.refreshToken.create({ data: input.newToken })
      await tx.refreshToken.update({
        where: { id: input.oldTokenId },
        data: { rotatedAt: new Date(), replacedById: created.id },
      })
      return toDomain(created)
    })
  }

  async revokeById(id: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: { revokedAt: new Date(), revokedReason: reason },
    })
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    })
  }
}
