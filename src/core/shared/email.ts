import { ValidationError } from './errors.js'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Value object for e-mail addresses. Normalizes the value to lowercase
 * and validates the format. Two `Email` instances are equal if their
 * `normalized` form matches.
 */
export class Email {
  private constructor(
    readonly value: string,
    readonly normalized: string,
  ) {}

  static create(raw: string): Email {
    const trimmed = raw.trim()
    if (trimmed.length === 0 || trimmed.length > 254 || !EMAIL_REGEX.test(trimmed)) {
      throw new ValidationError('Invalid e-mail address format', { email: raw })
    }
    return new Email(trimmed, trimmed.toLowerCase())
  }

  equals(other: Email): boolean {
    return this.normalized === other.normalized
  }

  toString(): string {
    return this.value
  }
}
