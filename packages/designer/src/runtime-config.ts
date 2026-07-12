import type { CompiledMaterialProfile, MaterialPackageRegistration } from '@easyink/core'
import type { DocumentSchema, PageSchema } from '@easyink/schema'
import type { PaperPreset } from '@easyink/shared'
import type { Component } from 'vue'
import { compileMaterialProfile, EASYINK_ENGINE_VERSION } from '@easyink/core'

export interface DesignerMaterialConfig {
  profile?: CompiledMaterialProfile
  packages?: readonly MaterialPackageRegistration[]
  engineVersion?: string
  icons?: Readonly<Record<string, Component>>
}

export function resolveDesignerMaterialProfile(config?: DesignerMaterialConfig): CompiledMaterialProfile {
  if (config?.profile && config.packages)
    throw new Error('DESIGNER_MATERIAL_PROFILE_CONFIG_CONFLICT')
  if (config?.profile)
    return config.profile
  return compileMaterialProfile({
    id: 'designer-runtime',
    engineVersion: config?.engineVersion ?? EASYINK_ENGINE_VERSION,
    packages: config?.packages ?? [],
  })
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
