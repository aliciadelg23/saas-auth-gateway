import type { ApiKey } from '../../../core/api-keys/entities.js'
import type { ApiKeyRepository } from '../../../core/api-keys/ports.js'

export class ListApiKeys {
  constructor(private readonly keys: ApiKeyRepository) {}

  async execute(input: {
    tenantId: string
    cursor?: string | null
    limit?: number
  }): Promise<{ items: ApiKey[]; nextCursor: string | null }> {
    return this.keys.list(input.tenantId, {
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    })
  }
}
