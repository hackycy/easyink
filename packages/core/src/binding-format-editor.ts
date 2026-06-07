import type { BindingFormatPresetType } from '@easyink/shared'

export type BindingFormatEditorTab = 'preset' | 'custom' | (string & {})

export interface BindingFormatEditorDefinition {
  tabs: readonly BindingFormatEditorTab[]
  defaultTab?: BindingFormatEditorTab
  presetTypes?: BindingFormatPresetType[]
}
