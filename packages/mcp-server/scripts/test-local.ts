/**
 * 本地端到端测试脚本：以子进程方式启动 stdio MCP server，
 * 列出工具并可选地调用 generateSchema 进行真实 LLM 调用。
 *
 * 用法:
 *   pnpm --filter @easyink/mcp-server test:local
 *   pnpm --filter @easyink/mcp-server test:local -- --call "生成一个员工信息表"
 *
 * 环境变量（由 server 子进程通过 dotenv 自动从 packages/mcp-server/.env 加载，
 * 也可直接在 shell 中 export）:
 *   MCP_API_KEY   调用 LLM 工具时必填，LLM API key
 *   MCP_PROVIDER  可选，claude | openai (默认 claude)
 *   MCP_MODEL     可选
 *   MCP_BASE_URL  可选
 */
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

interface CliArgs {
  call?: string
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--call' && argv[i + 1]) {
      args.call = argv[++i]
    }
  }
  return args
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const serverEntry = fileURLToPath(new URL('../src/bin/server.ts', import.meta.url))

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', 'tsx', serverEntry],
    env: { ...process.env } as Record<string, string>,
    stderr: 'inherit',
  })

  const client = new Client({ name: 'easyink-mcp-test-client', version: '0.0.0' })

  console.error('[test-local] connecting to server...')
  await client.connect(transport)

  const tools = await client.listTools()
  console.error('[test-local] tools:')
  for (const t of tools.tools) {
    console.error(`  - ${t.name}: ${t.description ?? ''}`)
  }

  if (args.call) {
    console.error(`\n[test-local] calling generateSchema with prompt: ${args.call}`)
    const result = await client.callTool({
      name: 'generateSchema',
      arguments: { prompt: args.call },
    })
    console.log(JSON.stringify(result, null, 2))
  }

  await client.close()
}

main().catch((err) => {
  console.error('[test-local] error:', err)
  process.exit(1)
})
