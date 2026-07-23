import { createHmac, randomBytes } from 'node:crypto'

import type { ApiKeyMinter } from '../../core/api-keys/ports.js'

const PREFIX_BYTES = 6 // 8 base64url chars
const SECRET_BYTES = 32 // 43 base64url chars
const KEY_MARKER = 'sag_'

/**
 * Mints and parses `sag_<prefix>_<secret>` bearer tokens.
 *
 * Storage strategy:
 * - `prefix` (public identifier) is stored plaintext and indexed for
 *   O(1) lookup on incoming requests.
 * - `tokenHash` (HMAC-SHA256 of the full plaintext) is stored so we can
 *   verify a presented key without ever keeping the secret at rest.
 */
export class HmacApiKeyService implements ApiKeyMinter {
  constructor(private readonly secret: string) {}

  mint(): { plaintext: string; prefix: string; tokenHash: string } {
    // Prefix is hex (0-9a-f only) so the `_` separator can never
    // collide with a character inside the prefix.
    const prefix = randomBytes(PREFIX_BYTES).toString('hex')
    const secret = randomBytes(SECRET_BYTES).toString('base64url')
    const plaintext = `${KEY_MARKER}${prefix}_${secret}`
    return { plaintext, prefix, tokenHash: this.hash(plaintext) }
  }

  parse(plaintext: string): { prefix: string; tokenHash: string } | null {
    if (!plaintext.startsWith(KEY_MARKER)) return null
    const body = plaintext.slice(KEY_MARKER.length)
    const separator = body.indexOf('_')
    if (separator <= 0 || separator >= body.length - 1) return null
    const prefix = body.slice(0, separator)
    if (prefix.length === 0) return null
    return { prefix, tokenHash: this.hash(plaintext) }
  }

  private hash(plaintext: string): string {
    return createHmac('sha256', this.secret).update(plaintext).digest('base64url')
  }
}
