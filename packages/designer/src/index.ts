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
export { DesignerInteractionService } from './interactions'
export { registerMaterialBundle, tableSectionFilter } from './materials/registry'
export type {
  DesignerCatalogGroupRegistration,
  DesignerCatalogRegistration,
  DesignerMaterialBundle,
  DesignerMaterialRegistration,
} from './materials/registry'
export type {
  DesignerDefaultsConfig,
  DesignerMaterialConfig,
  DesignerPaperConfig,
  DesignerRuntimeConfig,
} from './runtime-config'
export { DesignerStore } from './store/designer-store'
export { PaperRegistry } from './store/paper-registry'
export { createLocalStoragePreferenceProvider } from './store/preference-persistence'
export type { PersistableWorkbenchState } from './store/preference-persistence'
export { TemplateHistoryManager } from './store/template-history'
export { createDefaultSaveBranchMenu, createDefaultWorkbenchState } from './store/workbench'
export * from './types'
export type { FontDescriptor, FontProvider } from '@easyink/core'
