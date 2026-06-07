import type { LazyMaterialExtensionFactory, MaterialBindingDefinition, MaterialExtensionFactory, MaterialViewerExtension, PropSchema } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { AIMaterialDescriptor, MaterialCategory } from '@easyink/shared'
import type { Component } from 'vue'

export type BuiltinPanelSectionId = 'geometry' | 'props' | 'overlay' | 'binding' | 'visibility'

export interface BuiltinMaterialCapabilities {
  bindable?: boolean
  rotatable?: boolean
  resizable?: boolean
  supportsChildren?: boolean
  supportsAnimation?: boolean
  supportsUnionDrop?: boolean
  pageAware?: boolean
  multiBinding?: boolean
  keepAspectRatio?: boolean
}

export interface BuiltinDesignerMaterialRegistration {
  type: string
  name: string
  icon: Component
  category: MaterialCategory
  capabilities: BuiltinMaterialCapabilities
  binding: MaterialBindingDefinition
  createDefaultNode: (input?: Partial<MaterialNode>, unit?: string) => MaterialNode
  factory: MaterialExtensionFactory
  lazyFactory?: LazyMaterialExtensionFactory
  aiDescriptor?: AIMaterialDescriptor
  /** Designer property schemas owned by this material. */
  propSchemas?: PropSchema[]
  localeMessages?: {
    messages?: BuiltinLocaleMessages
    locales?: Record<string, BuiltinLocaleMessages>
  }
  sectionFilter?: (sectionId: BuiltinPanelSectionId) => boolean
}

export interface BuiltinDesignerCatalogRegistration {
  id?: string
  type: string
  group: 'data' | 'chart' | 'svg' | 'utility'
  label?: string
  icon?: Component
  createDefaultNode?: (input?: Partial<MaterialNode>, unit?: string) => MaterialNode
  dragData?: string
}

export interface BuiltinDesignerMaterialBundle {
  materials: BuiltinDesignerMaterialRegistration[]
  quickMaterialTypes: string[]
  groupedCatalog: BuiltinDesignerCatalogRegistration[]
  localeMessages?: {
    messages?: BuiltinLocaleMessages
    locales?: Record<string, BuiltinLocaleMessages>
  }
}

export type BuiltinViewerRegistrar = (type: string, binding: MaterialBindingDefinition, extension: MaterialViewerExtension) => void

export interface BuiltinLocaleMessages {
  [key: string]: string | BuiltinLocaleMessages
}
