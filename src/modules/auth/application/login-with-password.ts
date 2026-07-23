import { AUDIT_ACTIONS } from '../../../core/audit/entities.js'
import type { AuditSink } from '../../../core/audit/ports.js'
import {
  InvalidCredentialsError,
  TenantNotFoundError,
  TenantSuspendedError,
  UserDisabledError,
} from '../../../core/auth/errors.js'
import type {
  CredentialRepository,
  PasswordHasher,
  RefreshTokenRepository,
  RefreshTokenService,
  SessionRepository,
  TenantRepository,
  TokenIssuer,
  UserRepository,
} from '../../../core/auth/ports.js'
import type { Clock } from '../../../core/shared/clock.js'
import { Email } from '../../../core/shared/email.js'

export interface LoginInput {
  tenantSlug: string
  email: string
  password: string
  ip?: string | null | undefined
  userAgent?: string | null | undefined
}

export interface LoginResult {
  userId: string
  tenantId: string
  sessionId: string
  accessToken: string
  accessTokenExpiresAt: Date
  refreshToken: string
  refreshTokenExpiresAt: Date
  tokenType: 'Bearer'
}

export interface LoginConfig {
  refreshTokenTtlSeconds: number
}

export class LoginWithPassword {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly users: UserRepository,
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionRepository,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly tokenIssuer: TokenIssuer,
    private readonly clock: Clock,
    private readonly audit: AuditSink,
    private readonly config: LoginConfig,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const tenant = await this.tenants.findBySlug(input.tenantSlug)
    if (!tenant) throw new TenantNotFoundError(input.tenantSlug)
    if (tenant.status === 'SUSPENDED') throw new TenantSuspendedError()

    const email = Email.create(input.email)
    const user = await this.users.findByEmail(tenant.id, email.normalized)
    if (!user) {
      await this.hasher.hash(input.password).catch(() => undefined)
      await this.recordFailure(tenant.id, null, input, 'user_not_found')
      throw new InvalidCredentialsError()
    }

    if (user.status === 'DISABLED' || user.status === 'LOCKED') {
      await this.recordFailure(tenant.id, user.id, input, 'user_disabled')
      throw new UserDisabledError()
    }

    const credential = await this.credentials.findByUserAndType(user.id, 'PASSWORD')
    if (!credential) {
      await this.hasher.hash(input.password).catch(() => undefined)
      await this.recordFailure(tenant.id, user.id, input, 'no_password_credential')
      throw new InvalidCredentialsError()
    }

    const ok = await this.hasher.verify(credential.secret, input.password)
    if (!ok) {
      await this.recordFailure(tenant.id, user.id, input, 'bad_password')
      throw new InvalidCredentialsError()
    }

    const now = this.clock.now()
    const refreshExpiresAt = new Date(now.getTime() + this.config.refreshTokenTtlSeconds * 1000)

    const session = await this.sessions.create({
      userId: user.id,
      tenantId: tenant.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt: refreshExpiresAt,
    })

    const { token: refreshToken, tokenHash } = this.refreshTokenService.mint()

    await this.refreshTokens.create({
      sessionId: session.id,
      tokenHash,
      familyId: session.familyId,
      expiresAt: refreshExpiresAt,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    })

    const accessToken = await this.tokenIssuer.issueAccessToken({
      sub: user.id,
      tenantId: tenant.id,
      sessionId: session.id,
    })

    await this.audit.record({
      tenantId: tenant.id,
      actorType: 'user',
      actorId: user.id,
      action: AUDIT_ACTIONS.userLoggedIn,
      resourceType: 'session',
      resourceId: session.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { email: user.email },
      outcome: 'success',
    })

    return {
      userId: user.id,
      tenantId: tenant.id,
      sessionId: session.id,
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshToken,
      refreshTokenExpiresAt: refreshExpiresAt,
      tokenType: 'Bearer',
    }
  }

  private async recordFailure(
    tenantId: string,
    userId: string | null,
    input: LoginInput,
    reason: string,
  ): Promise<void> {
    await this.audit.record({
      tenantId,
      actorType: userId ? 'user' : 'system',
      actorId: userId,
      action: AUDIT_ACTIONS.userLoginFailed,
      resourceType: 'user',
      resourceId: userId,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { reason, email: input.email },
      outcome: 'failure',
    })
  }
}
