import type {
  RefreshTokenRepository,
  RefreshTokenService,
  SessionRepository,
} from '../../../core/auth/ports.js'

export interface LogoutInput {
  refreshToken: string
}

/**
 * Idempotent logout. Anything that resembles a "not usable anyway"
 * refresh token is treated as a successful logout — clients should
 * never receive an error trying to log out.
 */
export class Logout {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly sessions: SessionRepository,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const hash = this.refreshTokenService.hash(input.refreshToken)
    const stored = await this.refreshTokens.findByHash(hash)
    if (!stored) return

    await this.refreshTokens.revokeFamily(stored.familyId, 'LOGOUT')
    await this.sessions.revoke(stored.sessionId, 'LOGOUT')
  }
}
