import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../shared/errors.js'

export class RoleNotFoundError extends NotFoundError {
  override readonly code: string = 'ROLE_NOT_FOUND'
  constructor(roleId: string) {
    super(`Role not found: ${roleId}`, { roleId })
  }
}

export class RoleAlreadyExistsError extends ConflictError {
  override readonly code: string = 'ROLE_ALREADY_EXISTS'
  constructor(name: string) {
    super(`A role named "${name}" already exists in this tenant`, { name })
  }
}

export class SystemRoleImmutableError extends ForbiddenError {
  override readonly code: string = 'SYSTEM_ROLE_IMMUTABLE'
  constructor(name: string) {
    super(`System role "${name}" cannot be modified`, { name })
  }
}

export class UnknownPermissionError extends ValidationError {
  override readonly code: string = 'UNKNOWN_PERMISSION'
  constructor(permission: string) {
    super(`Unknown permission: ${permission}`, { permission })
  }
}

export class PermissionDeniedError extends ForbiddenError {
  override readonly code: string = 'PERMISSION_DENIED'
  constructor(action: string) {
    super(`The current principal lacks permission "${action}"`, { action })
  }
}
