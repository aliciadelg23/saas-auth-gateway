import { decodeCursor, encodeCursor, type PageResult } from './pagination.js'

interface Cursorable {
  readonly id: string
  readonly createdAt: Date
}

/**
 * Build the `where` clause fragment for a cursor-paginated read keyed
 * on `(createdAt DESC, id DESC)`. Callers merge the result into their
 * repository-specific `where` object.
 *
 * The result shape is compatible with Prisma's `WhereInput` — an empty
 * object when no cursor is present, otherwise an `OR` alternation that
 * strictly moves past the last row.
 */
export function cursorWhere(cursor: string | null | undefined): Record<string, unknown> {
  const decoded = decodeCursor(cursor)
  if (!decoded) return {}
  return {
    OR: [
      { createdAt: { lt: new Date(decoded.createdAt) } },
      { AND: [{ createdAt: new Date(decoded.createdAt) }, { id: { lt: decoded.id } }] },
    ],
  }
}

/**
 * Given a page-size + 1 row slice and a mapper into a domain type, drop
 * the peek row, mint a `nextCursor` when one is warranted, and return
 * the canonical PageResult.
 */
export function buildPage<TRow extends Cursorable, TDomain>(
  rows: readonly TRow[],
  limit: number,
  toDomain: (row: TRow) => TDomain,
): PageResult<TDomain> {
  const hasMore = rows.length > limit
  const trimmed = rows.slice(0, limit)
  const items = trimmed.map(toDomain)
  const last = trimmed[trimmed.length - 1]
  const nextCursor =
    hasMore && last
      ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
      : null
  return { items, nextCursor }
}
