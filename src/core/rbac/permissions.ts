/**
 * Permission catalog. Every action the server can authorize is declared
 * here as a `resource.action` string. Route guards and the seed script
 * import from this file so the set stays discoverable in one place.
 *
 * A permission is a pair verbs "resource" + "action". Higher-privilege
 * roles are combinations of permissions, not layered scopes.
 */
export const PERMISSIONS = {
  tenants: {
    read: 'iam.tenants.read',
    write: 'iam.tenants.write',
  },
  users: {
    read: 'iam.users.read',
    write: 'iam.users.write',
    delete: 'iam.users.delete',
  },
  roles: {
    read: 'iam.roles.read',
    write: 'iam.roles.write',
    assign: 'iam.roles.assign',
  },
  apiKeys: {
    read: 'iam.api-keys.read',
    write: 'iam.api-keys.write',
  },
  audit: {
    read: 'iam.audit.read',
  },
  dashboard: {
    read: 'iam.dashboard.read',
  },
} as const

/**
 * Flat list of every permission string in the catalog. Iterated by the
 * seeder to attach permissions to system roles and by the audit-log
 * viewer to autocomplete.
 */
export const ALL_PERMISSIONS: readonly string[] = Object.freeze(
  Object.values(PERMISSIONS).flatMap((group) => Object.values(group)),
)

/**
 * Well-known system role names. `owner` inherits every permission,
 * `admin` covers day-to-day IAM management, `member` is read-only
 * baseline access for authenticated users.
 */
export const SYSTEM_ROLES = {
  owner: 'owner',
  admin: 'admin',
  member: 'member',
} as const

export type SystemRoleName = (typeof SYSTEM_ROLES)[keyof typeof SYSTEM_ROLES]

const P = PERMISSIONS

export const SYSTEM_ROLE_PERMISSIONS: Readonly<Record<SystemRoleName, readonly string[]>> = {
  owner: ALL_PERMISSIONS,
  admin: [
    P.users.read,
    P.users.write,
    P.roles.read,
    P.roles.write,
    P.roles.assign,
    P.apiKeys.read,
    P.apiKeys.write,
    P.audit.read,
    P.dashboard.read,
  ],
  member: [P.users.read, P.dashboard.read],
}

export function isKnownPermission(value: string): boolean {
  return ALL_PERMISSIONS.includes(value)
}
