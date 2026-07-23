import type { ApiKey } from './entities.js'

export interface ApiKeyRepository {
  findByPrefix(prefix: string): Promise<ApiKey | null>
  findById(tenantId: string, id: string): Promise<ApiKey | null>
  list(
    tenantId: string,
    opts?: { limit?: number; cursor?: string | null },
  ): Promise<{ items: ApiKey[]; nextCursor: string | null }>
  create(input: {
    tenantId: string
    name: string
    prefix: string
    tokenHash: string
    scopes: readonly string[]
    createdBy: string | null
    expiresAt: Date | null
  }): Promise<ApiKey>
  touch(id: string, at: Date): Promise<void>
  revoke(id: string, reason: string): Promise<void>
}

/**
 * Mints API keys (`prefix + secret`) and derives the hash stored in the
 * database. The raw key is only ever returned once, at creation time.
 */
export interface ApiKeyMinter {
  mint(): {
    /** Full key to hand to the caller (never persisted). */
    plaintext: string
    /** First 12 chars used as fast-lookup index. */
    prefix: string
    /** HMAC-SHA256 of the plaintext, safe to persist. */
    tokenHash: string
  }
  parse(plaintext: string): { prefix: string; tokenHash: string } | null
}
