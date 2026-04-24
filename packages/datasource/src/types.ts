import type { MaterialUseToken } from '@easyink/shared'

/**
 * Descriptor for a data source. The field tree is the backbone
 * of the data source panel in the designer.
 */
export interface DataSourceDescriptor {
  id: string
  name: string
  tag?: string
  title?: string
  icon?: string
  expand?: boolean
  headless?: boolean
  fields: DataFieldNode[]
  meta?: Record<string, unknown>
}

/**
 * A node in the field tree. Supports recursive nesting.
 */
export interface DataFieldNode {
  name: string
  key?: string
  path?: string
  title?: string
  id?: string
  tag?: string
  use?: MaterialUseToken
  props?: Record<string, unknown>
  bindIndex?: number
  union?: DataUnionBinding[]
  expand?: boolean
  fields?: DataFieldNode[]
  meta?: Record<string, unknown>
}

/**
 * Union binding descriptor for one-drag-multi-create scenarios.
 */
export interface DataUnionBinding {
  name?: string
  key?: string
  path?: string
  title?: string
  id?: string
  tag?: string
  use?: string
  offsetX?: number
  offsetY?: number
  props?: Record<string, unknown>
}

/**
 * Provider factory for async data source resolution.
 * Used for dynamically registered external data sources.
 */
export interface DataSourceProviderFactory {
  /** Unique identifier for this provider factory */
  readonly id: string
  /** Namespace for isolation (e.g., '__mcp__' for MCP sources) */
  readonly namespace: string
  /** Resolve the data source asynchronously */
  resolve: () => Promise<DataSourceDescriptor>
}

/**
 * Resolved data source entry with metadata.
 */
export interface ResolvedDataSourceEntry {
  source: DataSourceDescriptor
  namespace: string
  resolvedAt: number
  provider?: DataSourceProviderFactory
}
