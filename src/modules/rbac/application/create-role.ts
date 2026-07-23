import { AUDIT_ACTIONS } from '../../../core/audit/entities.js'
import type { AuditSink } from '../../../core/audit/ports.js'
import { TenantNotFoundError } from '../../../core/auth/errors.js'
import type { TenantRepository } from '../../../core/auth/ports.js'
import type { Role } from '../../../core/rbac/entities.js'
import { RoleAlreadyExistsError, UnknownPermissionError } from '../../../core/rbac/errors.js'
import { isKnownPermission } from '../../../core/rbac/permissions.js'
import type { RoleRepository } from '../../../core/rbac/ports.js'

export interface CreateRoleInput {
  tenantId: string
  name: string
  description?: string | null | undefined
  permissions: readonly string[]
  actorId?: string | null | undefined
  ip?: string | null | undefined
  userAgent?: string | null | undefined
}

export class CreateRole {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly roles: RoleRepository,
    private readonly audit: AuditSink,
  ) {}

  async execute(input: CreateRoleInput): Promise<Role> {
    const tenant = await this.tenants.findById(input.tenantId)
    if (!tenant) throw new TenantNotFoundError(input.tenantId)

    for (const permission of input.permissions) {
      if (!isKnownPermission(permission)) throw new UnknownPermissionError(permission)
    }

    const existing = await this.roles.findByName(input.tenantId, input.name)
    if (existing) throw new RoleAlreadyExistsError(input.name)

    const role = await this.roles.create({
      tenantId: input.tenantId,
      name: input.name,
      description: input.description ?? null,
      isSystem: false,
      permissions: input.permissions,
    })

    await this.audit.record({
      tenantId: input.tenantId,
      actorType: input.actorId ? 'user' : 'system',
      actorId: input.actorId ?? null,
      action: AUDIT_ACTIONS.roleCreated,
      resourceType: 'role',
      resourceId: role.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { name: role.name, permissions: role.permissions },
      outcome: 'success',
    })

    return role
  }
}
