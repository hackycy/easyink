#!/usr/bin/env node
import process from 'node:process'
import { createRenderApiServer } from '../server'

async function main(): Promise<void> {
  const service = createRenderApiServer({
    host: process.env.EASYINK_RENDER_API_HOST,
    port: process.env.EASYINK_RENDER_API_PORT ? Number(process.env.EASYINK_RENDER_API_PORT) : undefined,
    binary: process.env.EASYINK_RENDER_BIN,
    workDir: process.env.EASYINK_RENDER_API_WORK_DIR,
    keepWorkDir: process.env.EASYINK_RENDER_API_KEEP_WORK_DIR === '1',
    cliTimeoutMs: process.env.EASYINK_RENDER_API_CLI_TIMEOUT_MS
      ? Number(process.env.EASYINK_RENDER_API_CLI_TIMEOUT_MS)
      : undefined,
  })

  const address = await service.listen()
  console.log(`EasyInk Render API listening on http://${address.address}:${address.port}`)

  const shutdown = async (): Promise<void> => {
    await service.close()
  }
  process.once('SIGINT', () => {
    shutdown().finally(() => process.exit(0))
  })
  process.once('SIGTERM', () => {
    shutdown().finally(() => process.exit(0))
  })
}

main().catch((err) => {
  console.error('EasyInk Render API fatal error:', err)
  process.exit(1)
})
