import { ApiKeyNotFoundError } from '../../../core/api-keys/errors.js'
import type { ApiKeyRepository } from '../../../core/api-keys/ports.js'
import { AUDIT_ACTIONS } from '../../../core/audit/entities.js'
import type { AuditSink } from '../../../core/audit/ports.js'

export interface RevokeApiKeyInput {
  tenantId: string
  keyId: string
  reason?: string | undefined
  actorId?: string | null | undefined
  ip?: string | null | undefined
  userAgent?: string | null | undefined
}

export class RevokeApiKey {
  constructor(
    private readonly keys: ApiKeyRepository,
    private readonly audit: AuditSink,
  ) {}

  async execute(input: RevokeApiKeyInput): Promise<void> {
    const key = await this.keys.findById(input.tenantId, input.keyId)
    if (!key) throw new ApiKeyNotFoundError(input.keyId)

    await this.keys.revoke(input.keyId, input.reason ?? 'REVOKED_BY_USER')

    await this.audit.record({
      tenantId: input.tenantId,
      actorType: input.actorId ? 'user' : 'system',
      actorId: input.actorId ?? null,
      action: AUDIT_ACTIONS.apiKeyRevoked,
      resourceType: 'api_key',
      resourceId: input.keyId,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { name: key.name },
      outcome: 'success',
    })
  }
}
