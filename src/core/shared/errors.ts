/**
 * Base class for all domain errors. Every domain error carries a stable
 * `code` (for API clients) and an HTTP status hint used by the error
 * mapper at the edge.
 *
 * Concrete subclasses override `code` with their own literal string.
 * The mid-level classes (`ValidationError`, `UnauthorizedError`, …)
 * expose their code as a broad `string` so specific subclasses can
 * narrow it.
 */
export abstract class DomainError extends Error {
  abstract readonly code: string
  abstract readonly status: number
  readonly details?: Readonly<Record<string, unknown>>

  constructor(message: string, details?: Readonly<Record<string, unknown>>) {
    super(message)
    this.name = new.target.name
    if (details !== undefined) {
      this.details = details
    }
  }
}

export class ValidationError extends DomainError {
  readonly code: string = 'VALIDATION_ERROR'
  readonly status = 400
}

export class UnauthorizedError extends DomainError {
  readonly code: string = 'UNAUTHORIZED'
  readonly status = 401
}

export class ForbiddenError extends DomainError {
  readonly code: string = 'FORBIDDEN'
  readonly status = 403
}

export class NotFoundError extends DomainError {
  readonly code: string = 'NOT_FOUND'
  readonly status = 404
}

export class ConflictError extends DomainError {
  readonly code: string = 'CONFLICT'
  readonly status = 409
}

export class TooManyRequestsError extends DomainError {
  readonly code: string = 'TOO_MANY_REQUESTS'
  readonly status = 429
}
