import { createHmac, randomBytes } from 'node:crypto'

import type { RefreshTokenService } from '../../core/auth/ports.js'

/**
 * Opaque refresh tokens.
 *
 * A refresh token is `<tokenId>.<random>` in base64url, where `tokenId`
 * is not currently used (reserved for future key rotation of the hash
 * pepper). The hash stored in the database is `HMAC-SHA256(secret,
 * token)` — the raw token is only ever seen in-flight.
 */
export class HmacRefreshTokenService implements RefreshTokenService {
  constructor(
    private readonly secret: string,
    private readonly byteLength: number,
  ) {}

  mint(): { token: string; tokenHash: string } {
    const token = randomBytes(this.byteLength).toString('base64url')
    return { token, tokenHash: this.hash(token) }
  }

  hash(token: string): string {
    return createHmac('sha256', this.secret).update(token).digest('base64url')
  }
}
