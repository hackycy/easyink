import type { McpServer as McpServerType } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { IncomingHttpHeaders } from 'node:http'
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
}

const PROVIDER_HEADER = 'x-easyink-provider'
const PROVIDER_KEY_HEADER = 'x-easyink-provider-key'
const MODEL_HEADER = 'x-easyink-model'
const BASE_URL_HEADER = 'x-easyink-base-url'
const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'mcp-session-id',
  'mcp-protocol-version',
  'last-event-id',
  'X-EasyInk-Provider',
  'X-EasyInk-Provider-Key',
  'X-EasyInk-Model',
  'X-EasyInk-Base-URL',
].join(', ')

async function createProvider(options: MCPServerOptions): Promise<LLMProvider> {
  const providerType = options.provider
    ?? parseProvider(process.env.MCP_PROVIDER)
    ?? 'claude'
  const apiKey = options.apiKey ?? emptyToUndefined(process.env.MCP_API_KEY)

  if (!apiKey) {
    throw new Error(
      'LLM provider API key is required. Set MCP_API_KEY or send X-EasyInk-Provider-Key.',
    )
  }

  const config = {
    provider: providerType,
    apiKey,
    model: options.model ?? emptyToUndefined(process.env.MCP_MODEL),
    baseUrl: options.baseUrl ?? emptyToUndefined(process.env.MCP_BASE_URL),
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
  serverFactory: (options?: MCPServerOptions) => Promise<McpServerType>,
  port?: number,
  options: MCPHTTPServerOptions = {},
): Promise<void> {
  const { createServer } = await import('node:http')
  const { StreamableHTTPServerTransport } = await import(
    '@modelcontextprotocol/sdk/server/streamableHttp.js',
  )

  const port_ = port ?? options.port ?? (Number(process.env.MCP_HTTP_PORT) || 3000)
  const host = options.host ?? process.env.MCP_HTTP_HOST ?? '0.0.0.0'

  const httpServer = createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers']
      ?? CORS_ALLOWED_HEADERS,
    )
    res.setHeader('Access-Control-Expose-Headers', 'mcp-session-id, mcp-protocol-version')
    res.setHeader('Access-Control-Max-Age', '86400')

    if (req.method === 'OPTIONS') {
      res.writeHead(204).end()
      return
    }

    if (req.url !== '/mcp') {
      res.writeHead(404).end('Not Found')
      return
    }

    let serverOptions: MCPServerOptions
    try {
      serverOptions = readRequestProviderOptions(req.headers)
    }
    catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({
        jsonrpc: '2.0',
        error: { code: -32602, message: err instanceof Error ? err.message : 'Invalid provider request headers.' },
        id: null,
      }))
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
      server = await serverFactory(serverOptions)
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

function readRequestProviderOptions(headers: IncomingHttpHeaders): MCPServerOptions {
  const provider = readHeader(headers, PROVIDER_HEADER)
  const apiKey = readHeader(headers, PROVIDER_KEY_HEADER)
  const model = readHeader(headers, MODEL_HEADER)
  const baseUrl = readHeader(headers, BASE_URL_HEADER)

  if (provider && provider !== 'claude' && provider !== 'openai') {
    throw new Error('X-EasyInk-Provider must be either "claude" or "openai".')
  }

  if (baseUrl) {
    const parsed = new URL(baseUrl)
    if (parsed.protocol !== 'https:')
      throw new Error('X-EasyInk-Base-URL must be an https URL.')
  }

  return {
    provider: provider as MCPServerOptions['provider'],
    apiKey,
    model,
    baseUrl,
  }
}

function readHeader(headers: IncomingHttpHeaders, name: string): string | undefined {
  const raw = headers[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  const trimmed = value?.trim()
  return trimmed || undefined
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

function parseProvider(value: string | undefined): MCPServerOptions['provider'] | undefined {
  const trimmed = emptyToUndefined(value)
  if (trimmed === 'claude' || trimmed === 'openai')
    return trimmed
  return undefined
}
