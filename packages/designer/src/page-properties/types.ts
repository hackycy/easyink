import type { DocumentSchema, PageSchema } from '@easyink/schema'

/**
 * Descriptor group for page properties.
 */
export type PagePropertyGroup = 'document' | 'paper' | 'print' | 'assist' | 'background'

/**
 * Where the property value originates.
 */
export type PagePropertySource = 'document' | 'page' | 'compat' | 'derived'

/**
 * How the property value is persisted.
 */
export type PagePropertyPersistence = 'schema' | 'compat' | 'derived'

/**
 * Editor widget type for rendering.
 */
export type PagePropertyEditorType = 'readonly' | 'number' | 'select' | 'switch' | 'color' | 'asset' | 'font'

/**
 * Enum option for select editors.
 */
export interface PagePropertyEnumOption {
  label: string
  value: string | number
}

/**
 * A single page property descriptor.
 * Drives page property panel rendering and value read/write.
 */
export interface PagePropertyDescriptor {
  id: string
  group: PagePropertyGroup
  source: PagePropertySource
  path: string
  label: string
  persisted: PagePropertyPersistence
  editor: PagePropertyEditorType
  enum?: PagePropertyEnumOption[]
  min?: number
  max?: number
  step?: number
  visible?: (ctx: PagePropertyContext) => boolean
  normalize?: (value: unknown, ctx: PagePropertyContext) => PagePropertyPatch
}

/**
 * Context available when evaluating page property descriptors.
 */
export interface PagePropertyContext {
  document: DocumentSchema
  rawPage?: Record<string, unknown>
  selectedElementId?: string
}

/**
 * Patch produced by a page property write.
 * Each field is a partial update to the corresponding schema layer.
 */
export interface PagePropertyPatch {
  page?: Partial<PageSchema>
  document?: Partial<Pick<DocumentSchema, 'unit' | 'meta' | 'extensions' | 'compat'>>
  compat?: Record<string, unknown>
}
