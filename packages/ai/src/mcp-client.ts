import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type {
  GenerateOptions,
  GenerateResult,
  MCPServerConfig,
  MCPTool,
  MCPToolResult,
  ServerStatus,
  SessionMessage,
} from './types'
import { generateId } from '@easyink/shared'

/**
 * MCP Client for connecting to remote MCP servers via HTTP/SSE transport.
 * Browser-compatible. Uses StreamableHTTPClientTransport from @modelcontextprotocol/sdk.
 */
export class MCPClient {
  private clients = new Map<string, import('@modelcontextprotocol/sdk/client/index.js').Client>()
  private transports = new Map<string, import('@modelcontextprotocol/sdk/client/streamableHttp.js').StreamableHTTPClientTransport>()
  private sessionHistories = new Map<string, SessionMessage[]>()
  private serverStatuses = new Map<string, ServerStatus>()

  /**
   * Connect to an MCP server.
   * Only HTTP transport is supported in the browser.
   */
  async connect(config: MCPServerConfig): Promise<void> {
    if (config.type === 'stdio') {
      throw new Error('Stdio transport is not supported in browser. Use HTTP transport.')
    }

    if (!config.url) {
      throw new Error('Server URL is required for HTTP transport')
    }

    this.serverStatuses.set(config.id, {
      serverId: config.id,
      state: 'connecting',
    })

    try {
      const { Client } = await import('@modelcontextprotocol/sdk/client/index.js')
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js')

      const transport = new StreamableHTTPClientTransport(new URL(config.url))
      const client = new Client(
        { name: 'easyink-designer', version: '0.0.0' },
        { capabilities: {} },
      )

      await client.connect(transport)

      this.clients.set(config.id, client)
      this.transports.set(config.id, transport)
      this.serverStatuses.set(config.id, {
        serverId: config.id,
        state: 'connected',
        lastConnected: Date.now(),
      })
    }
    catch (error) {
      this.serverStatuses.set(config.id, {
        serverId: config.id,
        state: 'error',
        error: error instanceof Error ? error.message : 'Connection failed',
      })
      throw error
    }
  }

  /**
   * Disconnect from an MCP server.
   */
  async disconnect(serverId: string): Promise<void> {
    const transport = this.transports.get(serverId)
    if (transport) {
      await transport.close()
      this.transports.delete(serverId)
    }
    this.clients.delete(serverId)
    this.serverStatuses.set(serverId, {
      serverId,
      state: 'disconnected',
    })
  }

  /**
   * Get the status of a server.
   */
  getServerStatus(id: string): ServerStatus | undefined {
    return this.serverStatuses.get(id)
  }

  /**
   * Get all server statuses.
   */
  getAllServerStatuses(): ServerStatus[] {
    return [...this.serverStatuses.values()]
  }

  /**
   * Get session messages for a server.
   */
  getSession(serverId: string): SessionMessage[] {
    if (!this.sessionHistories.has(serverId)) {
      this.sessionHistories.set(serverId, [])
    }
    return this.sessionHistories.get(serverId)!
  }

  /**
   * Clear session history.
   */
  clearSession(serverId: string): void {
    this.sessionHistories.set(serverId, [])
  }

  /**
   * Add a message to the session history.
   */
  addSessionMessage(
    serverId: string,
    message: Omit<SessionMessage, 'id' | 'timestamp'>,
  ): SessionMessage {
    const session = this.getSession(serverId)
    const msg: SessionMessage = {
      ...message,
      id: generateId('msg'),
      timestamp: Date.now(),
    }
    session.push(msg)
    return msg
  }

  /**
   * Generate a template using the connected MCP server.
   * Calls the generateSchema tool via MCP protocol.
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { serverId, prompt, currentSchema, signal } = options

    const client = this.clients.get(serverId)
    if (!client) {
      throw new Error(`Not connected to MCP server "${serverId}". Call connect() first.`)
    }

    // Add user message to session
    this.addSessionMessage(serverId, {
      role: 'user',
      content: prompt,
      schemaSnapshot: currentSchema,
    })

    try {
      const result = await client.callTool(
        {
          name: 'generateSchema',
          arguments: {
            prompt,
            currentSchema: currentSchema ?? undefined,
          },
        },
        undefined,
        { signal },
      )

      // Parse the text content from the tool result
      const content = result.content as Array<{ type: string, text?: string }>
      const textBlock = content.find(c => c.type === 'text')
      if (!textBlock || textBlock.type !== 'text' || !textBlock.text) {
        throw new Error('Server returned no text content')
      }

      const data = JSON.parse(textBlock.text) as {
        schema: DocumentSchema
        expectedDataSource: { name: string, fields: Array<Record<string, unknown>> }
        validation?: { valid: boolean, errors?: Array<Record<string, unknown>>, warnings?: Array<Record<string, unknown>> }
        error?: string
      }

      if (data.error) {
        throw new Error(`Schema generation failed: ${data.error}`)
      }

      // Build a DataSourceDescriptor from the expectedDataSource
      const dataSource: DataSourceDescriptor = {
        id: generateId('ds'),
        name: data.expectedDataSource.name,
        tag: 'mcp-generated',
        title: `AI Generated: ${data.expectedDataSource.name}`,
        fields: this.convertExpectedFields(data.expectedDataSource.fields),
        meta: {
          namespace: '__mcp__',
          generatedBy: 'mcp-client',
          prompt,
        },
      }

      // Add success message to session
      this.addSessionMessage(serverId, {
        role: 'assistant',
        content: 'Schema and DataSource generated successfully',
        toolsUsed: ['generateSchema'],
        schemaSnapshot: data.schema,
      })

      return {
        schema: data.schema,
        dataSource,
        sessionId: generateId('session'),
        serverId,
        toolsUsed: ['generateSchema'],
        metadata: {
          generatedAt: Date.now(),
          prompt,
          validation: data.validation,
        },
      }
    }
    catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      this.addSessionMessage(serverId, {
        role: 'assistant',
        content: '',
        error: errorMsg,
      })
      throw error
    }
  }

  /**
   * Call a specific MCP tool directly.
   */
  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const client = this.clients.get(serverId)
    if (!client) {
      return {
        success: false,
        error: `Not connected to server "${serverId}"`,
        toolName,
      }
    }

    try {
      const result = await client.callTool({ name: toolName, arguments: args })
      return {
        success: !result.isError,
        content: result.content,
        toolName,
        error: result.isError ? 'Tool returned error' : undefined,
      }
    }
    catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        toolName,
      }
    }
  }

  /**
   * List available tools from a connected server.
   */
  async listTools(serverId: string): Promise<MCPTool[]> {
    const client = this.clients.get(serverId)
    if (!client)
      return []

    try {
      const result = await client.listTools()
      return result.tools.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
      }))
    }
    catch {
      return []
    }
  }

  /**
   * Convert ExpectedField items from AI response into DataFieldNode tree.
   */
  private convertExpectedFields(
    fields: Array<Record<string, unknown>>,
  ): import('@easyink/datasource').DataFieldNode[] {
    return fields.map(f => ({
      name: f.name as string,
      path: f.path as string,
      title: f.name as string,
      expand: (f.type as string) === 'array' || (f.type as string) === 'object',
      ...(f.children
        ? { fields: this.convertExpectedFields(f.children as Array<Record<string, unknown>>) }
        : {}),
    }))
  }
}
