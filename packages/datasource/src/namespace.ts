/**
 * Default namespace constant used by AI/contribution-driven sources.
 * Owned semantically by `@easyink/ai`; lives here only as a string constant
 * so designer/datasource utilities can recognise the namespace.
 */
export const AI_NAMESPACE = '__ai__'

/**
 * Default namespace for user-registered data sources.
 */
export const DEFAULT_NAMESPACE = 'default'

/**
 * Check if a namespace is the AI namespace.
 */
export function isAINamespace(ns?: string): boolean {
  return ns === AI_NAMESPACE
}

/**
 * Check if a namespace is the default namespace.
 */
export function isDefaultNamespace(ns?: string): boolean {
  return ns === undefined || ns === '' || ns === DEFAULT_NAMESPACE
}

/**
 * Generate a full namespaced source ID.
 * @param id - The source ID
 * @param namespace - The namespace; defaults to {@link DEFAULT_NAMESPACE}
 * @returns Full qualified ID in format "namespace:id"
 */
export function getNamespacedId(id: string, namespace?: string): string {
  const ns = namespace ?? DEFAULT_NAMESPACE
  if (isDefaultNamespace(ns)) {
    return id
  }
  return `${ns}:${id}`
}

/**
 * Parse a namespaced ID into its components.
 * @param fullId - The full qualified ID (e.g., "__mcp__:ds-123")
 * @returns Object with namespace and id, or null if not namespaced
 */
export function parseNamespacedId(fullId: string): { namespace: string, id: string } | null {
  const colonIndex = fullId.indexOf(':')
  if (colonIndex < 0) {
    return null
  }
  const namespace = fullId.slice(0, colonIndex)
  const id = fullId.slice(colonIndex + 1)
  if (!namespace || !id) {
    return null
  }
  return { namespace, id }
}

/**
 * Get the namespace from a data source descriptor meta.
 */
export function getSourceNamespace(source: { meta?: Record<string, unknown> }): string {
  return (source.meta?.namespace as string) ?? DEFAULT_NAMESPACE
}

/**
 * Set the namespace on a data source descriptor's meta.
 */
export function setSourceNamespace(
  source: { meta?: Record<string, unknown> },
  namespace: string,
): void {
  if (!source.meta) {
    source.meta = {}
  }
  source.meta = { ...source.meta, namespace }
}
