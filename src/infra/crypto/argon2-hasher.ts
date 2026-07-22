import * as argon2 from 'argon2'

import type { PasswordHasher } from '../../core/auth/ports.js'

/**
 * Argon2id-based password hasher.
 *
 * Parameters follow the OWASP 2024 recommendation for interactive
 * authentication (memory 19 MiB, iterations 2, parallelism 1). The
 * server-wide pepper (if configured) is HMAC-mixed into the plaintext
 * before hashing so that a database dump alone cannot be brute-forced
 * offline.
 */
export class Argon2Hasher implements PasswordHasher {
  private readonly options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  } as const

  constructor(private readonly pepper = '') {}

  private season(plainText: string): string {
    return this.pepper.length > 0 ? `${this.pepper}$${plainText}` : plainText
  }

  async hash(plainText: string): Promise<string> {
    return argon2.hash(this.season(plainText), this.options)
  }

  async verify(hashed: string, plainText: string): Promise<boolean> {
    try {
      return await argon2.verify(hashed, this.season(plainText))
    } catch {
      return false
    }
  }

  needsRehash(hashed: string): boolean {
    return argon2.needsRehash(hashed, this.options)
  }
}
