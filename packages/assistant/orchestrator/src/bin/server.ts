#!/usr/bin/env node
import type { AssistantStore } from '@easyink/assistant-store'
import type { LLMEnvironment } from '@easyink/assistant-llm'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createLLMClientFromEnv } from '@easyink/assistant-llm'
import { FileAssistantStore } from '@easyink/assistant-store/file-store'
import { serve } from '@hono/node-server'
import { config as loadDotenv } from 'dotenv'
import pino from 'pino'
import { createAssistantApp } from '../server'

function loadEnvFiles(): void {
  for (const file of ['.env', '.env.local']) {
    const path = resolve(process.cwd(), file)
    if (existsSync(path))
      loadDotenv({ path, override: false })
  }
}

function createStoreFromEnv(): AssistantStore | undefined {
  const dir = process.env.EASYINK_ASSISTANT_STORE_DIR?.trim()
  if (!dir)
    return undefined
  return new FileAssistantStore({
    dir: resolve(process.cwd(), dir),
    fileName: process.env.EASYINK_ASSISTANT_STORE_FILE?.trim() || undefined,
  })
}

async function main(): Promise<void> {
  loadEnvFiles()

  const logger = pino({ name: 'easyink-assistant-server' })
  const host = process.env.EASYINK_ASSISTANT_HTTP_HOST?.trim() || '0.0.0.0'
  const port = Number(process.env.EASYINK_ASSISTANT_HTTP_PORT ?? 3010)
  if (!Number.isInteger(port) || port <= 0)
    throw new Error(`Invalid EASYINK_ASSISTANT_HTTP_PORT: ${process.env.EASYINK_ASSISTANT_HTTP_PORT}`)

  const app = createAssistantApp({
    corsOrigin: process.env.EASYINK_ASSISTANT_CORS_ORIGIN?.trim() || undefined,
    llm: createLLMClientFromEnv(process.env as LLMEnvironment),
    store: createStoreFromEnv(),
  })

  serve({ fetch: app.fetch, hostname: host, port }, (info) => {
    logger.info({ host: info.address, port: info.port }, 'EasyInk Assistant server listening')
  })
}

main().catch((error) => {
  console.error('EasyInk Assistant server fatal error:', error)
  process.exit(1)
})
