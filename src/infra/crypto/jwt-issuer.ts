import { createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto'

import { SignJWT, exportJWK, jwtVerify } from 'jose'

import type { AccessTokenPayload, IssuedAccessToken, TokenIssuer } from '../../core/auth/ports.js'
import type { Clock } from '../../core/shared/clock.js'
import { UnauthorizedError } from '../../core/shared/errors.js'

export interface JwtIssuerConfig {
  issuer: string
  audience: string
  accessTokenTtlSeconds: number
  keyId: string
  privateKeyPem?: string
  publicKeyPem?: string
}

/**
 * RS256 JWT issuer.
 *
 * Keys come from PEM strings in production and are auto-generated in
 * development or test environments if the config leaves them empty.
 * The public key is exported as a JWK for the future `/jwks.json`
 * endpoint.
 */
export class JwtIssuer implements TokenIssuer {
  private readonly privateKey: KeyObject
  private readonly publicKey: KeyObject

  constructor(
    private readonly config: JwtIssuerConfig,
    private readonly clock: Clock,
  ) {
    if (config.privateKeyPem && config.publicKeyPem) {
      this.privateKey = createPrivateKey(config.privateKeyPem)
      this.publicKey = createPublicKey(config.publicKeyPem)
    } else {
      const { privateKey, publicKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
      })
      this.privateKey = privateKey
      this.publicKey = publicKey
    }
  }

  async issueAccessToken(payload: AccessTokenPayload): Promise<IssuedAccessToken> {
    const iat = Math.floor(this.clock.now().getTime() / 1000)
    const exp = iat + this.config.accessTokenTtlSeconds

    const claims: Record<string, unknown> = {
      tenant_id: payload.tenantId,
      session_id: payload.sessionId,
    }
    if (payload.scope) {
      claims.scope = payload.scope.join(' ')
    }

    const jwt = await new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: this.config.keyId, typ: 'JWT' })
      .setSubject(payload.sub)
      .setIssuer(this.config.issuer)
      .setAudience(this.config.audience)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .setJti(cryptoRandomId())
      .sign(this.privateKey)

    return {
      token: jwt,
      expiresAt: new Date(exp * 1000),
    }
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const { payload } = await jwtVerify(token, this.publicKey, {
        issuer: this.config.issuer,
        audience: this.config.audience,
        algorithms: ['RS256'],
      })
      const sub = payload.sub
      const tenantId = payload.tenant_id
      const sessionId = payload.session_id
      const scope = payload.scope
      if (
        typeof sub !== 'string' ||
        typeof tenantId !== 'string' ||
        typeof sessionId !== 'string'
      ) {
        throw new UnauthorizedError('Access token is missing required claims')
      }
      const result: AccessTokenPayload = { sub, tenantId, sessionId }
      if (typeof scope === 'string' && scope.length > 0) {
        result.scope = scope.split(/\s+/)
      }
      return result
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error
      throw new UnauthorizedError('Access token verification failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  async jwks(): Promise<{ keys: Record<string, unknown>[] }> {
    const jwk = await exportJWK(this.publicKey)
    return {
      keys: [
        {
          ...jwk,
          use: 'sig',
          alg: 'RS256',
          kid: this.config.keyId,
        },
      ],
    }
  }
}

function cryptoRandomId(): string {
  // 16 random bytes → 22-char base64url without padding.
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}
