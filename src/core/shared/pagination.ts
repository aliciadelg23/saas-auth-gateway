/**
 * Cursor-based pagination primitives.
 *
 * A cursor is the base64url-encoded JSON payload `{ t: <iso>, i: <id> }`
 * so callers can round-trip it opaquely. Implementations sort by
 * `createdAt DESC, id DESC` so ties break deterministically.
 */

export interface PageQuery {
  readonly limit?: number
  readonly cursor?: string | null
}

export interface PageResult<T> {
  readonly items: T[]
  readonly nextCursor: string | null
}

export const DEFAULT_PAGE_LIMIT = 20
export const MAX_PAGE_LIMIT = 100

export function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== 'number' || Number.isNaN(limit) || limit <= 0) return DEFAULT_PAGE_LIMIT
  return Math.min(Math.floor(limit), MAX_PAGE_LIMIT)
}

export interface CursorPayload {
  readonly createdAt: string
  readonly id: string
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

export function decodeCursor(cursor: string | null | undefined): CursorPayload | null {
  if (!cursor) return null
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'createdAt' in parsed &&
      'id' in parsed &&
      typeof (parsed as { createdAt: unknown }).createdAt === 'string' &&
      typeof (parsed as { id: unknown }).id === 'string'
    ) {
      return parsed as CursorPayload
    }
    return null
  } catch {
    return null
  }
}
