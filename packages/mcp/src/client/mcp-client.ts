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
} from '../types/mcp-types'
import { generateId } from '@easyink/shared'

/**
 * MCP Client for connecting to remote MCP servers.
 * Supports both stdio and http transport modes.
 */
export class MCPClient {
  private servers = new Map<string, MCPServerConfig>()
  private sessionHistories = new Map<string, SessionMessage[]>()
  private serverStatuses = new Map<string, ServerStatus>()

  constructor() {
    // Initialize with empty maps
  }

  /**
   * Register a new MCP server configuration.
   */
  registerServer(config: MCPServerConfig): void {
    this.servers.set(config.id, config)
    this.serverStatuses.set(config.id, {
      serverId: config.id,
      state: 'disconnected',
    })
  }

  /**
   * Update an existing server configuration.
   */
  updateServer(id: string, config: Partial<MCPServerConfig>): void {
    const existing = this.servers.get(id)
    if (existing) {
      this.servers.set(id, { ...existing, ...config })
    }
  }

  /**
   * Remove a server configuration.
   */
  removeServer(id: string): void {
    this.servers.delete(id)
    this.sessionHistories.delete(id)
    this.serverStatuses.delete(id)
  }

  /**
   * Get all registered servers.
   */
  getServers(): MCPServerConfig[] {
    return [...this.servers.values()]
  }

  /**
   * Get all enabled servers.
   */
  getEnabledServers(): MCPServerConfig[] {
    return this.getServers().filter(s => s.enabled)
  }

  /**
   * Get a specific server config.
   */
  getServer(id: string): MCPServerConfig | undefined {
    return this.servers.get(id)
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
   * Create or get a session for a server.
   */
  getSession(serverId: string): SessionMessage[] {
    if (!this.sessionHistories.has(serverId)) {
      this.sessionHistories.set(serverId, [])
    }
    return this.sessionHistories.get(serverId)!
  }

  /**
   * Clear a session history.
   */
  clearSession(serverId: string): void {
    this.sessionHistories.set(serverId, [])
  }

  /**
   * Add a message to the session history.
   */
  addSessionMessage(serverId: string, message: Omit<SessionMessage, 'id' | 'timestamp'>): SessionMessage {
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
   * Generate a template using the MCP server.
   * This method handles the AI-orchestrated multi-tool call flow.
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { serverId, prompt, currentSchema, context: _context, signal } = options

    const server = this.servers.get(serverId)
    if (!server) {
      throw new Error(`MCP server "${serverId}" not found`)
    }

    // Add user message to session
    this.addSessionMessage(serverId, {
      role: 'user',
      content: prompt,
      schemaSnapshot: currentSchema,
    })

    try {
      // In a real implementation, this would:
      // 1. Connect to the MCP server using the SDK
      // 2. Send the prompt as a tool call request
      // 3. Handle multi-tool orchestration (getSchema + getDataSource)
      // 4. Parse and validate the responses
      // 5. Align schema and data source

      // For now, we simulate the flow
      const result = await this.simulateGenerateFlow(serverId, prompt, currentSchema, signal)

      // Add assistant message to session
      this.addSessionMessage(serverId, {
        role: 'assistant',
        content: 'Schema and DataSource generated successfully',
        toolsUsed: result.toolsUsed,
        schemaSnapshot: result.schema,
      })

      return result
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
   * Simulate the generate flow for development/testing.
   * In production, this would be replaced with actual MCP protocol calls.
   */
  private async simulateGenerateFlow(
    serverId: string,
    prompt: string,
    currentSchema?: DocumentSchema,
    signal?: AbortSignal,
  ): Promise<GenerateResult> {
    // Simulate async operation
    await new Promise(resolve => setTimeout(resolve, 500))

    if (signal?.aborted) {
      throw new Error('Generation cancelled')
    }

    // Generate mock schema and data source based on prompt
    const mockSchema = this.generateMockSchema(prompt, currentSchema)
    const mockDataSource = this.generateMockDataSource(prompt)

    return {
      schema: mockSchema,
      dataSource: mockDataSource,
      sessionId: generateId('session'),
      serverId,
      toolsUsed: ['getSchema', 'getDataSource'],
      metadata: {
        generatedAt: Date.now(),
        prompt,
      },
    }
  }

  /**
   * Generate a mock schema based on the prompt.
   * This is a placeholder for actual AI-generated content.
   */
  private generateMockSchema(prompt: string, currentSchema?: DocumentSchema): DocumentSchema {
    // Default to a simple template structure
    const base = currentSchema ?? {
      version: '1.0.0',
      unit: 'mm' as const,
      page: {
        mode: 'fixed' as const,
        width: 210,
        height: 297,
        background: {},
      },
      guides: { x: [], y: [] },
      elements: [],
    }

    // Add MCP metadata
    return {
      ...base,
      extensions: {
        ...base.extensions,
        mcp: {
          dataSources: [],
          templateHistory: [],
        },
      },
    }
  }

  /**
   * Generate a mock data source based on the prompt.
   * This is a placeholder for actual AI-generated content.
   */
  private generateMockDataSource(prompt: string): DataSourceDescriptor {
    // Generate a simple data source structure
    return {
      id: generateId('ds'),
      name: 'MCP Generated Data',
      title: 'AI Generated Data Source',
      tag: 'mcp-generated',
      expand: true,
      fields: [
        {
          name: 'items',
          path: 'items',
          tag: 'collection',
          expand: true,
          fields: [
            { name: 'name', path: 'items/name', title: 'Item Name' },
            { name: 'quantity', path: 'items/quantity', title: 'Quantity' },
            { name: 'price', path: 'items/price', title: 'Price' },
          ],
        },
      ],
      meta: {
        namespace: '__mcp__',
        generatedBy: 'mcp-client',
        prompt,
      },
    }
  }

  /**
   * Call a specific MCP tool directly.
   */
  async callTool(
    serverId: string,
    toolName: string,
    _args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    const server = this.servers.get(serverId)
    if (!server) {
      return {
        success: false,
        error: `Server "${serverId}" not found`,
        toolName,
      }
    }

    try {
      // In production, this would use the actual MCP SDK
      // For now, return a mock success response
      return {
        success: true,
        content: { message: 'Tool called successfully' },
        toolName,
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
   * List available tools from a server.
   */
  async listTools(serverId: string): Promise<MCPTool[]> {
    const server = this.servers.get(serverId)
    if (!server) {
      return []
    }

    // In production, this would query the server for available tools
    // Return mock tools for development
    return [
      {
        name: 'getSchema',
        description: 'Generate a document schema based on user description',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            currentSchema: { type: 'object' },
          },
        },
      },
      {
        name: 'getDataSource',
        description: 'Generate a data source descriptor based on schema requirements',
        inputSchema: {
          type: 'object',
          properties: {
            schemaRequirements: { type: 'object' },
          },
        },
      },
    ]
  }

  /**
   * Export all server configurations.
   */
  exportConfigs(): MCPServerConfig[] {
    return this.getServers()
  }

  /**
   * Import server configurations.
   */
  importConfigs(configs: MCPServerConfig[]): void {
    for (const config of configs) {
      this.registerServer(config)
    }
  }
}
