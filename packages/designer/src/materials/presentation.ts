import type { MaterialBindingDefinition, MaterialConditionCapability, PropSchema } from '@easyink/core'
import type { MaterialModel } from '@easyink/plugin-api/material'
import type { DesignerMaterial } from '@easyink/plugin-api/ui'
import type { MaterialNode } from '@easyink/schema'
import type { AIMaterialDescriptor, MaterialCategory } from '@easyink/shared'
import type { Component } from 'vue'

type MaterialIcon = Component

/** Private workbench views derived on demand from the Host's complete declarations. */
export interface MaterialPresentation {
  type: string
  name: string
  icon: MaterialIcon
  category: MaterialCategory
  capabilities: NonNullable<MaterialModel['capabilities']> & { pageAware?: boolean }
  condition?: MaterialConditionCapability
  props: PropSchema[]
  binding: MaterialBindingDefinition
  aiDescriptor?: AIMaterialDescriptor
  createDefaultNode: (input?: Partial<MaterialNode>, unit?: string) => MaterialNode
  /**
   * Dynamic filter for PropertiesPanel sections.
   * Return false to hide a section. When absent, all sections are shown.
   */
  sectionFilter?: DesignerMaterial['sectionFilter']
}

// ─── Material Catalog ──────────────────────────────────────────────

export interface PaletteItem {
  id: string
  groupId: string
  label: string
  icon: MaterialIcon
  materialType: string
  createDefaultNode?: MaterialPresentation['createDefaultNode']
  dragData?: string
  useTokens?: string[]
  order?: number
}

export interface PaletteGroup {
  id: string
  label: string
  order?: number
  items: PaletteItem[]
}
