import type { Role } from '../../../core/rbac/entities.js'
import type { RoleRepository } from '../../../core/rbac/ports.js'

export class ListRoles {
  constructor(private readonly roles: RoleRepository) {}

  async execute(input: {
    tenantId: string
    cursor?: string | null
    limit?: number
  }): Promise<{ items: Role[]; nextCursor: string | null }> {
    return this.roles.list(input.tenantId, {
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
  }
}
