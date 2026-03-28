import type { FormatterConfig, FormatterFunction, RepeatContext } from './types'

/** Properties that must never be accessed during path resolution (prototype pollution prevention) */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * DataResolver — resolves data values from namespace paths.
 *
 * Supports:
 * - Namespace paths: "order.customer.name" → data.order.customer.name
 * - Array index: "order.items[0].name"
 * - Repeat context: inside a repeat loop, the item alias resolves from current row data
 * - Security: blocks access to __proto__, constructor, prototype
 *
 * Error strategy:
 * - Path to undefined → returns undefined
 * - Invalid path/exception → returns undefined, prints console warning
 */
export class DataResolver {
  private formatters = new Map<string, FormatterFunction>()

  /**
   * Register a formatter function.
   */
  registerFormatter(name: string, fn: FormatterFunction): void {
    this.formatters.set(name, fn)
  }

  /**
   * Unregister a formatter function.
   */
  unregisterFormatter(name: string): void {
    this.formatters.delete(name)
  }

  /**
   * Check if a formatter is registered.
   */
  hasFormatter(name: string): boolean {
    return this.formatters.has(name)
  }

  /**
   * Resolve a value from data by namespace path.
   *
   * @param path - Dot-separated path, e.g. "order.customer.name" or "order.items[0].name"
   * @param data - The data object keyed by namespace
   * @param context - Optional repeat context for resolving paths inside repeat loops
   * @returns The resolved value, or undefined if not found
   */
  resolve(
    path: string,
    data: Record<string, unknown>,
    context?: RepeatContext,
  ): unknown {
    if (!path)
      return undefined

    try {
      // In repeat context, check if path matches the item/index alias
      if (context) {
        if (path === context.indexAlias) {
          return context.index
        }
        if (path === context.itemAlias) {
          return context.item
        }
        // If path starts with itemAlias, resolve relative to current item
        if (path.startsWith(`${context.itemAlias}.`)) {
          const relativePath = path.slice(context.itemAlias.length + 1)
          return this.resolvePath(relativePath, context.item)
        }
      }

      // Standard namespace resolution
      return this.resolvePath(path, data)
    }
    catch {
      console.warn(`[EasyInk] Failed to resolve data path: "${path}"`)
      return undefined
    }
  }

  /**
   * Format a value using a registered formatter.
   *
   * @param value - The raw value to format
   * @param formatter - Formatter configuration
   * @returns Formatted string, or the value coerced to string if no formatter found
   */
  format(value: unknown, formatter: FormatterConfig): string {
    const fn = this.formatters.get(formatter.type)
    if (!fn) {
      console.warn(`[EasyInk] Unknown formatter type: "${formatter.type}"`)
      return value == null ? '' : String(value)
    }
    return fn(value, formatter.options)
  }

  /**
   * Resolve and optionally format a value in one call.
   */
  resolveAndFormat(
    path: string,
    data: Record<string, unknown>,
    formatter?: FormatterConfig,
    context?: RepeatContext,
  ): string {
    const value = this.resolve(path, data, context)
    if (formatter) {
      return this.format(value, formatter)
    }
    return value == null ? '' : String(value)
  }

  /**
   * Clear all registered formatters.
   */
  clear(): void {
    this.formatters.clear()
  }

  /**
   * Walk a dot-separated path on an object, with array index support.
   * Returns undefined for missing segments instead of throwing.
   */
  private resolvePath(path: string, obj: unknown): unknown {
    if (obj == null)
      return undefined

    const segments = this.parsePath(path)
    let current: unknown = obj

    for (const segment of segments) {
      if (current == null)
        return undefined

      // Security check
      if (FORBIDDEN_KEYS.has(segment)) {
        console.warn(`[EasyInk] Blocked access to forbidden property: "${segment}"`)
        return undefined
      }

      if (typeof current !== 'object')
        return undefined

      current = (current as Record<string, unknown>)[segment]
    }

    return current
  }

  /**
   * Parse a path string into segments, handling array index notation.
   * "a.b[0].c" → ["a", "b", "0", "c"]
   */
  private parsePath(path: string): string[] {
    const segments: string[] = []
    let current = ''

    for (let i = 0; i < path.length; i++) {
      const ch = path[i]
      if (ch === '.') {
        if (current)
          segments.push(current)
        current = ''
      }
      else if (ch === '[') {
        if (current)
          segments.push(current)
        current = ''
      }
      else if (ch === ']') {
        if (current)
          segments.push(current)
        current = ''
      }
      else {
        current += ch
      }
    }

    if (current)
      segments.push(current)
    return segments
  }
}
