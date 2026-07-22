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
    private readonly config: LoginConfig,
  ) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const tenant = await this.tenants.findBySlug(input.tenantSlug)
    if (!tenant) throw new TenantNotFoundError(input.tenantSlug)
    if (tenant.status === 'SUSPENDED') throw new TenantSuspendedError()

    const email = Email.create(input.email)
    const user = await this.users.findByEmail(tenant.id, email.normalized)
    if (!user) {
      // Even if the user does not exist we perform a dummy hash to keep
      // the response time roughly constant.
      await this.hasher.hash(input.password).catch(() => undefined)
      throw new InvalidCredentialsError()
    }

    if (user.status === 'DISABLED' || user.status === 'LOCKED') {
      throw new UserDisabledError()
    }

    const credential = await this.credentials.findByUserAndType(user.id, 'PASSWORD')
    if (!credential) {
      await this.hasher.hash(input.password).catch(() => undefined)
      throw new InvalidCredentialsError()
    }

    const ok = await this.hasher.verify(credential.secret, input.password)
    if (!ok) throw new InvalidCredentialsError()

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
}
