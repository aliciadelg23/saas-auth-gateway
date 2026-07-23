import { PrismaClient } from '@prisma/client'

import type { Env } from '../../src/config/index.js'

const TEST_DB_MARKER = 'DATABASE_URL'

export function requireTestDatabase(): void {
  if (!process.env[TEST_DB_MARKER]) {
    throw new Error(
      `Integration tests require a running Postgres. Set ${TEST_DB_MARKER} to point at a test database (e.g. docker compose up -d postgres).`,
    )
  }
}

let cached: PrismaClient | null = null

export function makeTestPrismaClient(_env: Env): PrismaClient {
  if (!cached) {
    cached = new PrismaClient({ log: [] })
  }
  return cached
}

/**
 * Truncate all mutable state between tests. Order respects foreign keys:
 * children (audit, sessions, refresh_tokens, credentials, user_roles,
 * role_permissions, api_keys) first, then parents (users, roles,
 * tenants).
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.credential.deleteMany(),
    prisma.userRole.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.apiKey.deleteMany(),
    prisma.user.deleteMany(),
    prisma.role.deleteMany(),
    prisma.tenant.deleteMany(),
  ])
}
