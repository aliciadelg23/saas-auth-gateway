import { z } from 'zod'

export const DashboardOverviewResponse = z.object({
  tenantId: z.string(),
  counts: z.object({
    users: z.number().int(),
    activeUsers: z.number().int(),
    roles: z.number().int(),
    apiKeys: z.number().int(),
    activeSessions: z.number().int(),
  }),
  recentAuditEvents: z.array(
    z.object({
      action: z.string(),
      actorId: z.string().nullable(),
      outcome: z.string(),
      createdAt: z.string(),
    }),
  ),
})
