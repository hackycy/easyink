export {
  DEFAULT_NAMESPACE,
  getNamespacedId,
  getSourceNamespace,
  isDefaultNamespace,
  isMcpNamespace,
  MCP_NAMESPACE,
  parseNamespacedId,
  setSourceNamespace,
} from './namespace'
export { normalizeDataSource } from './normalize'

export { DataSourceRegistry } from './registry'

export type { DataSourceChangeCallback } from './registry'

export type {
  DataFieldNode,
  DataSourceDescriptor,
  DataSourceProviderFactory,
  DataUnionBinding,
  ResolvedDataSourceEntry,
} from './types'
