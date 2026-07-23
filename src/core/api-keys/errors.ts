import { NotFoundError, UnauthorizedError, ValidationError } from '../shared/errors.js'

export class ApiKeyNotFoundError extends NotFoundError {
  override readonly code: string = 'API_KEY_NOT_FOUND'
  constructor(id: string) {
    super(`API key not found: ${id}`, { id })
  }
}

export class InvalidApiKeyError extends UnauthorizedError {
  override readonly code: string = 'INVALID_API_KEY'
  constructor() {
    super('API key is invalid, expired, or revoked')
  }
}

export class InvalidApiKeyScopeError extends ValidationError {
  override readonly code: string = 'INVALID_API_KEY_SCOPE'
  constructor(scope: string) {
    super(`Unknown scope requested for API key: ${scope}`, { scope })
  }
}
