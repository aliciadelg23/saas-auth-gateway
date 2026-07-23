export interface ApiKey {
  readonly id: string
  readonly tenantId: string
  readonly name: string
  readonly prefix: string
  readonly tokenHash: string
  readonly scopes: readonly string[]
  readonly createdBy: string | null
  readonly createdAt: Date
  readonly lastUsedAt: Date | null
  readonly expiresAt: Date | null
  readonly revokedAt: Date | null
  readonly revokedReason: string | null
}
