import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import type { BindingRef, DocumentSchema, MaterialNode } from '@easyink/schema'
import { FIELD_PATH_SEPARATOR } from '@easyink/shared'

/**
 * Alignment result.
 */
export interface AlignmentResult {
  /** Whether alignment was successful */
  aligned: boolean
  /** Aligned schema */
  schema: DocumentSchema
  /** Data source (may be modified) */
  dataSource: DataSourceDescriptor
  /** Warnings during alignment */
  warnings: string[]
  /** Unaligned bindings */
  unalignedBindings: UnalignedBinding[]
}

/**
 * Information about an unaligned binding.
 */
export interface UnalignedBinding {
  /** The binding that couldn't be aligned */
  binding: BindingRef
  /** Element ID where binding is located */
  elementId: string
  /** Suggested field path if fuzzy match found */
  suggestedPath?: string
  /** Match confidence */
  confidence?: 'high' | 'medium' | 'low'
}

/**
 * DataSourceAligner aligns schema bindings with data source fields.
 * Implements Schema-First + AI-Align strategy.
 */
export class DataSourceAligner {
  /**
   * Align a schema with a data source.
   * Checks that all binding references have corresponding fields in the data source.
   */
  align(
    schema: DocumentSchema,
    dataSource: DataSourceDescriptor,
  ): AlignmentResult {
    const warnings: string[] = []
    const unalignedBindings: UnalignedBinding[] = []

    // Extract all field paths from the data source
    const dsFieldPaths = this.extractFieldPaths(dataSource.fields)

    // Extract all bindings from the schema
    const schemaBindings = this.extractBindings(schema)

    // Check each binding against available fields
    for (const { binding, elementId } of schemaBindings) {
      if (!binding.fieldPath) {
        unalignedBindings.push({
          binding,
          elementId,
          suggestedPath: undefined,
        })
        continue
      }

      const normalizedPath = this.normalizePath(binding.fieldPath)

      if (dsFieldPaths.has(normalizedPath)) {
        // Exact match - all good
        continue
      }

      // Try fuzzy matching
      const fuzzyMatch = this.findFuzzyMatch(normalizedPath, dsFieldPaths)
      if (fuzzyMatch) {
        warnings.push(
          `Field path "${binding.fieldPath}" fuzzy-matched to "${fuzzyMatch.path}"`,
        )
      }
      else {
        unalignedBindings.push({
          binding,
          elementId,
          suggestedPath: this.suggestPath(binding.fieldPath, dsFieldPaths),
          confidence: undefined,
        })
        warnings.push(
          `Field path "${binding.fieldPath}" could not be aligned with any data source field`,
        )
      }
    }

    return {
      aligned: unalignedBindings.length === 0,
      schema,
      dataSource,
      warnings,
      unalignedBindings,
    }
  }

  /**
   * Extract all field paths from a data source.
   */
  extractFieldPaths(fields: DataFieldNode[], prefix = ''): Set<string> {
    const paths = new Set<string>()

    for (const field of fields) {
      // Use explicit path if available, otherwise build from name
      const path = field.path ?? (prefix ? `${prefix}/${field.name}` : field.name)
      paths.add(path)

      // Add children
      if (field.fields && field.fields.length > 0) {
        const childPaths = this.extractFieldPaths(field.fields, path)
        for (const childPath of childPaths) {
          paths.add(childPath)
        }
      }
    }

    return paths
  }

  /**
   * Extract all bindings from a schema.
   */
  extractBindings(schema: DocumentSchema): Array<{ binding: BindingRef, elementId: string }> {
    const bindings: Array<{ binding: BindingRef, elementId: string }> = []

    const traverse = (elements: MaterialNode[]): void => {
      for (const element of elements) {
        // Direct binding
        if (element.binding) {
          const refs = Array.isArray(element.binding) ? element.binding : [element.binding]
          for (const ref of refs) {
            bindings.push({ binding: ref, elementId: element.id })
          }
        }

        // Table cell bindings
        if ('table' in element) {
          const table = element as MaterialNode & {
            table: {
              topology?: {
                rows?: Array<{
                  cells?: Array<{
                    binding?: BindingRef
                    staticBinding?: BindingRef
                  }>
                }>
              }
            }
          }

          if (table.table?.topology?.rows) {
            for (const row of table.table.topology.rows) {
              if (row.cells) {
                for (let colIdx = 0; colIdx < row.cells.length; colIdx++) {
                  const cell = row.cells[colIdx]
                  if (cell.binding) {
                    bindings.push({
                      binding: cell.binding,
                      elementId: `${element.id}:cell[${colIdx}]`,
                    })
                  }
                  if (cell.staticBinding) {
                    bindings.push({
                      binding: cell.staticBinding,
                      elementId: `${element.id}:cell[${colIdx}]:static`,
                    })
                  }
                }
              }
            }
          }
        }

        if (element.children) {
          traverse(element.children)
        }
      }
    }

    traverse(schema.elements)
    return bindings
  }

  /**
   * Normalize a field path to canonical format.
   */
  normalizePath(path: string): string {
    // Replace dots with forward slashes
    return path.replace(/\./g, FIELD_PATH_SEPARATOR)
  }

  /**
   * Find a fuzzy match for a field path.
   * Returns the best matching path if found.
   */
  findFuzzyMatch(
    path: string,
    availablePaths: Set<string>,
  ): { path: string, confidence: 'high' | 'medium' | 'low' } | undefined {
    const normalizedPath = this.normalizePath(path)
    const pathParts = normalizedPath.split(FIELD_PATH_SEPARATOR).filter(Boolean)
    const lastPart = pathParts[pathParts.length - 1]?.toLowerCase() ?? ''

    let bestMatch: { path: string, confidence: 'high' | 'medium' | 'low' } | undefined
    let bestScore = 0

    for (const availablePath of availablePaths) {
      const availableParts = availablePath.split(FIELD_PATH_SEPARATOR).filter(Boolean)
      const availableLastPart = availableParts[availableParts.length - 1]?.toLowerCase() ?? ''

      // Exact match (already handled)
      if (normalizedPath === availablePath) {
        return { path: availablePath, confidence: 'high' }
      }

      // Last part exact match
      if (lastPart === availableLastPart && lastPart.length > 0) {
        const score = lastPart.length
        if (score > bestScore) {
          bestScore = score
          bestMatch = { path: availablePath, confidence: 'high' }
        }
      }

      // Case-insensitive last part match
      if (lastPart.length >= 3 && availableLastPart.includes(lastPart)) {
        const score = lastPart.length / availableLastPart.length
        if (score > bestScore) {
          bestScore = score
          bestMatch = { path: availablePath, confidence: 'medium' }
        }
      }

      // Similarity-based matching
      const similarity = this.stringSimilarity(lastPart, availableLastPart)
      if (similarity > 0.7 && similarity > bestScore) {
        bestScore = similarity
        bestMatch = { path: availablePath, confidence: 'low' }
      }
    }

    return bestMatch
  }

  /**
   * Calculate string similarity (simple Jaccard-based).
   */
  private stringSimilarity(a: string, b: string): number {
    if (a === b)
      return 1
    if (a.length === 0 || b.length === 0)
      return 0

    const setA = new Set(a.toLowerCase())
    const setB = new Set(b.toLowerCase())

    let intersection = 0
    for (const char of setA) {
      if (setB.has(char))
        intersection++
    }

    const union = setA.size + setB.size - intersection
    return union > 0 ? intersection / union : 0
  }

  /**
   * Suggest an alternative path based on available fields.
   */
  suggestPath(originalPath: string, availablePaths: Set<string>): string | undefined {
    // Try removing/replacing the last segment
    const parts = originalPath.split(FIELD_PATH_SEPARATOR).filter(Boolean)
    if (parts.length === 0)
      return undefined

    // Try exact match of just the last part
    const lastPart = parts[parts.length - 1]!.toLowerCase()
    for (const path of availablePaths) {
      const pathParts = path.split(FIELD_PATH_SEPARATOR).filter(Boolean)
      const pathLastPart = pathParts[pathParts.length - 1]?.toLowerCase()
      if (pathLastPart === lastPart) {
        return path
      }
    }

    // Return first available path as generic suggestion
    return availablePaths.size > 0 ? [...availablePaths][0] : undefined
  }

  /**
   * Apply field alignment to schema.
   * Updates binding field paths based on fuzzy matches.
   */
  applyAlignment(
    schema: DocumentSchema,
    alignment: AlignmentResult,
  ): DocumentSchema {
    if (alignment.warnings.length === 0) {
      return schema
    }

    const fixedSchema = JSON.parse(JSON.stringify(schema)) as DocumentSchema

    // Extract available paths
    const dsFieldPaths = this.extractFieldPaths(alignment.dataSource.fields)

    const traverse = (elements: MaterialNode[]): void => {
      for (const element of elements) {
        if (element.binding) {
          const refs = Array.isArray(element.binding) ? element.binding : [element.binding]
          for (const ref of refs) {
            const match = this.findFuzzyMatch(ref.fieldPath, dsFieldPaths)
            if (match && match.confidence === 'high') {
              ref.fieldPath = match.path
            }
          }
        }

        if ('table' in element) {
          const table = element as MaterialNode & {
            table: {
              topology?: {
                rows?: Array<{
                  cells?: Array<{
                    binding?: BindingRef
                    staticBinding?: BindingRef
                  }>
                }>
              }
            }
          }

          if (table.table?.topology?.rows) {
            for (const row of table.table.topology.rows) {
              if (row.cells) {
                for (const cell of row.cells) {
                  if (cell.binding) {
                    const match = this.findFuzzyMatch(cell.binding.fieldPath, dsFieldPaths)
                    if (match && match.confidence === 'high') {
                      cell.binding.fieldPath = match.path
                    }
                  }
                  if (cell.staticBinding) {
                    const match = this.findFuzzyMatch(cell.staticBinding.fieldPath, dsFieldPaths)
                    if (match && match.confidence === 'high') {
                      cell.staticBinding.fieldPath = match.path
                    }
                  }
                }
              }
            }
          }
        }

        if (element.children) {
          traverse(element.children)
        }
      }
    }

    traverse(fixedSchema.elements)
    return fixedSchema
  }
}
