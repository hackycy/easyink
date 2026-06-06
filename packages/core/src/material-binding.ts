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
}

export interface MaterialDataContractBindingDefinition {
  kind: 'data-contract'
  contract: MaterialDataContract
}

export interface MaterialCustomBindingDefinition {
  kind: 'custom'
}
