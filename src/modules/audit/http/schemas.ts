import { z } from 'zod'

export const AuditLogQuery = z.object({
  action: z.string().optional(),
  actorId: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().optional(),
  outcome: z.enum(['success', 'failure']).optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})

export const AuditLogRecordResponse = z.object({
  id: z.string(),
  tenantId: z.string().nullable(),
  actorType: z.enum(['user', 'api-key', 'system']),
  actorId: z.string().nullable(),
  action: z.string(),
  resourceType: z.string().nullable(),
  resourceId: z.string().nullable(),
  ip: z.string().nullable(),
  userAgent: z.string().nullable(),
  metadata: z.record(z.unknown()),
  outcome: z.enum(['success', 'failure']),
  createdAt: z.string(),
})

export const AuditLogListResponse = z.object({
  items: z.array(AuditLogRecordResponse),
  nextCursor: z.string().nullable(),
})
