import { PrismaClient } from '@prisma/client'

import type { Env } from './config/index.js'
import type {
  CredentialRepository,
  PasswordHasher,
  RefreshTokenRepository,
  RefreshTokenService,
  SessionRepository,
  TenantRepository,
  TokenIssuer,
  UserRepository,
} from './core/auth/ports.js'
import { SystemClock, type Clock } from './core/shared/clock.js'
import { Argon2Hasher } from './infra/crypto/argon2-hasher.js'
import { JwtIssuer } from './infra/crypto/jwt-issuer.js'
import { HmacRefreshTokenService } from './infra/crypto/refresh-token-service.js'
import { PrismaCredentialRepository } from './infra/db/repositories/credential.js'
import { PrismaRefreshTokenRepository } from './infra/db/repositories/refresh-token.js'
import { PrismaSessionRepository } from './infra/db/repositories/session.js'
import { PrismaTenantRepository } from './infra/db/repositories/tenant.js'
import { PrismaUserRepository } from './infra/db/repositories/user.js'
import { LoginWithPassword } from './modules/auth/application/login-with-password.js'
import { Logout } from './modules/auth/application/logout.js'
import { RegisterUser } from './modules/auth/application/register-user.js'
import { RotateRefreshToken } from './modules/auth/application/rotate-refresh-token.js'

export interface AppContainer {
  env: Env
  clock: Clock
  prisma: PrismaClient
  repositories: {
    tenants: TenantRepository
    users: UserRepository
    credentials: CredentialRepository
    sessions: SessionRepository
    refreshTokens: RefreshTokenRepository
  }
  services: {
    passwordHasher: PasswordHasher
    tokenIssuer: TokenIssuer
    refreshTokens: RefreshTokenService
  }
  useCases: {
    registerUser: RegisterUser
    loginWithPassword: LoginWithPassword
    rotateRefreshToken: RotateRefreshToken
    logout: Logout
  }
}

export interface ContainerOverrides {
  prisma?: PrismaClient
  clock?: Clock
}

export function buildContainer(env: Env, overrides: ContainerOverrides = {}): AppContainer {
  const clock: Clock = overrides.clock ?? new SystemClock()
  const prisma =
    overrides.prisma ??
    new PrismaClient({
      log: [
        { level: 'warn', emit: 'event' },
        { level: 'error', emit: 'event' },
      ],
    })

  const tenants = new PrismaTenantRepository(prisma)
  const users = new PrismaUserRepository(prisma)
  const credentials = new PrismaCredentialRepository(prisma)
  const sessions = new PrismaSessionRepository(prisma)
  const refreshTokens = new PrismaRefreshTokenRepository(prisma)

  const passwordHasher = new Argon2Hasher(env.PASSWORD_PEPPER)
  const refreshTokenService = new HmacRefreshTokenService(
    env.PASSWORD_PEPPER || env.JWT_KEY_ID,
    env.REFRESH_TOKEN_BYTES,
  )
  const jwtConfig: ConstructorParameters<typeof JwtIssuer>[0] = {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTokenTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    keyId: env.JWT_KEY_ID,
  }
  if (env.JWT_PRIVATE_KEY_PEM) jwtConfig.privateKeyPem = env.JWT_PRIVATE_KEY_PEM
  if (env.JWT_PUBLIC_KEY_PEM) jwtConfig.publicKeyPem = env.JWT_PUBLIC_KEY_PEM
  const tokenIssuer = new JwtIssuer(jwtConfig, clock)

  const registerUser = new RegisterUser(tenants, users, credentials, passwordHasher)
  const loginWithPassword = new LoginWithPassword(
    tenants,
    users,
    credentials,
    passwordHasher,
    sessions,
    refreshTokens,
    refreshTokenService,
    tokenIssuer,
    clock,
    { refreshTokenTtlSeconds: env.JWT_REFRESH_TTL_SECONDS },
  )
  const rotateRefreshToken = new RotateRefreshToken(
    refreshTokens,
    refreshTokenService,
    sessions,
    tokenIssuer,
    clock,
    { refreshTokenTtlSeconds: env.JWT_REFRESH_TTL_SECONDS },
  )
  const logout = new Logout(refreshTokens, refreshTokenService, sessions)

  return {
    env,
    clock,
    prisma,
    repositories: { tenants, users, credentials, sessions, refreshTokens },
    services: { passwordHasher, tokenIssuer, refreshTokens: refreshTokenService },
    useCases: { registerUser, loginWithPassword, rotateRefreshToken, logout },
  }
}
