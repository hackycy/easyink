import type { DataSourceDescriptor } from './types'
import { DEFAULT_NAMESPACE, setSourceNamespace } from './namespace'

/**
 * Factory for async data source resolution.
 * Used for dynamically registered data sources (e.g., MCP-generated).
 */
export interface DataSourceProviderFactory {
  readonly namespace: string
  readonly id: string
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

/**
 * Callback type for data source change notifications.
 */
export type DataSourceChangeCallback = (sources: DataSourceDescriptor[]) => void

/**
 * DataSourceRegistry manages data source descriptors for the designer.
 * Supports both synchronous registration (built-in sources) and
 * asynchronous Provider Factory registration (external/MCP sources).
 */
export class DataSourceRegistry {
  private _sources = new Map<string, DataSourceDescriptor>()
  private _providerFactories = new Map<string, DataSourceProviderFactory>()
  private _resolvedEntries = new Map<string, ResolvedDataSourceEntry>()
  private _changeCallbacks: Set<DataSourceChangeCallback> = new Set()

  /**
   * Register a synchronous data source descriptor.
   */
  registerSource(source: DataSourceDescriptor): void {
    this._sources.set(source.id, source)
    this._notifyChange()
  }

  /**
   * Unregister a data source by ID.
   */
  unregisterSource(id: string): void {
    this._sources.delete(id)
    this._providerFactories.delete(id)
    this._resolvedEntries.delete(id)
    this._notifyChange()
  }

  /**
   * Register an asynchronous Provider Factory for dynamic data source resolution.
   * The factory will be lazily resolved when getSource is called.
   */
  registerProviderFactory(factory: DataSourceProviderFactory): void {
    this._providerFactories.set(factory.id, factory)
    this._notifyChange()
  }

  /**
   * Async register: accepts either a direct source or a provider factory.
   * Returns a promise that resolves when registration is complete.
   */
  async registerAsync(
    id: string,
    sourceOrFactory: DataSourceDescriptor | DataSourceProviderFactory,
    namespace = DEFAULT_NAMESPACE,
  ): Promise<void> {
    if ('fields' in sourceOrFactory) {
      // Direct source descriptor
      setSourceNamespace(sourceOrFactory, namespace)
      this.registerSource(sourceOrFactory)
    }
    else {
      // Provider factory
      const factory = {
        ...sourceOrFactory,
        namespace: sourceOrFactory.namespace || namespace,
      }
      this._providerFactories.set(id, factory)
      // Lazily resolve and cache
      await this.resolveProviderFactory(id)
    }
  }

  /**
   * Get a data source by ID. If the source is registered via Provider Factory,
   * it will be resolved asynchronously on first access.
   */
  async getSource(id: string): Promise<DataSourceDescriptor | undefined> {
    // Check direct sources first
    const direct = this._sources.get(id)
    if (direct)
      return direct

    // Check resolved entries
    const resolved = this._resolvedEntries.get(id)
    if (resolved)
      return resolved.source

    // Try to resolve from provider factory
    if (this._providerFactories.has(id)) {
      return this.resolveProviderFactory(id)
    }

    return undefined
  }

  /**
   * Get a data source synchronously. Only returns sources that have been
   * pre-resolved or directly registered. Does NOT trigger async resolution.
   */
  getSourceSync(id: string): DataSourceDescriptor | undefined {
    return this._sources.get(id)
  }

  /**
   * Find a source by tag.
   */
  findSourceByTag(tag: string): DataSourceDescriptor | undefined {
    for (const source of this._sources.values()) {
      if (source.tag === tag)
        return source
    }
    // Also check resolved entries
    for (const entry of this._resolvedEntries.values()) {
      if (entry.source.tag === tag)
        return entry.source
    }
    return undefined
  }

  /**
   * Find a source by name (stable naming).
   */
  findSourceByName(name: string): DataSourceDescriptor | undefined {
    for (const source of this._sources.values()) {
      if (source.name === name)
        return source
    }
    for (const entry of this._resolvedEntries.values()) {
      if (entry.source.name === name)
        return entry.source
    }
    return undefined
  }

  /**
   * Get all directly registered sources.
   */
  getSources(): DataSourceDescriptor[] {
    return [...this._sources.values()]
  }

  /**
   * Get all resolved sources (direct + lazily resolved).
   */
  getAllSources(): DataSourceDescriptor[] {
    const direct = [...this._sources.values()]
    const resolved = [...this._resolvedEntries.values()].map(e => e.source)
    return [...direct, ...resolved]
  }

  /**
   * Get all sources filtered by namespace.
   */
  getSourcesByNamespace(namespace: string): DataSourceDescriptor[] {
    const result: DataSourceDescriptor[] = []
    for (const source of this._sources.values()) {
      const ns = source.meta?.namespace as string | undefined
      if (ns === namespace || (ns === undefined && namespace === DEFAULT_NAMESPACE)) {
        result.push(source)
      }
    }
    for (const entry of this._resolvedEntries.values()) {
      if (entry.namespace === namespace) {
        result.push(entry.source)
      }
    }
    return result
  }

  /**
   * Get all registered provider factories.
   */
  getProviderFactories(): DataSourceProviderFactory[] {
    return [...this._providerFactories.values()]
  }

  /**
   * Clear all data sources and provider factories.
   */
  clear(): void {
    this._sources.clear()
    this._providerFactories.clear()
    this._resolvedEntries.clear()
    this._notifyChange()
  }

  /**
   * Subscribe to data source changes.
   * Returns an unsubscribe function.
   */
  onSourcesChange(callback: DataSourceChangeCallback): () => void {
    this._changeCallbacks.add(callback)
    return () => {
      this._changeCallbacks.delete(callback)
    }
  }

  /**
   * Resolve a provider factory and cache the result.
   */
  private async resolveProviderFactory(id: string): Promise<DataSourceDescriptor | undefined> {
    const factory = this._providerFactories.get(id)
    if (!factory)
      return undefined

    try {
      const source = await factory.resolve()
      setSourceNamespace(source, factory.namespace)
      this._sources.set(id, source)
      this._resolvedEntries.set(id, {
        source,
        namespace: factory.namespace,
        resolvedAt: Date.now(),
        provider: factory,
      })
      this._notifyChange()
      return source
    }
    catch (error) {
      console.error(`Failed to resolve data source from provider factory "${id}":`, error)
      return undefined
    }
  }

  /**
   * Notify all change listeners.
   */
  private _notifyChange(): void {
    const sources = this.getAllSources()
    for (const callback of this._changeCallbacks) {
      try {
        callback(sources)
      }
      catch (error) {
        console.error('Error in data source change callback:', error)
      }
    }
  }
}
