import type { MCPServerConfig } from './types'

const STORAGE_KEY = 'easyink_mcp_servers'

/**
 * Builtin MCP servers that come with the framework.
 */
const BUILTIN_SERVERS: MCPServerConfig[] = [
  {
    id: 'template-generator',
    name: '模板生成服务',
    type: 'http',
    url: 'http://localhost:3000/mcp',
    enabled: true,
    description: '基于 AI 的模板生成服务，支持自然语言描述生成文档模板',
  },
]

/**
 * Registry for managing MCP server configurations.
 * Supports dynamic registration, persistence, and builtin server management.
 */
export class ServerRegistry {
  private _servers: MCPServerConfig[] = []
  private _builtinServers: MCPServerConfig[] = [...BUILTIN_SERVERS]
  private _loaded = false

  constructor() {
    // Try to load from storage on creation
    this.load()
  }

  /**
   * Register a new server configuration.
   */
  addServer(config: MCPServerConfig): void {
    // Check for duplicate ID
    const existingIndex = this._servers.findIndex(s => s.id === config.id)
    if (existingIndex >= 0) {
      // Update existing
      this._servers[existingIndex] = config
    }
    else {
      this._servers.push(config)
    }
    this.save()
  }

  /**
   * Update an existing server configuration.
   * Updating a builtin promotes it to a user override (so the change persists).
   */
  updateServer(id: string, updates: Partial<MCPServerConfig>): boolean {
    const index = this._servers.findIndex(s => s.id === id)
    if (index >= 0) {
      this._servers[index] = { ...this._servers[index], ...updates }
      this.save()
      return true
    }

    const builtin = this._builtinServers.find(s => s.id === id)
    if (builtin) {
      this._servers.push({ ...builtin, ...updates })
      this.save()
      return true
    }

    return false
  }

  /**
   * Remove a server configuration.
   */
  removeServer(id: string): boolean {
    const index = this._servers.findIndex(s => s.id === id)
    if (index < 0) {
      return false
    }
    this._servers.splice(index, 1)
    this.save()
    return true
  }

  /**
   * Get a server by ID. User override wins over builtin.
   */
  getServer(id: string): MCPServerConfig | undefined {
    return this._servers.find(s => s.id === id) ?? this._builtinServers.find(s => s.id === id)
  }

  /**
   * Get all registered servers (builtin + user, user overrides by id).
   */
  getServers(): MCPServerConfig[] {
    const userIds = new Set(this._servers.map(s => s.id))
    const builtinsKept = this._builtinServers.filter(s => !userIds.has(s.id))
    return [...builtinsKept, ...this._servers]
  }

  /**
   * Get only user-registered servers.
   */
  getUserServers(): MCPServerConfig[] {
    return [...this._servers]
  }

  /**
   * Get only builtin servers.
   */
  getBuiltinServers(): MCPServerConfig[] {
    return [...this._builtinServers]
  }

  /**
   * Get all enabled servers.
   */
  getEnabledServers(): MCPServerConfig[] {
    return this.getServers().filter(s => s.enabled)
  }

  /**
   * Enable or disable a server.
   */
  setEnabled(id: string, enabled: boolean): boolean {
    return this.updateServer(id, { enabled })
  }

  /**
   * Check if a server exists.
   */
  hasServer(id: string): boolean {
    return this.getServer(id) !== undefined
  }

  /**
   * Import multiple server configurations.
   */
  importServers(configs: MCPServerConfig[]): void {
    for (const config of configs) {
      this.addServer(config)
    }
  }

  /**
   * Export all user server configurations.
   */
  exportServers(): MCPServerConfig[] {
    return [...this._servers]
  }

  /**
   * Save configurations to localStorage.
   */
  save(): void {
    try {
      const data = JSON.stringify(this._servers)
      localStorage.setItem(STORAGE_KEY, data)
    }
    catch (error) {
      console.error('Failed to save MCP server configurations:', error)
    }
  }

  /**
   * Load configurations from localStorage.
   */
  load(): void {
    if (this._loaded)
      return

    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data) as MCPServerConfig[]
        this._servers = parsed
      }
    }
    catch (error) {
      console.error('Failed to load MCP server configurations:', error)
      this._servers = []
    }

    this._loaded = true
  }

  /**
   * Reset to default configuration (clear user servers).
   */
  reset(): void {
    this._servers = []
    this.save()
  }
}

/**
 * Validate a server configuration.
 */
export function validateServerConfig(config: Partial<MCPServerConfig>): string[] {
  const errors: string[] = []

  if (!config.id?.trim()) {
    errors.push('Server ID is required')
  }

  if (!config.name?.trim()) {
    errors.push('Server name is required')
  }

  if (!config.type) {
    errors.push('Server type is required')
  }
  else if (config.type === 'http' && !config.url?.trim()) {
    errors.push('HTTP server requires a URL')
  }
  else if (config.type === 'stdio') {
    if (!config.command?.trim()) {
      errors.push('Stdio server requires a command')
    }
  }

  const providerConfig = config.providerConfig
  if (config.type === 'http' && providerConfig?.useUserProviderConfig) {
    if (providerConfig.provider !== 'claude' && providerConfig.provider !== 'openai')
      errors.push('Provider must be claude or openai')
    if (!providerConfig.apiKey?.trim())
      errors.push('Provider API key is required when using user provider credentials')
    if (providerConfig.baseUrl?.trim() && !isHttpsUrl(providerConfig.baseUrl))
      errors.push('Provider base URL must be an https URL')
  }

  return errors
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  }
  catch {
    return false
  }
}
