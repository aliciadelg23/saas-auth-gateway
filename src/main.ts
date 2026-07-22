import { buildApp } from './app.js'
import { loadEnv } from './config/index.js'
import { buildContainer } from './container.js'

async function bootstrap(): Promise<void> {
  const env = loadEnv()
  const container = buildContainer(env)
  const app = await buildApp({ env, container })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutdown requested')
    try {
      await app.close()
      process.exit(0)
    } catch (error) {
      app.log.error({ err: error }, 'error during shutdown')
      process.exit(1)
    }
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })

  try {
    await app.listen({ port: env.PORT, host: env.HOST })
  } catch (error) {
    app.log.error({ err: error }, 'failed to start server')
    process.exit(1)
  }
}

void bootstrap()
