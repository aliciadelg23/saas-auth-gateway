import { z } from 'zod'

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().min(1).default('0.0.0.0'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().url(),

    // Rate limiting
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    RATE_LIMIT_WINDOW: z.string().min(1).default('1 minute'),

    // CORS
    CORS_ORIGINS: z.string().default('*'),

    // JWT
    JWT_ISSUER: z.string().min(1).default('https://saas-auth-gateway.local'),
    JWT_AUDIENCE: z.string().min(1).default('saas-auth-gateway'),
    JWT_ACCESS_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(15 * 60),
    JWT_REFRESH_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(30 * 24 * 60 * 60),
    JWT_PRIVATE_KEY_PEM: z.string().optional(),
    JWT_PUBLIC_KEY_PEM: z.string().optional(),
    JWT_KEY_ID: z.string().min(1).default('primary'),

    // Password
    PASSWORD_PEPPER: z.string().default(''),

    // Refresh tokens
    REFRESH_TOKEN_BYTES: z.coerce.number().int().min(16).max(128).default(48),

    // Swagger
    SWAGGER_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (env.PASSWORD_PEPPER.length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PASSWORD_PEPPER'],
          message: 'PASSWORD_PEPPER must be at least 16 characters in production',
        })
      }
      if (!env.JWT_PRIVATE_KEY_PEM || !env.JWT_PUBLIC_KEY_PEM) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['JWT_PRIVATE_KEY_PEM'],
          message: 'JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM are required in production',
        })
      }
    }
  })

export type Env = z.infer<typeof EnvSchema>

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source)
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n')
    throw new Error(`Invalid environment configuration:\n${details}`)
  }
  return parsed.data
}
