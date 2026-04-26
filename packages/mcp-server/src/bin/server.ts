#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { config as loadDotenv } from 'dotenv'
import { createMCPServer, startHTTPServer, startStdioServer } from '../server'

/**
 * 加载 cwd 下的 .env 与 .env.local（后者覆盖前者）。
 * 不覆盖已存在的 process.env，确保 Docker / Shell 注入的变量始终优先。
 * 文件不存在时静默跳过 —— Docker 镜像不打包 .env 属于正常情况。
 */
function loadEnvFiles(): void {
  for (const file of ['.env', '.env.local']) {
    const path = resolve(process.cwd(), file)
    if (existsSync(path)) {
      loadDotenv({ path, override: false })
    }
  }
}

async function main(): Promise<void> {
  loadEnvFiles()

  const transport = process.env.MCP_TRANSPORT ?? 'stdio'

  switch (transport) {
    case 'http':
      // Stateless HTTP requires a fresh server per request.
      await startHTTPServer(requestOptions => createMCPServer(requestOptions))
      break
    case 'stdio':
    default:
      await startStdioServer(await createMCPServer())
      break
  }
}

main().catch((err) => {
  console.error('MCP Server fatal error:', err)
  process.exit(1)
})
