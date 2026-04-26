import type { McpServer as McpServerType } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { LLMProvider } from './llm/types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import { ClaudeProvider, OpenAIProvider } from './llm'
import { registerDebugTools, registerGenerateDataSourceTool, registerGenerateSchemaTool } from './tools'

export interface MCPServerOptions {
  name?: string
  version?: string
  provider?: 'claude' | 'openai'
  apiKey?: string
  model?: string
  baseUrl?: string
  strictOutput?: boolean
}

export interface MCPHTTPServerOptions {
  host?: string
  port?: number
  allowedOrigins?: string[]
  apiKey?: string
}

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
])

const API_KEY_HEADER = 'X-EasyInk-MCP-Key'

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
    strictOutput: options.strictOutput ?? process.env.MCP_STRICT_OUTPUTS !== 'false',
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
  registerDebugTools(server, provider)

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
  serverFactory: () => Promise<McpServerType>,
  port?: number,
  options: MCPHTTPServerOptions = {},
): Promise<void> {
  const { createServer } = await import('node:http')
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js',
  )

  const port_ = port ?? options.port ?? (Number(process.env.MCP_HTTP_PORT) || 3000)
  const host = options.host ?? process.env.MCP_HTTP_HOST ?? '127.0.0.1'
  const allowedOrigins = new Set([
    ...DEFAULT_ALLOWED_ORIGINS,
    ...parseList(process.env.MCP_HTTP_ALLOWED_ORIGINS),
    ...(options.allowedOrigins ?? []),
  ])
  const requiredApiKey = options.apiKey ?? process.env.MCP_HTTP_API_KEY

  const httpServer = createServer(async (req, res) => {
    const origin = req.headers.origin
    const originAllowed = origin === undefined || allowedOrigins.has(origin)

    if (origin && originAllowed) {
      res.setHeader('Access-Control-Allow-Origin', origin)
    }
    res.setHeader('Vary', 'Origin')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers']
      ?? `Content-Type, Authorization, ${API_KEY_HEADER}, mcp-session-id, mcp-protocol-version, last-event-id`,
    )
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version')
    res.setHeader('Access-Control-Max-Age', '86400')

    if (req.method === 'OPTIONS') {
      res.writeHead(originAllowed ? 204 : 403).end()
      return
    }

    if (!originAllowed) {
      res.writeHead(403).end('Forbidden Origin')
      return
    }

    if (requiredApiKey && req.headers[API_KEY_HEADER] !== requiredApiKey) {
      res.writeHead(401, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32001, message: 'Missing or invalid MCP API key.' },
        id: null,
      }))
      return
    }

    if (req.url !== '/mcp') {
      res.writeHead(404).end('Not Found')
      return
    }

    // Stateless mode: create a fresh server + transport per request, dispose after.
    // Reusing a single connected transport across requests is unsupported by the SDK
    // and results in 500 errors on the second initialize.
    let body: unknown
    if (req.method === 'POST') {
      const chunks: Buffer[] = []
      for await (const chunk of req) {
        chunks.push(chunk)
      }
      body = chunks.length > 0
        ? JSON.parse(Buffer.concat(chunks).toString())
        : undefined
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    })
    let server: McpServerType | null = null
    try {
      server = await serverFactory()
      res.on('close', () => {
        transport.close().catch(() => {})
        server?.close().catch(() => {})
      })
      await server.connect(transport)
      await transport.handleRequest(req, res, body)
    }
    catch (err) {
      process.stderr.write(`MCP request error: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' }).end(JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32603, message: err instanceof Error ? err.message : 'Internal error' },
          id: null,
        }))
      }
      else {
        try {
          res.end()
        }
        catch {}
      }
    }
  })

  httpServer.listen(port_, host, () => {
    process.stderr.write(`EasyInk MCP Server listening on http://${host}:${port_}/mcp\n`)
  })
}

function parseList(value: string | undefined): string[] {
  return value?.split(',').map(item => item.trim()).filter(Boolean) ?? []
}
