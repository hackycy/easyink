import type { FormatterConfig } from '../schema'

/**
 * Data field schema — describes the structure of a data source field.
 * Used by the designer to display the field tree and by the resolver for type checking.
 */
export interface DataFieldSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  /** Display name for the field tree */
  title?: string
  /** Field description / tooltip */
  description?: string
  /** Format hint (date, currency, email, image, etc.) */
  format?: string
  /** Child fields for object type */
  properties?: Record<string, DataFieldSchema>
  /** Element schema for array type */
  items?: DataFieldSchema
}

/**
 * Data source registration — provided by the integrating developer.
 * Registered at engine initialization or dynamically at runtime.
 */
export interface DataSourceRegistration {
  /** Unique identifier (also serves as the namespace prefix) */
  name: string
  /** Display name (field tree group title) */
  displayName: string
  /** Icon (field tree group icon) */
  icon?: string
  /** Field definitions describing the data source structure */
  fields: DataFieldSchema
  /** Optional group for secondary grouping in the field tree */
  group?: string
}

/**
 * Repeat context — passed to the resolver when resolving paths inside a repeat loop.
 */
export interface RepeatContext {
  /** Current item data */
  item: unknown
  /** Current index */
  index: number
  /** Item alias name (default "item") */
  itemAlias: string
  /** Index alias name (default "index") */
  indexAlias: string
}

/**
 * Built-in formatter types.
 */
export type BuiltinFormatterType = 'currency' | 'date' | 'lowercase' | 'number' | 'pad' | 'uppercase'

/**
 * Formatter function signature.
 */
export type FormatterFunction = (value: unknown, options?: Record<string, unknown>) => string

/**
 * Flattened field info — used by getFields() for designer field tree display.
 */
export interface DataFieldInfo {
  /** Full path with namespace, e.g. "order.customer.name" */
  path: string
  /** Field schema */
  schema: DataFieldSchema
  /** Depth level (0-based, namespace root = 0) */
  depth: number
}

/**
 * Data source manager events.
 */
export interface DataSourceManagerEvents {
  registered: (registration: DataSourceRegistration) => void
  unregistered: (name: string) => void
}

export type { FormatterConfig }
