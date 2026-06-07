import type { BindingFormatEditorDefinition } from './binding-format-editor'
import type { MaterialDataContract } from './material-data-contract'

export type MaterialBindingDefinition
  = | MaterialNoBindingDefinition
    | MaterialOrdinaryBindingDefinition
    | MaterialDataContractBindingDefinition
    | MaterialCustomBindingDefinition

export interface MaterialNoBindingDefinition {
  kind: 'none'
}

export interface MaterialOrdinaryBindingDefinition {
  kind: 'ordinary'
  primaryProp: string
  indexedProps?: Record<number, string>
  formatEditor: BindingFormatEditorDefinition | false
}

export interface MaterialDataContractBindingDefinition {
  kind: 'data-contract'
  contract: MaterialDataContract
  formatEditor: BindingFormatEditorDefinition | false
}

export interface MaterialCustomBindingDefinition {
  kind: 'custom'
}
