import type { Role, UserRoleAssignment } from './entities.js'

export interface RoleRepository {
  findById(tenantId: string, id: string): Promise<Role | null>
  findByName(tenantId: string, name: string): Promise<Role | null>
  list(
    tenantId: string,
    opts?: { limit?: number; cursor?: string | null },
  ): Promise<{
    items: Role[]
    nextCursor: string | null
  }>
  create(input: {
    tenantId: string
    name: string
    description: string | null
    isSystem: boolean
    permissions: readonly string[]
  }): Promise<Role>
  replacePermissions(roleId: string, permissions: readonly string[]): Promise<Role>
  delete(roleId: string): Promise<void>
}

export interface UserRoleRepository {
  assign(input: {
    userId: string
    roleId: string
    grantedBy: string | null
  }): Promise<UserRoleAssignment>
  unassign(userId: string, roleId: string): Promise<void>
  listForUser(userId: string): Promise<UserRoleAssignment[]>
  permissionsForUser(userId: string): Promise<string[]>
}

export interface PermissionEvaluator {
  /** Returns `true` if the user has *any* role that grants `action`. */
  userCan(userId: string, action: string): Promise<boolean>
  /** Fetches the full permission set for a user (deduped). */
  permissionsFor(userId: string): Promise<Set<string>>
}
