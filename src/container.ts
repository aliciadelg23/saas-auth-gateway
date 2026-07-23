import { PrismaClient } from '@prisma/client'
import type { onRequestAsyncHookHandler, preHandlerAsyncHookHandler } from 'fastify'

import type { Env } from './config/index.js'
import type { ApiKeyMinter, ApiKeyRepository } from './core/api-keys/ports.js'
import type { AuditLogRepository, AuditSink } from './core/audit/ports.js'
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
import type { PermissionEvaluator, RoleRepository, UserRoleRepository } from './core/rbac/ports.js'
import { SystemClock, type Clock } from './core/shared/clock.js'
import { PrismaAuditSink } from './infra/audit/prisma-audit-sink.js'
import { HmacApiKeyService } from './infra/crypto/api-key-service.js'
import { Argon2Hasher } from './infra/crypto/argon2-hasher.js'
import { JwtIssuer } from './infra/crypto/jwt-issuer.js'
import { HmacRefreshTokenService } from './infra/crypto/refresh-token-service.js'
import { PrismaApiKeyRepository } from './infra/db/repositories/api-key.js'
import { PrismaAuditLogRepository } from './infra/db/repositories/audit-log.js'
import { PrismaCredentialRepository } from './infra/db/repositories/credential.js'
import { PrismaRefreshTokenRepository } from './infra/db/repositories/refresh-token.js'
import { PrismaRoleRepository } from './infra/db/repositories/role.js'
import { PrismaSessionRepository } from './infra/db/repositories/session.js'
import { PrismaTenantRepository } from './infra/db/repositories/tenant.js'
import { PrismaUserRoleRepository } from './infra/db/repositories/user-role.js'
import { PrismaUserRepository } from './infra/db/repositories/user.js'
import { buildAuthenticate, type AuthenticateOptions } from './infra/http/hooks/authenticate.js'
import { buildRequirePermission } from './infra/http/hooks/require-permission.js'
import { CreateApiKey } from './modules/api-keys/application/create-api-key.js'
import { ListApiKeys } from './modules/api-keys/application/list-api-keys.js'
import { RevokeApiKey } from './modules/api-keys/application/revoke-api-key.js'
import { ListAuditLogs } from './modules/audit/application/list-audit-logs.js'
import { LoginWithPassword } from './modules/auth/application/login-with-password.js'
import { Logout } from './modules/auth/application/logout.js'
import { RegisterUser } from './modules/auth/application/register-user.js'
import { RotateRefreshToken } from './modules/auth/application/rotate-refresh-token.js'
import { GetDashboardOverview } from './modules/dashboard/application/get-overview.js'
import { AssignRole, UnassignRole } from './modules/rbac/application/assign-role.js'
import { CreateRole } from './modules/rbac/application/create-role.js'
import { ListRoles } from './modules/rbac/application/list-roles.js'
import { RbacPermissionEvaluator } from './modules/rbac/application/permission-evaluator.js'

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
    roles: RoleRepository
    userRoles: UserRoleRepository
    apiKeys: ApiKeyRepository
    auditLogs: AuditLogRepository
  }
  services: {
    passwordHasher: PasswordHasher
    tokenIssuer: TokenIssuer
    refreshTokens: RefreshTokenService
    apiKeyMinter: ApiKeyMinter
    permissionEvaluator: PermissionEvaluator
    audit: AuditSink
    authenticate: onRequestAsyncHookHandler
    requirePermission: (action: string) => preHandlerAsyncHookHandler
  }
  useCases: {
    registerUser: RegisterUser
    loginWithPassword: LoginWithPassword
    rotateRefreshToken: RotateRefreshToken
    logout: Logout
    createRole: CreateRole
    listRoles: ListRoles
    assignRole: AssignRole
    unassignRole: UnassignRole
    createApiKey: CreateApiKey
    listApiKeys: ListApiKeys
    revokeApiKey: RevokeApiKey
    listAuditLogs: ListAuditLogs
    getDashboardOverview: GetDashboardOverview
  }
}

export interface ContainerOverrides {
  prisma?: PrismaClient
  clock?: Clock
  audit?: AuditSink
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
  const roles = new PrismaRoleRepository(prisma)
  const userRoles = new PrismaUserRoleRepository(prisma)
  const apiKeys = new PrismaApiKeyRepository(prisma)
  const auditLogs = new PrismaAuditLogRepository(prisma)

  const passwordHasher = new Argon2Hasher(env.PASSWORD_PEPPER)
  const refreshTokenService = new HmacRefreshTokenService(
    env.PASSWORD_PEPPER || env.JWT_KEY_ID,
    env.REFRESH_TOKEN_BYTES,
  )
  const apiKeyMinter = new HmacApiKeyService(env.PASSWORD_PEPPER || env.JWT_KEY_ID)

  const jwtConfig: ConstructorParameters<typeof JwtIssuer>[0] = {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    accessTokenTtlSeconds: env.JWT_ACCESS_TTL_SECONDS,
    keyId: env.JWT_KEY_ID,
  }
  if (env.JWT_PRIVATE_KEY_PEM) jwtConfig.privateKeyPem = env.JWT_PRIVATE_KEY_PEM
  if (env.JWT_PUBLIC_KEY_PEM) jwtConfig.publicKeyPem = env.JWT_PUBLIC_KEY_PEM
  const tokenIssuer = new JwtIssuer(jwtConfig, clock)

  const audit: AuditSink = overrides.audit ?? new PrismaAuditSink(prisma)
  const permissionEvaluator = new RbacPermissionEvaluator(userRoles)

  const authenticateOpts: AuthenticateOptions = {
    tokenIssuer,
    sessions,
    apiKeys,
    apiKeyMinter,
    clock,
  }
  const authenticate = buildAuthenticate(authenticateOpts)
  const requirePermission = buildRequirePermission(permissionEvaluator)

  const registerUser = new RegisterUser(tenants, users, credentials, passwordHasher, audit)
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
    audit,
    { refreshTokenTtlSeconds: env.JWT_REFRESH_TTL_SECONDS },
  )
  const rotateRefreshToken = new RotateRefreshToken(
    refreshTokens,
    refreshTokenService,
    sessions,
    tokenIssuer,
    clock,
    audit,
    { refreshTokenTtlSeconds: env.JWT_REFRESH_TTL_SECONDS },
  )
  const logout = new Logout(refreshTokens, refreshTokenService, sessions, audit)

  const createRole = new CreateRole(tenants, roles, audit)
  const listRoles = new ListRoles(roles)
  const assignRole = new AssignRole(users, roles, userRoles, audit)
  const unassignRole = new UnassignRole(roles, userRoles, audit)
  const createApiKey = new CreateApiKey(tenants, apiKeys, apiKeyMinter, audit)
  const listApiKeys = new ListApiKeys(apiKeys)
  const revokeApiKey = new RevokeApiKey(apiKeys, audit)
  const listAuditLogs = new ListAuditLogs(auditLogs)
  const getDashboardOverview = new GetDashboardOverview(prisma)

  return {
    env,
    clock,
    prisma,
    repositories: {
      tenants,
      users,
      credentials,
      sessions,
      refreshTokens,
      roles,
      userRoles,
      apiKeys,
      auditLogs,
    },
    services: {
      passwordHasher,
      tokenIssuer,
      refreshTokens: refreshTokenService,
      apiKeyMinter,
      permissionEvaluator,
      audit,
      authenticate,
      requirePermission,
    },
    useCases: {
      registerUser,
      loginWithPassword,
      rotateRefreshToken,
      logout,
      createRole,
      listRoles,
      assignRole,
      unassignRole,
      createApiKey,
      listApiKeys,
      revokeApiKey,
      listAuditLogs,
      getDashboardOverview,
    },
  }
}
