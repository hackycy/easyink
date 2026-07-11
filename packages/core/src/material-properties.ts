import type { MaterialNode } from '@easyink/schema'
import type { PropSchemaType } from '@easyink/shared'
import type { JsonPointer } from './material-introspection'

export interface PropertyAccessor<T = unknown> {
  paths: readonly JsonPointer[]
  read: (node: MaterialNode) => T
  write: (draft: MaterialNode, value: T) => void
}

export interface PropertyDescriptor<T = unknown> {
  key: string
  label: string
  type: PropSchemaType
  group?: string
  default?: T
  enum?: readonly { label: string, value: T }[]
  min?: number
  max?: number
  step?: number
  nullable?: boolean
  editor?: string
  editorOptions?: Readonly<Record<string, unknown>>
  visible?: (model: Readonly<Record<string, unknown>>) => boolean
  disabled?: (model: Readonly<Record<string, unknown>>) => boolean
  accessor?: PropertyAccessor<T>
}
