import type { Credential as PrismaCredential, PrismaClient } from '@prisma/client'

import type { Credential, CredentialType } from '../../../core/auth/entities.js'
import type { CredentialRepository } from '../../../core/auth/ports.js'

function toDomain(row: PrismaCredential): Credential {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as CredentialType,
    secret: row.secret,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export class PrismaCredentialRepository implements CredentialRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByUserAndType(userId: string, type: CredentialType): Promise<Credential | null> {
    const row = await this.prisma.credential.findUnique({
      where: { user_credential_type_unique: { userId, type } },
    })
    return row ? toDomain(row) : null
  }

  async upsertPassword(userId: string, hashedSecret: string): Promise<Credential> {
    const row = await this.prisma.credential.upsert({
      where: { user_credential_type_unique: { userId, type: 'PASSWORD' } },
      update: { secret: hashedSecret },
      create: { userId, type: 'PASSWORD', secret: hashedSecret },
    })
    return toDomain(row)
  }
}
