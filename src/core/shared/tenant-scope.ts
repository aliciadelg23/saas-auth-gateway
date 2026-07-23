import { ForbiddenError } from './errors.js'
import type { Principal } from './principal.js'

/**
 * Ensure the current principal is scoped to the tenant addressed by the
 * request. This is the last line of defense against a
 * valid-but-out-of-scope credential trying to reach another tenant's
 * data. Route pre-handlers should call this before touching any
 * tenant-scoped repository.
 */
export function assertTenantAccess(principal: Principal, requestedTenantId: string): void {
  if (principal.tenantId !== requestedTenantId) {
    throw new ForbiddenError('Principal is not scoped to this tenant')
  }
}
