import type { MaterialDataContract, MaterialExtensionFactory, MaterialViewerExtension, PropSchema } from '@easyink/core'
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
  createDefaultNode: (input?: Partial<MaterialNode>, unit?: string) => MaterialNode
  factory: MaterialExtensionFactory
  aiDescriptor?: AIMaterialDescriptor
  dataContract?: MaterialDataContract
  /** Material-owned PropSchemas appended to the designer's static registry entries. */
  propSchemas?: PropSchema[]
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
}

export type BuiltinViewerRegistrar = (type: string, extension: MaterialViewerExtension) => void
