/**
 * Abstraction over the system clock. Making time an injectable dependency
 * keeps use cases deterministic in tests and lets us fast-forward without
 * touching timers.
 */
export interface Clock {
  now(): Date
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date()
  }
}
