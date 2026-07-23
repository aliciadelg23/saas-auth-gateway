import { AUDIT_ACTIONS } from '../../../core/audit/entities.js'
import type { AuditSink } from '../../../core/audit/ports.js'
import type {
  RefreshTokenRepository,
  RefreshTokenService,
  SessionRepository,
} from '../../../core/auth/ports.js'

export interface LogoutInput {
  refreshToken: string
  ip?: string | null | undefined
  userAgent?: string | null | undefined
}

/**
 * Idempotent logout: revokes the entire refresh-token family + the
 * owning session on match, treats any other token silently as
 * already-invalid.
 */
export class Logout {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly sessions: SessionRepository,
    private readonly audit: AuditSink,
  ) {}

  async execute(input: LogoutInput): Promise<void> {
    const hash = this.refreshTokenService.hash(input.refreshToken)
    const stored = await this.refreshTokens.findByHash(hash)
    if (!stored) return

    const session = await this.sessions.findById(stored.sessionId)
    await this.refreshTokens.revokeFamily(stored.familyId, 'LOGOUT')
    await this.sessions.revoke(stored.sessionId, 'LOGOUT')

    await this.audit.record({
      tenantId: session?.tenantId ?? null,
      actorType: 'user',
      actorId: session?.userId ?? null,
      action: AUDIT_ACTIONS.sessionRevoked,
      resourceType: 'session',
      resourceId: stored.sessionId,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { reason: 'logout' },
      outcome: 'success',
    })
  }
}
