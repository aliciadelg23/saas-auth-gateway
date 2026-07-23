import type { PermissionEvaluator, UserRoleRepository } from '../../../core/rbac/ports.js'

export class RbacPermissionEvaluator implements PermissionEvaluator {
  constructor(private readonly userRoles: UserRoleRepository) {}

  async userCan(userId: string, action: string): Promise<boolean> {
    const permissions = await this.userRoles.permissionsForUser(userId)
    return permissions.includes(action)
  }

  async permissionsFor(userId: string): Promise<Set<string>> {
    const permissions = await this.userRoles.permissionsForUser(userId)
    return new Set(permissions)
  }
}
