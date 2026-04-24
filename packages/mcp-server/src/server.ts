import type { McpServer as McpServerType } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { LLMProvider } from './llm/types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { ClaudeProvider, OpenAIProvider } from './llm'
import { registerGenerateDataSourceTool, registerGenerateSchemaTool } from './tools'

export interface MCPServerOptions {
  name?: string
  version?: string
  provider?: 'claude' | 'openai'
  apiKey?: string
  model?: string
  baseUrl?: string
}

async function createProvider(options: MCPServerOptions): Promise<LLMProvider> {
  const providerType = options.provider
    ?? (process.env.MCP_PROVIDER as 'claude' | 'openai')
    ?? 'claude'
  const apiKey = options.apiKey ?? process.env.MCP_API_KEY

  if (!apiKey) {
    throw new Error(
      'MCP_API_KEY environment variable is required. Set it to your LLM provider API key.',
    )
  }

  const config = {
    provider: providerType,
    apiKey,
    model: options.model ?? process.env.MCP_MODEL,
    baseUrl: options.baseUrl ?? process.env.MCP_BASE_URL,
  }

  switch (config.provider) {
    case 'claude':
      return await ClaudeProvider.create(config)
    case 'openai':
      return await OpenAIProvider.create(config)
    default:
      throw new Error(
        `Unsupported LLM provider: ${config.provider}. Supported: claude, openai`,
      )
  }
}

export async function createMCPServer(
  options: MCPServerOptions = {},
): Promise<McpServerType> {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js')

  const name = options.name ?? 'easyink-mcp-server'
  const version = options.version ?? '0.0.0'

  const provider = await createProvider(options)

  const server = new McpServer(
    { name, version },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  registerGenerateSchemaTool(server, provider)
  registerGenerateDataSourceTool(server, provider)

  return server
}

export async function startStdioServer(server: McpServerType): Promise<void> {
  const { StdioServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/stdio.js',
  )
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

export async function startHTTPServer(
  server: McpServerType,
  port?: number,
): Promise<void> {
  const { createServer } = await import('node:http')
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js',
  )

  const port_ = port ?? (Number(process.env.MCP_HTTP_PORT) || 3000)

  // Create the transport in stateless mode (no sessionIdGenerator)
  const transport = new StreamableHTTPServerTransport()

  await server.connect(transport)

  const httpServer = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/mcp') {
      // Collect body
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      const body = chunks.length > 0
        ? JSON.parse(Buffer.concat(chunks).toString())
        : undefined

      await transport.handleRequest(req, res, body)
    }
    else if (req.method === 'GET' && req.url === '/mcp') {
      await transport.handleRequest(req, res)
    }
    else if (req.method === 'DELETE' && req.url === '/mcp') {
      await transport.handleRequest(req, res)
    }
    else {
      res.writeHead(404).end('Not Found')
    }
  })

  httpServer.listen(port_, () => {
    process.stderr.write(`EasyInk MCP Server listening on http://localhost:${port_}/mcp\n`)
  })
}
