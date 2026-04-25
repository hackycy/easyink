// Panel component (advanced consumers wanting custom mounting)
export { default as AIPanel } from './components/AIPanel.vue'
// Public Vue contribution entry — preferred consumption surface
export { createAIContribution } from './contribution'

export type { CreateAIContributionOptions } from './contribution'

// MCP transport primitives
export { MCPClient } from './mcp-client'
export { ServerRegistry, validateServerConfig } from './server-registry'

// Types
export type {
  ConnectionState,
  GenerateContext,
  GenerateOptions,
  GenerateResult,
  MCPAuthConfig,
  MCPServerConfig,
  MCPTool,
  MCPToolResult,
  ServerStatus,
  SessionMessage,
} from './types'
