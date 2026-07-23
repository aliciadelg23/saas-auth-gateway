/**
 * A `Principal` is whoever is making a request — either a logged-in
 * user (JWT bearer) or an API key (`sag_...` bearer). Route guards
 * accept a `Principal` and consult the permission evaluator to
 * authorize actions.
 */
export type Principal =
  | {
      readonly type: 'user'
      readonly userId: string
      readonly tenantId: string
      readonly sessionId: string
      readonly scopes: readonly string[]
    }
  | {
      readonly type: 'api-key'
      readonly apiKeyId: string
      readonly tenantId: string
      readonly scopes: readonly string[]
    }
