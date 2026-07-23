import type { ApiKey } from '../../../core/api-keys/entities.js'
import { InvalidApiKeyScopeError } from '../../../core/api-keys/errors.js'
import type { ApiKeyMinter, ApiKeyRepository } from '../../../core/api-keys/ports.js'
import { AUDIT_ACTIONS } from '../../../core/audit/entities.js'
import type { AuditSink } from '../../../core/audit/ports.js'
import { TenantNotFoundError } from '../../../core/auth/errors.js'
import type { TenantRepository } from '../../../core/auth/ports.js'
import { isKnownPermission } from '../../../core/rbac/permissions.js'

export interface CreateApiKeyInput {
  tenantId: string
  name: string
  scopes: readonly string[]
  expiresAt?: Date | null | undefined
  actorId?: string | null | undefined
  ip?: string | null | undefined
  userAgent?: string | null | undefined
}

export interface CreateApiKeyResult {
  key: ApiKey
  /** Full plaintext key. Returned exactly once — clients must persist it themselves. */
  plaintext: string
}

export class CreateApiKey {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly keys: ApiKeyRepository,
    private readonly minter: ApiKeyMinter,
    private readonly audit: AuditSink,
  ) {}

  async execute(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
    const tenant = await this.tenants.findById(input.tenantId)
    if (!tenant) throw new TenantNotFoundError(input.tenantId)

    for (const scope of input.scopes) {
      if (!isKnownPermission(scope)) throw new InvalidApiKeyScopeError(scope)
    }

    const { plaintext, prefix, tokenHash } = this.minter.mint()

    const key = await this.keys.create({
      tenantId: input.tenantId,
      name: input.name,
      prefix,
      tokenHash,
      scopes: input.scopes,
      createdBy: input.actorId ?? null,
      expiresAt: input.expiresAt ?? null,
    })

    await this.audit.record({
      tenantId: input.tenantId,
      actorType: input.actorId ? 'user' : 'system',
      actorId: input.actorId ?? null,
      action: AUDIT_ACTIONS.apiKeyCreated,
      resourceType: 'api_key',
      resourceId: key.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { name: key.name, scopes: key.scopes, prefix: key.prefix },
      outcome: 'success',
    })

    return { key, plaintext }
  }
}
