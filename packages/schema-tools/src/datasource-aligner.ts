import type { AddressedMaterialBindingSlot, CompiledMaterialProfile, JsonPointer, MaterialNodeAddress } from '@easyink/core'
import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import type { BindingRef, DocumentSchema } from '@easyink/schema'
import type { JsonValue } from '@easyink/shared'
import { loadDocumentWithProfile, readPointer, walkMaterialNodes, writePointer } from '@easyink/core'
import { cloneJsonValue, deepClone, deepFreezeJsonValue, FIELD_PATH_SEPARATOR } from '@easyink/shared'

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
  /** Structurally addressed binding slots captured from the aligned schema. */
  bindingSlots: readonly DocumentBindingSlot[]
}

export interface DocumentBindingSlot {
  readonly binding: BindingRef
  readonly path: JsonPointer
  readonly nodeAddress: MaterialNodeAddress
}

/**
 * Information about an unaligned binding.
 */
export interface UnalignedBinding {
  /** The binding that couldn't be aligned */
  binding: BindingRef
  /** Element ID where binding is located */
  elementId: string
  nodeAddress: MaterialNodeAddress
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
    profile?: CompiledMaterialProfile,
  ): AlignmentResult {
    const warnings: string[] = []
    const unalignedBindings: UnalignedBinding[] = []

    // Extract all field paths from the data source
    const dsFieldPaths = this.extractFieldPaths(dataSource.fields)

    // Extract all bindings from the schema
    const schemaBindings = this.extractBindings(schema, profile)

    // Check each binding against available fields
    for (const { binding, nodeAddress } of schemaBindings) {
      if (!binding.fieldPath) {
        unalignedBindings.push({
          binding,
          elementId: nodeAddress.nodeId,
          nodeAddress,
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
          elementId: nodeAddress.nodeId,
          nodeAddress,
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
      bindingSlots: Object.freeze(schemaBindings),
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
  extractBindings(schema: DocumentSchema, profile?: CompiledMaterialProfile): DocumentBindingSlot[] {
    const bindings: DocumentBindingSlot[] = []
    if (profile) {
      const loaded = loadDocumentWithProfile(schema, profile)
      const quarantinedPaths = loaded.diagnostics
        .filter(diagnostic => diagnostic.severity === 'error' && diagnostic.stage !== 'graph')
        .map(diagnostic => diagnostic.path)
      walkMaterialNodes(schema, profile, (_node, address, introspection) => {
        if (quarantinedPaths.some(path => path === address.path || path.startsWith(`${address.path}/`)))
          return
        for (const slot of introspection.bindings)
          bindings.push(Object.freeze({ binding: slot.value, nodeAddress: address, path: slot.path }))
      })
    }
    else {
      collectPortableDocumentBindings(schema, bindings)
    }
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
    _profile?: CompiledMaterialProfile,
  ): DocumentSchema {
    const fixedSchema = deepClone(schema)

    // Extract available paths
    const dsFieldPaths = this.extractFieldPaths(alignment.dataSource.fields)

    for (const { binding, nodeAddress, path } of alignment.bindingSlots) {
      const match = this.findFuzzyMatch(binding.fieldPath, dsFieldPaths)
      if (match?.confidence !== 'high')
        continue
      const node = resolveAddressedNode(fixedSchema, nodeAddress)
      const current = readAddressedBinding(node, path, nodeAddress.path)
      if (JSON.stringify(current) !== JSON.stringify(binding))
        throw new Error(`DATASOURCE_ALIGNMENT_ADDRESS_STALE:${nodeAddress.path}${path}`)
      writePointer(node, path, { ...binding, fieldPath: match.path })
    }
    return fixedSchema
  }
}

export function collectDocumentBindingSlots(schema: DocumentSchema, profile: CompiledMaterialProfile): readonly AddressedMaterialBindingSlot[] {
  const slots: AddressedMaterialBindingSlot[] = []
  const loaded = loadDocumentWithProfile(schema, profile)
  const quarantinedPaths = loaded.diagnostics
    .filter(diagnostic => diagnostic.severity === 'error' && diagnostic.stage !== 'graph')
    .map(diagnostic => diagnostic.path)
  walkMaterialNodes(schema, profile, (_node, address, introspection) => {
    if (quarantinedPaths.some(path => path === address.path || path.startsWith(`${address.path}/`)))
      return
    for (const slot of introspection.bindings)
      slots.push(Object.freeze({ ...slot, nodeAddress: address }))
  })
  return Object.freeze(slots)
}

function collectPortableBindingRefs(
  value: unknown,
  nodeAddress: MaterialNodeAddress,
  path: JsonPointer,
  result: DocumentBindingSlot[],
): void {
  if (!value || typeof value !== 'object')
    return
  if (!Array.isArray(value)
    && typeof (value as Record<string, unknown>).sourceId === 'string'
    && typeof (value as Record<string, unknown>).fieldPath === 'string') {
    const binding = deepFreezeJsonValue(cloneJsonValue(value as JsonValue)) as BindingRef
    result.push(Object.freeze({ binding, nodeAddress, path }))
    return
  }
  for (const [key, item] of Object.entries(value))
    collectPortableBindingRefs(item, nodeAddress, `${path}/${escapePointerToken(key)}`, result)
}

function collectPortableDocumentBindings(schema: DocumentSchema, result: DocumentBindingSlot[]): void {
  const visit = (node: DocumentSchema['elements'][number], path: JsonPointer, ancestors: MaterialNodeAddress['ancestors']): void => {
    const address = Object.freeze({ nodeId: node.id, path, ancestors: Object.freeze([...ancestors]) })
    collectPortableBindingRefs(node.bindings, address, '/bindings', result)
    for (const [slot, children] of Object.entries(node.slots)) {
      children.forEach((child, index) => visit(
        child,
        `${path}/slots/${escapePointerToken(slot)}/${index}`,
        [...ancestors, Object.freeze({ ownerNodeId: node.id, slot, index })],
      ))
    }
  }
  schema.elements.forEach((node, index) => visit(node, `/elements/${index}`, []))
}

function resolveAddressedNode(schema: DocumentSchema, address: MaterialNodeAddress): DocumentSchema['elements'][number] {
  try {
    const node = readPointer(schema, address.path)
    if (!node || typeof node !== 'object' || (node as { id?: unknown }).id !== address.nodeId)
      throw new Error('stale')
    return node as DocumentSchema['elements'][number]
  }
  catch {
    throw new Error(`DATASOURCE_ALIGNMENT_ADDRESS_STALE:${address.path}`)
  }
}

function readAddressedBinding(node: DocumentSchema['elements'][number], path: JsonPointer, nodePath: JsonPointer): BindingRef {
  try {
    return readPointer(node, path) as BindingRef
  }
  catch {
    throw new Error(`DATASOURCE_ALIGNMENT_ADDRESS_STALE:${nodePath}${path}`)
  }
}

function escapePointerToken(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}
