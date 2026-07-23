import type { FastifyReply, FastifyRequest } from 'fastify'

import { InvalidApiKeyError } from '../../../core/api-keys/errors.js'
import type { ApiKeyMinter, ApiKeyRepository } from '../../../core/api-keys/ports.js'
import type { SessionRepository, TokenIssuer } from '../../../core/auth/ports.js'
import type { Clock } from '../../../core/shared/clock.js'
import { UnauthorizedError } from '../../../core/shared/errors.js'
import type { Principal } from '../../../core/shared/principal.js'

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal
  }
}

export interface AuthenticateOptions {
  tokenIssuer: TokenIssuer
  sessions: SessionRepository
  apiKeys: ApiKeyRepository
  apiKeyMinter: ApiKeyMinter
  clock: Clock
}

/**
 * Route pre-handler that resolves a `Principal` from the Authorization
 * header. Accepts:
 *
 * - `Authorization: Bearer <jwt>` — verifies the JWT + session
 * - `Authorization: Bearer sag_<prefix>_<secret>` — verifies the API key
 * - `X-API-Key: sag_...` — same as above
 *
 * Requests without credentials pass through with `req.principal` unset;
 * callers should combine this with `requirePrincipal` when a route
 * demands authentication.
 */
export function buildAuthenticate(opts: AuthenticateOptions) {
  return async function authenticate(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
    const header = req.headers.authorization
    const explicit = typeof req.headers['x-api-key'] === 'string' ? req.headers['x-api-key'] : null

    const bearer = header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
    const candidate = bearer ?? explicit
    if (!candidate) return

    if (candidate.startsWith('sag_')) {
      req.principal = await verifyApiKey(candidate, opts, req)
      return
    }

    req.principal = await verifyAccessToken(candidate, opts)
  }
}

/**
 * Enforce that the request carries a valid principal. Throw
 * UnauthorizedError otherwise; the global error handler maps that to a
 * 401 response.
 */
export function requirePrincipal(req: FastifyRequest): Principal {
  if (!req.principal) {
    throw new UnauthorizedError('Authentication required')
  }
  return req.principal
}

async function verifyAccessToken(
  token: string,
  opts: AuthenticateOptions,
): Promise<Principal> {
  const payload = await opts.tokenIssuer.verifyAccessToken(token)
  const session = await opts.sessions.findById(payload.sessionId)
  if (!session || session.revokedAt !== null) {
    throw new UnauthorizedError('Session has been revoked')
  }
  if (session.expiresAt.getTime() <= opts.clock.now().getTime()) {
    throw new UnauthorizedError('Session has expired')
  }
  return {
    type: 'user',
    userId: payload.sub,
    tenantId: payload.tenantId,
    sessionId: payload.sessionId,
    scopes: payload.scope ?? [],
  }
}

async function verifyApiKey(
  plaintext: string,
  opts: AuthenticateOptions,
  req: FastifyRequest,
): Promise<Principal> {
  const parsed = opts.apiKeyMinter.parse(plaintext)
  if (!parsed) throw new InvalidApiKeyError()

  const stored = await opts.apiKeys.findByPrefix(parsed.prefix)
  if (!stored) throw new InvalidApiKeyError()
  if (stored.tokenHash !== parsed.tokenHash) throw new InvalidApiKeyError()
  if (stored.revokedAt !== null) throw new InvalidApiKeyError()
  if (stored.expiresAt !== null && stored.expiresAt.getTime() <= opts.clock.now().getTime()) {
    throw new InvalidApiKeyError()
  }

  // Fire-and-forget touch — a slow update should not block the request.
  void opts.apiKeys.touch(stored.id, opts.clock.now()).catch(() => {
    req.log.warn({ apiKeyId: stored.id }, 'failed to update api key last-used-at')
  })

  return {
    type: 'api-key',
    apiKeyId: stored.id,
    tenantId: stored.tenantId,
    scopes: stored.scopes,
  }
}
