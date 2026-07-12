import type { CompiledMaterialProfile } from '@easyink/core'
import type { DocumentSchema, PageSchema } from '@easyink/schema'
import type { PaperPreset } from '@easyink/shared'
import type { DesignerMaterialBundle } from './materials/registry'

export interface DesignerMaterialConfig {
  bundles?: DesignerMaterialBundle[]
  profiles?: CompiledMaterialProfile[]
}

export interface DesignerPaperConfig {
  /**
   * `append` keeps EasyInk presets and lets later entries override by name.
   * `replace` uses only host-provided presets.
   */
  mode?: 'append' | 'replace'
  presets?: PaperPreset[]
  defaultPreset?: string
}

export interface DesignerDefaultsConfig {
  document?: Partial<Pick<DocumentSchema, 'unit' | 'meta' | 'extensions' | 'compat'>>
  page?: Partial<PageSchema>
  materialProps?: Record<string, Record<string, unknown>>
}

export interface DesignerRuntimeConfig {
  materials?: DesignerMaterialConfig
  paper?: DesignerPaperConfig
  defaults?: DesignerDefaultsConfig
}
