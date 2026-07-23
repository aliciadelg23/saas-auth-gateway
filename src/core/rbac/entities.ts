export interface Role {
  readonly id: string
  readonly tenantId: string
  readonly name: string
  readonly description: string | null
  readonly isSystem: boolean
  readonly permissions: readonly string[]
  readonly createdAt: Date
  readonly updatedAt: Date
}

export interface UserRoleAssignment {
  readonly id: string
  readonly userId: string
  readonly roleId: string
  readonly grantedAt: Date
  readonly grantedBy: string | null
}
