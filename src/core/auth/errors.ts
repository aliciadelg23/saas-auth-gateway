import { ConflictError, NotFoundError, UnauthorizedError } from '../shared/errors.js'

export class TenantNotFoundError extends NotFoundError {
  override readonly code: string = 'TENANT_NOT_FOUND'
  constructor(tenantSlug: string) {
    super(`Tenant not found: ${tenantSlug}`, { tenantSlug })
  }
}

export class UserAlreadyExistsError extends ConflictError {
  override readonly code: string = 'USER_ALREADY_EXISTS'
  constructor(email: string) {
    super(`A user with email ${email} already exists in this tenant`, { email })
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  override readonly code: string = 'INVALID_CREDENTIALS'
  constructor() {
    super('Invalid email or password')
  }
}

export class UserDisabledError extends UnauthorizedError {
  override readonly code: string = 'USER_DISABLED'
  constructor() {
    super('This account has been disabled')
  }
}

export class TenantSuspendedError extends UnauthorizedError {
  override readonly code: string = 'TENANT_SUSPENDED'
  constructor() {
    super('This tenant is suspended')
  }
}

export class InvalidRefreshTokenError extends UnauthorizedError {
  override readonly code: string = 'INVALID_REFRESH_TOKEN'
  constructor() {
    super('Refresh token is invalid, expired, or revoked')
  }
}

export class RefreshTokenReuseError extends UnauthorizedError {
  override readonly code: string = 'REFRESH_TOKEN_REUSE_DETECTED'
  constructor() {
    super('Refresh token reuse detected; session revoked')
  }
}
