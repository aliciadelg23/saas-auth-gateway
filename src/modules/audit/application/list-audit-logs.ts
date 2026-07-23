import type { AuditRecord } from '../../../core/audit/entities.js'
import type { AuditLogQuery, AuditLogRepository } from '../../../core/audit/ports.js'

export class ListAuditLogs {
  constructor(private readonly repo: AuditLogRepository) {}

  async execute(query: AuditLogQuery): Promise<{
    items: AuditRecord[]
    nextCursor: string | null
  }> {
    return this.repo.list(query)
  }
}
