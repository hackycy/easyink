import type { BindingFormatPresetType } from '@easyink/shared'
import type { MaterialDataContract } from './material-data-contract'

export type MaterialBindingValueShape = 'scalar' | 'record' | 'record-array' | 'json'

export interface MaterialBindingPortPolicy {
  id: string
  key: { kind: 'exact' | 'prefix', value: string }
  role: 'semantic' | 'display'
  valueShape: MaterialBindingValueShape
  modelPath?: `/${string}`
  formatEditor: false | {
    tabs: readonly ['preset']
    presetTypes?: readonly BindingFormatPresetType[]
  }
}

export type MaterialBindingDefinition
  = | MaterialNoBindingDefinition
    | MaterialPortsBindingDefinition

export interface MaterialNoBindingDefinition {
  kind: 'none'
}

export interface MaterialPortsBindingDefinition {
  kind: 'ports'
  ports: readonly MaterialBindingPortPolicy[]
  dataContract?: MaterialDataContract
}
