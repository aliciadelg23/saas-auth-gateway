import { z } from 'zod'

export const CreateApiKeyBody = z.object({
  name: z.string().min(1).max(120),
  scopes: z.array(z.string().min(1)).min(1).max(200),
  expiresAt: z.string().datetime().optional(),
})

export const ApiKeyResponse = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  prefix: z.string(),
  scopes: z.array(z.string()),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
})

export const ApiKeyCreatedResponse = ApiKeyResponse.extend({
  plaintext: z.string(),
})

export const ApiKeyListResponse = z.object({
  items: z.array(ApiKeyResponse),
  nextCursor: z.string().nullable(),
})

export const ListApiKeysQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
})
