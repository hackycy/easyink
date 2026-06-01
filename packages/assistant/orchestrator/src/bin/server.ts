#!/usr/bin/env node
import type { AssistantStore } from '@easyink/assistant-store'
import type { LLMEnvironment } from '@easyink/assistant-llm'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { createLLMClientFromEnv } from '@easyink/assistant-llm'
import { FileAssistantStore } from '@easyink/assistant-store/file-store'
import { SQLiteAssistantStore } from '@easyink/assistant-store/sqlite-store'
import { serve } from '@hono/node-server'
import { config as loadDotenv } from 'dotenv'
import pino from 'pino'
import { createAssistantApp } from '../server'
import type { AssistantRequestLLMConfigOptions } from '../server'

function loadEnvFiles(): void {
  for (const file of ['.env', '.env.local']) {
    const path = resolve(process.cwd(), file)
    if (existsSync(path))
      loadDotenv({ path, override: false })
  }
}

function createStoreFromEnv(): AssistantStore | undefined {
  const kind = process.env.EASYINK_ASSISTANT_STORE_KIND?.trim().toLowerCase()
  if (kind === 'memory')
    return undefined

  const sqlitePath = process.env.EASYINK_ASSISTANT_STORE_SQLITE_PATH?.trim()
  if (sqlitePath) {
    return new SQLiteAssistantStore({
      path: resolve(process.cwd(), sqlitePath),
    })
  }

  const dir = process.env.EASYINK_ASSISTANT_STORE_DIR?.trim()
  if (!dir)
    return undefined

  if (kind && kind !== 'sqlite' && kind !== 'file')
    throw new Error(`Invalid EASYINK_ASSISTANT_STORE_KIND: ${process.env.EASYINK_ASSISTANT_STORE_KIND}`)

  if (kind === 'sqlite' || (!kind && !process.env.EASYINK_ASSISTANT_STORE_FILE?.trim())) {
    return new SQLiteAssistantStore({
      dir: resolve(process.cwd(), dir),
      fileName: process.env.EASYINK_ASSISTANT_STORE_SQLITE_FILE?.trim() || undefined,
    })
  }

  return new FileAssistantStore({
    dir: resolve(process.cwd(), dir),
    fileName: process.env.EASYINK_ASSISTANT_STORE_FILE?.trim() || undefined,
  })
}

function createRequestLLMPolicyFromEnv(): false | AssistantRequestLLMConfigOptions {
  if (process.env.EASYINK_ASSISTANT_REQUEST_LLM_CONFIG?.trim() !== '1')
    return false
  const providers = process.env.EASYINK_ASSISTANT_REQUEST_LLM_PROVIDERS
    ?.split(',')
    .map(provider => provider.trim())
    .filter(Boolean) as AssistantRequestLLMConfigOptions['providers']
  return {
    enabled: true,
    providers: providers?.length ? providers : undefined,
    allowCustomBaseURL: process.env.EASYINK_ASSISTANT_REQUEST_LLM_CUSTOM_BASE_URL?.trim() !== '0',
    allowedBaseURLs: process.env.EASYINK_ASSISTANT_REQUEST_LLM_ALLOWED_BASE_URLS
      ?.split(',')
      .map(url => url.trim())
      .filter(Boolean),
    allowPrivateBaseURL: process.env.EASYINK_ASSISTANT_REQUEST_LLM_PRIVATE_BASE_URL?.trim() === '1',
    allowInsecureBaseURL: process.env.EASYINK_ASSISTANT_REQUEST_LLM_INSECURE_BASE_URL?.trim() === '1',
  }
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
    requestLLM: createRequestLLMPolicyFromEnv(),
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
