import { AUDIT_ACTIONS } from '../../../core/audit/entities.js'
import type { AuditSink } from '../../../core/audit/ports.js'
import {
  TenantNotFoundError,
  TenantSuspendedError,
  UserAlreadyExistsError,
} from '../../../core/auth/errors.js'
import type {
  CredentialRepository,
  PasswordHasher,
  TenantRepository,
  UserRepository,
} from '../../../core/auth/ports.js'
import { Email } from '../../../core/shared/email.js'

export interface RegisterUserInput {
  tenantSlug: string
  email: string
  password: string
  displayName?: string | undefined
  ip?: string | null | undefined
  userAgent?: string | null | undefined
}

export interface RegisterUserResult {
  userId: string
  tenantId: string
  email: string
}

export class RegisterUser {
  constructor(
    private readonly tenants: TenantRepository,
    private readonly users: UserRepository,
    private readonly credentials: CredentialRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditSink,
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserResult> {
    const tenant = await this.tenants.findBySlug(input.tenantSlug)
    if (!tenant) throw new TenantNotFoundError(input.tenantSlug)
    if (tenant.status === 'SUSPENDED') throw new TenantSuspendedError()

    const email = Email.create(input.email)

    const existing = await this.users.findByEmail(tenant.id, email.normalized)
    if (existing) throw new UserAlreadyExistsError(email.value)

    const hashedPassword = await this.hasher.hash(input.password)

    const user = await this.users.create({
      tenantId: tenant.id,
      email: email.value,
      emailNormalized: email.normalized,
      displayName: input.displayName ?? null,
    })

    await this.credentials.upsertPassword(user.id, hashedPassword)

    await this.audit.record({
      tenantId: tenant.id,
      actorType: 'user',
      actorId: user.id,
      action: AUDIT_ACTIONS.userRegistered,
      resourceType: 'user',
      resourceId: user.id,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: { email: user.email },
      outcome: 'success',
    })

    return { userId: user.id, tenantId: tenant.id, email: user.email }
  }
}
