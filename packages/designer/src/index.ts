import '@easyink/ui/index.css'

export { default as EasyInkDesigner } from './components/EasyInkDesigner.vue'
export { provideDesignerStore, useDesignerStore, useWorkbenchPersistence } from './composables'
export { DesignerInteractionService } from './interactions'
export type {
  DesignerDefaultsConfig,
  DesignerPaperConfig,
  DesignerRuntimeConfig,
} from './runtime-config'
export { DesignerStore } from './store/designer-store'
export type { DesignerCreateOptions } from './store/designer-store'
export { PaperRegistry } from './store/paper-registry'
export { createLocalStoragePreferenceProvider } from './store/preference-persistence'
export type { PersistableWorkbenchState } from './store/preference-persistence'
export { TemplateHistoryManager } from './store/template-history'
export { createDefaultSaveBranchMenu, createDefaultWorkbenchState } from './store/workbench'
export * from './types'
export type { FontDescriptor, FontProvider } from '@easyink/core'
