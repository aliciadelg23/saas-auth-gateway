import type { AuditEvent, AuditRecord } from './entities.js'

/**
 * Fire-and-forget sink for audit events. Implementations MUST NOT throw
 * out of `record` — a persistence failure should be swallowed and
 * logged out-of-band so the primary flow (login, register, etc.) is
 * never blocked by the audit trail.
 */
export interface AuditSink {
  record(event: AuditEvent): Promise<void>
}

export interface AuditLogQuery {
  tenantId?: string | null
  action?: string
  actorId?: string
  resourceType?: string
  resourceId?: string
  outcome?: 'success' | 'failure'
  since?: Date
  until?: Date
  limit?: number
  cursor?: string | null
}

export interface AuditLogRepository {
  list(query: AuditLogQuery): Promise<{ items: AuditRecord[]; nextCursor: string | null }>
  count(query: Omit<AuditLogQuery, 'limit' | 'cursor'>): Promise<number>
}
