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

export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  await prisma.$transaction([
    prisma.refreshToken.deleteMany(),
    prisma.session.deleteMany(),
    prisma.credential.deleteMany(),
    prisma.user.deleteMany(),
    prisma.tenant.deleteMany(),
  ])
}
