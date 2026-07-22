export type UserStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED'
export type TenantStatus = 'ACTIVE' | 'SUSPENDED'
export type CredentialType = 'PASSWORD'

export interface Tenant {
  readonly id: string
  readonly slug: string
  readonly name: string
  readonly status: TenantStatus
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface User {
  readonly id: string
  readonly tenantId: string
  readonly email: string
  readonly emailNormalized: string
  readonly emailVerifiedAt: Date | null
  readonly displayName: string | null
  readonly status: UserStatus
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface Credential {
  readonly id: string
  readonly userId: string
  readonly type: CredentialType
  readonly secret: string
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface Session {
  readonly id: string
  readonly userId: string
  readonly tenantId: string
  readonly familyId: string
  readonly ip: string | null
  readonly userAgent: string | null
  readonly createdAt: Date
  readonly expiresAt: Date
  readonly revokedAt: Date | null
  readonly revokedReason: string | null
}

export interface RefreshToken {
  readonly id: string
  readonly sessionId: string
  readonly tokenHash: string
  readonly familyId: string
  readonly issuedAt: Date
  readonly expiresAt: Date
  readonly rotatedAt: Date | null
  readonly revokedAt: Date | null
  readonly revokedReason: string | null
  readonly replacedById: string | null
  readonly ip: string | null
  readonly userAgent: string | null
}
