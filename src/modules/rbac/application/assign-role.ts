import { AUDIT_ACTIONS } from '../../../core/audit/entities.js'
import type { AuditSink } from '../../../core/audit/ports.js'
import type { UserRepository } from '../../../core/auth/ports.js'
import { RoleNotFoundError } from '../../../core/rbac/errors.js'
import type { RoleRepository, UserRoleRepository } from '../../../core/rbac/ports.js'
import { NotFoundError } from '../../../core/shared/errors.js'

export interface AssignRoleInput {
  tenantId: string
  userId: string
  roleId: string
  actorId?: string | null | undefined
  ip?: string | null | undefined
  userAgent?: string | null | undefined
}

export class AssignRole {
  constructor(
    private readonly users: UserRepository,
    private readonly roles: RoleRepository,
    private readonly userRoles: UserRoleRepository,
    private readonly audit: AuditSink,
  ) {}

  async execute(input: AssignRoleInput): Promise<void> {
    const user = await this.users.findById(input.tenantId, input.userId)
    if (!user) throw new NotFoundError(`User not found: ${input.userId}`)

    const role = await this.roles.findById(input.tenantId, input.roleId)
    if (!role) throw new RoleNotFoundError(input.roleId)

    await this.userRoles.assign({
      userId: input.userId,
      roleId: input.roleId,
      grantedBy: input.actorId ?? null,
    })

    await this.audit.record({
      tenantId: input.tenantId,
      actorType: input.actorId ? 'user' : 'system',
      actorId: input.actorId ?? null,
      action: AUDIT_ACTIONS.roleAssigned,
      resourceType: 'user',
      resourceId: input.userId,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { roleId: role.id, roleName: role.name },
      outcome: 'success',
    })
  }
}

export class UnassignRole {
  constructor(
    private readonly roles: RoleRepository,
    private readonly userRoles: UserRoleRepository,
    private readonly audit: AuditSink,
  ) {}

  async execute(input: AssignRoleInput): Promise<void> {
    const role = await this.roles.findById(input.tenantId, input.roleId)
    if (!role) throw new RoleNotFoundError(input.roleId)

    await this.userRoles.unassign(input.userId, input.roleId)

    await this.audit.record({
      tenantId: input.tenantId,
      actorType: input.actorId ? 'user' : 'system',
      actorId: input.actorId ?? null,
      action: AUDIT_ACTIONS.roleUnassigned,
      resourceType: 'user',
      resourceId: input.userId,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { roleId: role.id, roleName: role.name },
      outcome: 'success',
    })
  }
}
