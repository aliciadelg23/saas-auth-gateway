import { PrismaClient } from '@prisma/client'

import { loadEnv } from '../src/config/index.js'
import { buildContainer } from '../src/container.js'
import {
  SYSTEM_ROLES,
  SYSTEM_ROLE_PERMISSIONS,
  type SystemRoleName,
} from '../src/core/rbac/permissions.js'

async function main(): Promise<void> {
  const env = loadEnv()
  const prisma = new PrismaClient()

  try {
    const container = buildContainer(env, { prisma })

    const tenant =
      (await prisma.tenant.findUnique({ where: { slug: 'acme' } })) ??
      (await prisma.tenant.create({ data: { slug: 'acme', name: 'Acme Corporation' } }))

    console.log(`Tenant ready: ${tenant.slug} (${tenant.id})`)

    for (const [name, permissions] of Object.entries(SYSTEM_ROLE_PERMISSIONS) as [
      SystemRoleName,
      readonly string[],
    ][]) {
      const existing = await container.repositories.roles.findByName(tenant.id, name)
      if (existing) {
        await container.repositories.roles.replacePermissions(existing.id, permissions)
        console.log(`System role synced: ${name} (${existing.id})`)
      } else {
        const created = await container.repositories.roles.create({
          tenantId: tenant.id,
          name,
          description: `System role: ${name}`,
          isSystem: true,
          permissions,
        })
        console.log(`System role created: ${name} (${created.id})`)
      }
    }

    const adminEmail = 'admin@acme.test'
    const adminPassword = 'ChangeMe!123'

    const existing = await prisma.user.findFirst({
      where: { tenantId: tenant.id, emailNormalized: adminEmail.toLowerCase() },
    })

    if (existing) {
      console.log(`Admin user already exists: ${existing.email}`)
    } else {
      const result = await container.useCases.registerUser.execute({
        tenantSlug: tenant.slug,
        email: adminEmail,
        password: adminPassword,
        displayName: 'Acme Admin',
      })
      console.log(`Admin user created: ${result.email} (${result.userId})`)
      console.log(`  password: ${adminPassword}  (rotate before any real use)`)

      const ownerRole = await container.repositories.roles.findByName(tenant.id, SYSTEM_ROLES.owner)
      if (ownerRole) {
        await container.repositories.userRoles.assign({
          userId: result.userId,
          roleId: ownerRole.id,
          grantedBy: null,
        })
        console.log(`  granted role: ${SYSTEM_ROLES.owner}`)
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error)
  process.exit(1)
})
