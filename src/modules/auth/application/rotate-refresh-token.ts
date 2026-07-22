import { InvalidRefreshTokenError, RefreshTokenReuseError } from '../../../core/auth/errors.js'
import type {
  RefreshTokenRepository,
  RefreshTokenService,
  SessionRepository,
  TokenIssuer,
} from '../../../core/auth/ports.js'
import type { Clock } from '../../../core/shared/clock.js'

export interface RotateRefreshTokenInput {
  refreshToken: string
  ip?: string | null | undefined
  userAgent?: string | null | undefined
}

export interface RotateRefreshTokenResult {
  userId: string
  tenantId: string
  sessionId: string
  accessToken: string
  accessTokenExpiresAt: Date
  refreshToken: string
  refreshTokenExpiresAt: Date
  tokenType: 'Bearer'
}

export interface RotateRefreshTokenConfig {
  refreshTokenTtlSeconds: number
}

export class RotateRefreshToken {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly sessions: SessionRepository,
    private readonly tokenIssuer: TokenIssuer,
    private readonly clock: Clock,
    private readonly config: RotateRefreshTokenConfig,
  ) {}

  async execute(input: RotateRefreshTokenInput): Promise<RotateRefreshTokenResult> {
    const now = this.clock.now()
    const hash = this.refreshTokenService.hash(input.refreshToken)
    const stored = await this.refreshTokens.findByHash(hash)

    if (!stored) throw new InvalidRefreshTokenError()

    if (stored.rotatedAt !== null) {
      // Reuse of an already-rotated token indicates that a stolen token
      // is being replayed. Revoke the entire family and session.
      await this.refreshTokens.revokeFamily(stored.familyId, 'REUSE_DETECTED')
      await this.sessions.revoke(stored.sessionId, 'REUSE_DETECTED')
      throw new RefreshTokenReuseError()
    }

    if (stored.revokedAt !== null) throw new InvalidRefreshTokenError()
    if (stored.expiresAt.getTime() <= now.getTime()) throw new InvalidRefreshTokenError()

    const session = await this.sessions.findById(stored.sessionId)
    if (!session || session.revokedAt !== null) {
      throw new InvalidRefreshTokenError()
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      throw new InvalidRefreshTokenError()
    }

    const { token: newRefresh, tokenHash: newHash } = this.refreshTokenService.mint()
    const newExpiresAt = new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1000)

    await this.refreshTokens.rotate({
      oldTokenId: stored.id,
      newToken: {
        sessionId: session.id,
        tokenHash: newHash,
        familyId: stored.familyId,
        expiresAt: newExpiresAt,
        ip: input.ip ?? null,
        userAgent: input.userAgent ?? null,
      },
    })

    const accessToken = await this.tokenIssuer.issueAccessToken({
      sub: session.userId,
      tenantId: session.tenantId,
      sessionId: session.id,
    })

    return {
      userId: session.userId,
      tenantId: session.tenantId,
      sessionId: session.id,
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshToken: newRefresh,
      refreshTokenExpiresAt: newExpiresAt,
      tokenType: 'Bearer',
    }
  }
}
