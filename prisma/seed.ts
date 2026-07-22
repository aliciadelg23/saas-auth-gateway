import { PrismaClient } from '@prisma/client'

import { loadEnv } from '../src/config/index.js'
import { buildContainer } from '../src/container.js'

async function main(): Promise<void> {
  const env = loadEnv()
  const prisma = new PrismaClient()

  try {
    const container = buildContainer(env, { prisma })

    const tenant =
      (await prisma.tenant.findUnique({ where: { slug: 'acme' } })) ??
      (await prisma.tenant.create({ data: { slug: 'acme', name: 'Acme Corporation' } }))

    console.log(`Tenant ready: ${tenant.slug} (${tenant.id})`)

    const adminEmail = 'admin@acme.test'
    const adminPassword = 'ChangeMe!123'

    const existing = await prisma.user.findFirst({
      where: { tenantId: tenant.id, emailNormalized: adminEmail.toLowerCase() },
    })

    if (existing) {
      console.log(`Admin user already exists: ${existing.email}`)
      return
    }

    const result = await container.useCases.registerUser.execute({
      tenantSlug: tenant.slug,
      email: adminEmail,
      password: adminPassword,
      displayName: 'Acme Admin',
    })

    console.log(`Admin user created: ${result.email} (${result.userId})`)
    console.log(`  password: ${adminPassword}  (rotate before any real use)`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error)
  process.exit(1)
})
