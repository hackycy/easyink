import '@easyink/ui/index.css'

export { default as EasyInkDesigner } from './components/EasyInkDesigner.vue'
export { provideDesignerStore, useDesignerStore, useWorkbenchPersistence } from './composables'
export { ContributionRegistry } from './contributions'
export type {
  Command,
  Contribution,
  ContributionContext,
  PanelDescriptor,
  ToolbarActionDescriptor,
} from './contributions'
export { registerBuiltinMaterials } from './materials/registry'
export { DesignerStore } from './store/designer-store'
export { createLocalStoragePreferenceProvider } from './store/preference-persistence'
export type { PersistableWorkbenchState } from './store/preference-persistence'
export { TemplateHistoryManager } from './store/template-history'
export { createDefaultSaveBranchMenu, createDefaultWorkbenchState } from './store/workbench'
export type * from './types'
