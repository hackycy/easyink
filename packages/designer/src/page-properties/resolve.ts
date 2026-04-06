import type { DocumentSchema, PageSchema } from '@easyink/schema'
import type { PagePropertyContext, PagePropertyDescriptor, PagePropertyGroup, PagePropertyPatch } from './types'

/**
 * Read the current value for a page property descriptor from context.
 */
export function readPageProperty(descriptor: PagePropertyDescriptor, ctx: PagePropertyContext): unknown {
  if (descriptor.source === 'document') {
    return getByPath(ctx.document, descriptor.path)
  }
  if (descriptor.source === 'page') {
    return getByPath(ctx.document.page, descriptor.path)
  }
  if (descriptor.source === 'compat') {
    return ctx.rawPage ? ctx.rawPage[descriptor.path] : undefined
  }
  // derived -- no stored value, the descriptor's normalize handles writes
  return undefined
}

/**
 * Apply a PagePropertyPatch to a DocumentSchema (mutates in place).
 * Returns separate partial objects for use with commands.
 */
export function splitPatch(patch: PagePropertyPatch): {
  pageUpdates: Partial<PageSchema> | undefined
  documentUpdates: Partial<Pick<DocumentSchema, 'unit' | 'meta' | 'extensions' | 'compat'>> | undefined
} {
  return {
    pageUpdates: patch.page,
    documentUpdates: patch.document,
  }
}

/**
 * Build a default PagePropertyPatch for a simple page-source property.
 * Used when no custom normalize is provided.
 */
export function defaultPagePatch(path: string, value: unknown): PagePropertyPatch {
  return { page: setByPath({} as Partial<PageSchema>, path, value) }
}

/**
 * Build a default PagePropertyPatch for a document-source property.
 */
export function defaultDocumentPatch(path: string, value: unknown): PagePropertyPatch {
  const partial: Record<string, unknown> = {}
  partial[path] = value
  return { document: partial as PagePropertyPatch['document'] }
}

/**
 * Group descriptors by their group field.
 */
export function groupDescriptors(descriptors: PagePropertyDescriptor[]): Map<PagePropertyGroup, PagePropertyDescriptor[]> {
  const groups = new Map<PagePropertyGroup, PagePropertyDescriptor[]>()
  for (const desc of descriptors) {
    const list = groups.get(desc.group)
    if (list) {
      list.push(desc)
    }
    else {
      groups.set(desc.group, [desc])
    }
  }
  return groups
}

/**
 * Filter descriptors by visibility predicates.
 */
export function filterVisible(descriptors: PagePropertyDescriptor[], ctx: PagePropertyContext): PagePropertyDescriptor[] {
  return descriptors.filter(d => !d.visible || d.visible(ctx))
}

// ─── Internal path helpers ──────────────────────────────────────

function getByPath(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object')
      return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

function setByPath<T extends Record<string, unknown>>(obj: T, path: string, value: unknown): T {
  const parts = path.split('.')
  let current: Record<string, unknown> = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    if (current[part] == null || typeof current[part] !== 'object') {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }
  current[parts[parts.length - 1]!] = value
  return obj
}
