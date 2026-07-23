import type { FastifyReply, FastifyRequest } from 'fastify'

import { requirePrincipal } from './authenticate.js'
import { PermissionDeniedError } from '../../../core/rbac/errors.js'
import type { PermissionEvaluator } from '../../../core/rbac/ports.js'

/**
 * Build a Fastify pre-handler that requires the current principal to
 * hold `action`. Users are checked against their assigned roles; API
 * keys are checked against their embedded scope list.
 */
export function buildRequirePermission(evaluator: PermissionEvaluator) {
  return function requirePermission(action: string) {
    return async function preHandler(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
      const principal = requirePrincipal(req)
      if (principal.type === 'api-key') {
        if (!principal.scopes.includes(action)) throw new PermissionDeniedError(action)
        return
      }
      const allowed = await evaluator.userCan(principal.userId, action)
      if (!allowed) throw new PermissionDeniedError(action)
    }
  }
}
