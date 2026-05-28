#!/usr/bin/env node
import process from 'node:process'
import { createRenderApiServer } from '../server'

async function main(): Promise<void> {
  const service = createRenderApiServer()

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
