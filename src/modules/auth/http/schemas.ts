import { z } from 'zod'

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters long')
  .max(200, 'Password must be at most 200 characters long')

const tenantSlugSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, {
    message: 'Tenant slug must be kebab-case lowercase alphanumerics',
  })

const emailSchema = z.string().email().max(254)

export const RegisterBody = z.object({
  tenantSlug: tenantSlugSchema,
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().min(1).max(120).optional(),
})

export const RegisterResponse = z.object({
  userId: z.string(),
  tenantId: z.string(),
  email: z.string(),
})

export const LoginBody = z.object({
  tenantSlug: tenantSlugSchema,
  email: emailSchema,
  password: z.string().min(1).max(200),
})

export const TokenResponse = z.object({
  tokenType: z.literal('Bearer'),
  accessToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string(),
  sessionId: z.string(),
  userId: z.string(),
  tenantId: z.string(),
})

export const RefreshBody = z.object({
  refreshToken: z.string().min(1),
})

export const LogoutBody = z.object({
  refreshToken: z.string().min(1),
})

export const ErrorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string().optional(),
  }),
})

export type RegisterBodyType = z.infer<typeof RegisterBody>
export type LoginBodyType = z.infer<typeof LoginBody>
export type RefreshBodyType = z.infer<typeof RefreshBody>
export type LogoutBodyType = z.infer<typeof LogoutBody>
