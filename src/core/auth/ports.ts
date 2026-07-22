import type { Credential, CredentialType, RefreshToken, Session, Tenant, User } from './entities.js'

export interface TenantRepository {
  findBySlug(slug: string): Promise<Tenant | null>
  findById(id: string): Promise<Tenant | null>
  create(input: { slug: string; name: string }): Promise<Tenant>
}

export interface UserRepository {
  findByEmail(tenantId: string, emailNormalized: string): Promise<User | null>
  findById(tenantId: string, id: string): Promise<User | null>
  create(input: {
    tenantId: string
    email: string
    emailNormalized: string
    displayName: string | null
  }): Promise<User>
}

export interface CredentialRepository {
  findByUserAndType(userId: string, type: CredentialType): Promise<Credential | null>
  upsertPassword(userId: string, hashedSecret: string): Promise<Credential>
}

export interface SessionRepository {
  create(input: {
    userId: string
    tenantId: string
    ip: string | null
    userAgent: string | null
    expiresAt: Date
  }): Promise<Session>
  findById(id: string): Promise<Session | null>
  revoke(id: string, reason: string): Promise<void>
  revokeFamily(familyId: string, reason: string): Promise<void>
}

export interface CreateRefreshTokenInput {
  sessionId: string
  tokenHash: string
  familyId: string
  expiresAt: Date
  ip: string | null
  userAgent: string | null
}

export interface RotateRefreshTokenInput {
  oldTokenId: string
  newToken: CreateRefreshTokenInput
}

export interface RefreshTokenRepository {
  findByHash(tokenHash: string): Promise<RefreshToken | null>
  create(input: CreateRefreshTokenInput): Promise<RefreshToken>
  rotate(input: RotateRefreshTokenInput): Promise<RefreshToken>
  revokeById(id: string, reason: string): Promise<void>
  revokeFamily(familyId: string, reason: string): Promise<void>
}

/**
 * Port for password hashing. Implementations must be constant-time in
 * their verification path and resistant to timing side channels.
 */
export interface PasswordHasher {
  hash(plainText: string): Promise<string>
  verify(hashed: string, plainText: string): Promise<boolean>
  needsRehash(hashed: string): boolean
}

export interface AccessTokenPayload {
  sub: string
  tenantId: string
  sessionId: string
  scope?: string[]
}

export interface IssuedAccessToken {
  token: string
  expiresAt: Date
}

export interface TokenIssuer {
  issueAccessToken(payload: AccessTokenPayload): Promise<IssuedAccessToken>
  verifyAccessToken(token: string): Promise<AccessTokenPayload>
  jwks(): Promise<{ keys: Record<string, unknown>[] }>
}

export interface RefreshTokenService {
  mint(): { token: string; tokenHash: string }
  hash(token: string): string
}
