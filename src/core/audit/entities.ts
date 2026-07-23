export type AuditOutcome = 'success' | 'failure'
export type ActorType = 'user' | 'api-key' | 'system'

export interface AuditEvent {
  readonly tenantId: string | null
  readonly actorType: ActorType
  readonly actorId: string | null
  readonly action: string
  readonly resourceType: string | null
  readonly resourceId: string | null
  readonly ip: string | null
  readonly userAgent: string | null
  readonly metadata: Readonly<Record<string, unknown>>
  readonly outcome: AuditOutcome
}

export interface AuditRecord extends AuditEvent {
  readonly id: string
  readonly createdAt: Date
}

/**
 * Canonical action strings emitted by the auth pipeline. Consumers of
 * the audit-log API can rely on these being stable.
 */
export const AUDIT_ACTIONS = {
  userRegistered: 'auth.user.registered',
  userLoggedIn: 'auth.user.logged_in',
  userLoginFailed: 'auth.user.login_failed',
  refreshTokenRotated: 'auth.refresh_token.rotated',
  refreshTokenReuse: 'auth.refresh_token.reuse_detected',
  sessionRevoked: 'auth.session.revoked',
  roleCreated: 'iam.role.created',
  roleDeleted: 'iam.role.deleted',
  roleAssigned: 'iam.role.assigned',
  roleUnassigned: 'iam.role.unassigned',
  apiKeyCreated: 'iam.api_key.created',
  apiKeyRevoked: 'iam.api_key.revoked',
} as const
