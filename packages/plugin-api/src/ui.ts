import type { MaterialNode } from '@easyink/schema'
import type { Component } from 'vue'
import type { DesignerExtension as BaseExtension, DesignerMaterial as BaseMaterial, DesignerContext, MaterialPropertiesContext } from './designer'

export type { DesignerCommand, DesignerContext, MaterialPropertiesContext } from './designer'

export interface PaletteGroup {
  readonly id: string
  readonly label: string
  readonly order?: number
}

export interface PalettePreset {
  readonly id: string
  readonly label: string
  readonly icon: Component
  readonly group: PaletteGroup
  readonly order?: number
  readonly dragData?: string
  readonly createDefaultNode?: (input?: Partial<MaterialNode>, unit?: string) => MaterialNode
}

/** The host always supplies context; business props cannot replace it. */
export interface ContextComponent<TContext> {
  readonly component: Component<{ context: TContext }>
  readonly props?: Readonly<Record<string, unknown>> & { readonly context?: never }
  readonly getProps?: (context: TContext) => Readonly<Record<string, unknown>> & { readonly context?: never }
}

export interface DesignerAction {
  readonly id: string
  readonly label: string
  readonly icon?: Component
  readonly order?: number
  readonly disabled?: (context: DesignerContext) => boolean
  readonly onClick: (context: DesignerContext) => void | Promise<void>
}

export interface DesignerUI {
  readonly toolbar?: readonly DesignerAction[]
  readonly contextMenu?: readonly DesignerAction[]
  readonly overlays?: readonly (ContextComponent<DesignerContext> & { readonly id: string })[]
}

export interface MaterialUI {
  readonly palette?: readonly PalettePreset[]
  readonly properties?: ContextComponent<MaterialPropertiesContext> & { readonly mode?: 'append' | 'replace-body' }
}

export type DesignerMaterial = BaseMaterial<MaterialUI>
export type DesignerExtension = BaseExtension<DesignerUI>
