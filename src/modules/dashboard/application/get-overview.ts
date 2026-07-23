import type { PrismaClient } from '@prisma/client'

export interface DashboardOverview {
  tenantId: string
  counts: {
    users: number
    activeUsers: number
    roles: number
    apiKeys: number
    activeSessions: number
  }
  recentAuditEvents: {
    action: string
    actorId: string | null
    outcome: string
    createdAt: Date
  }[]
}

/**
 * Rolls the tenant-scoped counters and the last 10 audit events into a
 * single response so the admin UI can render a landing page in one
 * round-trip.
 */
export class GetDashboardOverview {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(input: { tenantId: string }): Promise<DashboardOverview> {
    const [users, activeUsers, roles, apiKeys, activeSessions, recentEvents] = await Promise.all([
      this.prisma.user.count({ where: { tenantId: input.tenantId } }),
      this.prisma.user.count({ where: { tenantId: input.tenantId, status: 'ACTIVE' } }),
      this.prisma.role.count({ where: { tenantId: input.tenantId } }),
      this.prisma.apiKey.count({ where: { tenantId: input.tenantId, revokedAt: null } }),
      this.prisma.session.count({
        where: {
          tenantId: input.tenantId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      }),
      this.prisma.auditLog.findMany({
        where: { tenantId: input.tenantId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { action: true, actorId: true, outcome: true, createdAt: true },
      }),
    ])

    return {
      tenantId: input.tenantId,
      counts: { users, activeUsers, roles, apiKeys, activeSessions },
      recentAuditEvents: recentEvents,
    }
  }
}
