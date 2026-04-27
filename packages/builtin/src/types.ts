import type { MaterialExtensionFactory, MaterialViewerExtension } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { MaterialCategory } from '@easyink/shared'

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
  icon: string
  category: MaterialCategory
  capabilities: BuiltinMaterialCapabilities
  createDefaultNode: (input?: Partial<MaterialNode>, unit?: string) => MaterialNode
  factory: MaterialExtensionFactory
  sectionFilter?: (sectionId: BuiltinPanelSectionId) => boolean
}

export interface BuiltinDesignerCatalogRegistration {
  type: string
  group: 'data' | 'chart' | 'svg' | 'utility'
}

export interface BuiltinDesignerMaterialBundle {
  materials: BuiltinDesignerMaterialRegistration[]
  quickMaterialTypes: string[]
  groupedCatalog: BuiltinDesignerCatalogRegistration[]
}

export type BuiltinViewerRegistrar = (type: string, extension: MaterialViewerExtension) => void
