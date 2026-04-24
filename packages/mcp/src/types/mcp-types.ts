import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'

/**
 * MCP Server connection configuration.
 */
export interface MCPServerConfig {
  /** Unique identifier for this server */
  id: string
  /** Display name for the server */
  name: string
  /** Connection type */
  type: 'stdio' | 'http'
  /** Command to launch the server (for stdio mode) */
  command?: string
  /** Arguments for the command (for stdio mode) */
  args?: string[]
  /** URL of the MCP server (for http mode) */
  url?: string
  /** Environment variables (for stdio mode) */
  env?: Record<string, string>
  /** Authentication configuration */
  auth?: MCPAuthConfig
  /** Whether this server is enabled */
  enabled: boolean
  /** Optional description */
  description?: string
  /** Server metadata */
  meta?: Record<string, unknown>
}

/**
 * Authentication configuration for MCP servers.
 */
export interface MCPAuthConfig {
  type: 'bearer' | 'apikey' | 'none'
  token?: string
}

/**
 * Result of a template generation request.
 */
export interface GenerateResult {
  /** Generated document schema */
  schema: DocumentSchema
  /** Generated data source descriptor */
  dataSource: DataSourceDescriptor
  /** Session ID for this generation */
  sessionId: string
  /** Server ID that generated this result */
  serverId: string
  /** List of MCP tools that were called */
  toolsUsed: string[]
  /** Additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Session message for maintaining conversation context.
 */
export interface SessionMessage {
  /** Unique message ID */
  id: string
  /** Message role */
  role: 'user' | 'assistant' | 'system'
  /** Message content */
  content: string
  /** Timestamp */
  timestamp: number
  /** Tools used in this message */
  toolsUsed?: string[]
  /** Schema snapshot at this point */
  schemaSnapshot?: DocumentSchema
  /** Error if any */
  error?: string
}

/**
 * MCP tool definition.
 */
export interface MCPTool {
  /** Tool name */
  name: string
  /** Tool description */
  description?: string
  /** Input schema */
  inputSchema?: Record<string, unknown>
}

/**
 * MCP tool call result.
 */
export interface MCPToolResult {
  /** Whether the call was successful */
  success: boolean
  /** Result content */
  content?: unknown
  /** Error message if failed */
  error?: string
  /** Tool name that was called */
  toolName: string
}

/**
 * MCP generation options.
 */
export interface GenerateOptions {
  /** Server ID to use */
  serverId: string
  /** User prompt */
  prompt: string
  /** Current schema context (optional) */
  currentSchema?: DocumentSchema
  /** Additional context */
  context?: GenerateContext
  /** Cancellation signal */
  signal?: AbortSignal
}

/**
 * Context for generation.
 */
export interface GenerateContext {
  /** Session history */
  sessionHistory?: SessionMessage[]
  /** Available templates */
  templates?: DocumentSchema[]
  /** Available data sources */
  dataSources?: DataSourceDescriptor[]
}

/**
 * Connection state for an MCP server.
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

/**
 * Server connection status.
 */
export interface ServerStatus {
  /** Server ID */
  serverId: string
  /** Current connection state */
  state: ConnectionState
  /** Error message if in error state */
  error?: string
  /** Last connected timestamp */
  lastConnected?: number
  /** Available tools from this server */
  tools?: MCPTool[]
}
