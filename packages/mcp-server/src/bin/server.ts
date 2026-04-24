#!/usr/bin/env node
import process from 'node:process'
import { createMCPServer, startHTTPServer, startStdioServer } from '../server'

async function main(): Promise<void> {
  const transport = process.env.MCP_TRANSPORT ?? 'stdio'
  const server = await createMCPServer()

  switch (transport) {
    case 'http':
      await startHTTPServer(server)
      break
    case 'stdio':
    default:
      await startStdioServer(server)
      break
  }
}

main().catch((err) => {
  console.error('MCP Server fatal error:', err)
  process.exit(1)
})
