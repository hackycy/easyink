import type {
  DataFieldInfo,
  DataFieldSchema,
  DataSourceManagerEvents,
  DataSourceRegistration,
} from './types'

/**
 * DataSourceManager — manages registration and lookup of data sources.
 *
 * Data sources are registered by the integrating developer (not by template users).
 * Each data source has a unique name that serves as the namespace prefix for data paths.
 */
export class DataSourceManager {
  private sources = new Map<string, DataSourceRegistration>()
  private listeners = new Map<keyof DataSourceManagerEvents, Set<(...args: any[]) => void>>()

  /**
   * Register a data source.
   * @throws If a data source with the same name is already registered
   */
  register(registration: DataSourceRegistration): void {
    if (this.sources.has(registration.name)) {
      throw new Error(`Data source "${registration.name}" is already registered`)
    }
    this.sources.set(registration.name, registration)
    this.emit('registered', registration)
  }

  /**
   * Unregister a data source by name.
   * @throws If the data source is not found
   */
  unregister(name: string): void {
    if (!this.sources.has(name)) {
      throw new Error(`Data source "${name}" is not registered`)
    }
    this.sources.delete(name)
    this.emit('unregistered', name)
  }

  /**
   * Check if a data source is registered.
   */
  has(name: string): boolean {
    return this.sources.has(name)
  }

  /**
   * Get a data source registration by name.
   */
  get(name: string): DataSourceRegistration | undefined {
    return this.sources.get(name)
  }

  /**
   * List all registered data sources.
   */
  list(): DataSourceRegistration[] {
    return [...this.sources.values()]
  }

  /**
   * Get flattened field list for a data source (used for field tree display).
   * Recursively walks the field schema and returns all fields with full paths.
   */
  getFields(name: string): DataFieldInfo[] {
    const source = this.sources.get(name)
    if (!source) {
      throw new Error(`Data source "${name}" is not registered`)
    }
    const fields: DataFieldInfo[] = []
    this.walkFields(source.fields, name, 0, fields)
    return fields
  }

  /**
   * Get flattened fields for all registered data sources.
   */
  getAllFields(): DataFieldInfo[] {
    const fields: DataFieldInfo[] = []
    for (const source of this.sources.values()) {
      this.walkFields(source.fields, source.name, 0, fields)
    }
    return fields
  }

  /**
   * Resolve a field schema by its full path (e.g., "order.customer.name").
   * Returns undefined if the path is invalid.
   */
  resolveFieldSchema(path: string): DataFieldSchema | undefined {
    const segments = path.split('.')
    if (segments.length === 0)
      return undefined

    const source = this.sources.get(segments[0])
    if (!source)
      return undefined

    let schema: DataFieldSchema = source.fields
    for (let i = 1; i < segments.length; i++) {
      if (schema.type === 'object' && schema.properties) {
        schema = schema.properties[segments[i]]
        if (!schema)
          return undefined
      }
      else if (schema.type === 'array' && schema.items) {
        // For array access, dive into items schema
        schema = schema.items
        if (schema.type === 'object' && schema.properties) {
          schema = schema.properties[segments[i]]
          if (!schema)
            return undefined
        }
        else {
          return undefined
        }
      }
      else {
        return undefined
      }
    }
    return schema
  }

  /**
   * Listen to events.
   */
  on<K extends keyof DataSourceManagerEvents>(
    event: K,
    listener: DataSourceManagerEvents[K],
  ): void {
    let listeners = this.listeners.get(event)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(event, listeners)
    }
    listeners.add(listener)
  }

  /**
   * Remove an event listener.
   */
  off<K extends keyof DataSourceManagerEvents>(
    event: K,
    listener: DataSourceManagerEvents[K],
  ): void {
    this.listeners.get(event)?.delete(listener)
  }

  /**
   * Clear all registrations and listeners.
   */
  clear(): void {
    this.sources.clear()
    this.listeners.clear()
  }

  private emit<K extends keyof DataSourceManagerEvents>(
    event: K,
    ...args: Parameters<DataSourceManagerEvents[K]>
  ): void {
    const listeners = this.listeners.get(event)
    if (listeners) {
      for (const listener of listeners) {
        listener(...args)
      }
    }
  }

  private walkFields(
    schema: DataFieldSchema,
    path: string,
    depth: number,
    result: DataFieldInfo[],
  ): void {
    result.push({ path, schema, depth })

    if (schema.type === 'object' && schema.properties) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        this.walkFields(childSchema, `${path}.${key}`, depth + 1, result)
      }
    }
    else if (schema.type === 'array' && schema.items) {
      // For arrays, walk the items schema to expose nested fields
      if (schema.items.type === 'object' && schema.items.properties) {
        for (const [key, childSchema] of Object.entries(schema.items.properties)) {
          this.walkFields(childSchema, `${path}.${key}`, depth + 1, result)
        }
      }
    }
  }
}
