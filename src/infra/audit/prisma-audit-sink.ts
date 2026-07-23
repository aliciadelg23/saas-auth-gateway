import type { PrismaClient } from '@prisma/client'
import type { FastifyBaseLogger } from 'fastify'

import type { AuditEvent } from '../../core/audit/entities.js'
import type { AuditSink } from '../../core/audit/ports.js'

/**
 * Persists audit events. Failures are swallowed (with a warning log) so
 * that a broken audit trail never blocks the primary auth flow.
 */
export class PrismaAuditSink implements AuditSink {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly log?: Pick<FastifyBaseLogger, 'warn'>,
  ) {}

  async record(event: AuditEvent): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          tenantId: event.tenantId,
          actorType: event.actorType,
          actorId: event.actorId,
          action: event.action,
          resourceType: event.resourceType,
          resourceId: event.resourceId,
          ip: event.ip,
          userAgent: event.userAgent,
          metadata: event.metadata as object,
          outcome: event.outcome,
        },
      })
    } catch (error) {
      this.log?.warn({ err: error, action: event.action }, 'audit sink write failed')
    }
  }
}

/** No-op sink used in tests that do not care about audit trails. */
export class NoopAuditSink implements AuditSink {
  async record(_event: AuditEvent): Promise<void> {
    // intentionally empty
  }
}
