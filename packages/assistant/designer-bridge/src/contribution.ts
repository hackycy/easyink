import type { AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import type { Contribution } from '@easyink/designer'
import { IconSparkles } from '@easyink/icons'
import { defineAsyncComponent, ref } from 'vue'
import {
  applyAssistantDataSourceToDesigner,
  applyAssistantPatchToDesigner,
  applyAssistantResultToDesigner,
  applySelectedAssistantElementsToDesigner,
  rollbackAssistantDesigner,
} from './apply'
import { createLocalAssistantApiClient } from './local-client'

const AssistantPanel = defineAsyncComponent(() => import('./AssistantPanel.vue'))

export interface CreateAssistantContributionOptions {
  id?: string
  label?: string
  endpoint?: string
  useLocalClient?: boolean
}

export function createAssistantContribution(options: CreateAssistantContributionOptions = {}): Contribution {
  const open = ref(false)
  const apiClient = options.useLocalClient ? createLocalAssistantApiClient() : undefined

  return {
    id: options.id ?? 'easyink.assistant',
    activate(ctx) {
      ctx.registerCommand({
        id: 'assistant.open',
        handler: () => {
          open.value = true
        },
      })

      ctx.registerCommand({
        id: 'assistant.close',
        handler: () => {
          open.value = false
        },
      })

      ctx.registerCommand({
        id: 'assistant.togglePanel',
        handler: () => {
          open.value = !open.value
        },
      })

      ctx.registerCommand<AssistantResult, void>({
        id: 'assistant.applyResult',
        handler: (result, commandCtx) => {
          applyAssistantResultToDesigner(commandCtx.store, result)
        },
      })

      ctx.registerCommand<AssistantPatchOperation[], void>({
        id: 'assistant.applyPatch',
        handler: (operations, commandCtx) => {
          applyAssistantPatchToDesigner(commandCtx.store, operations)
        },
      })

      ctx.registerCommand<AssistantPatchOperation[], boolean>({
        id: 'assistant.applySelectedElements',
        handler: (operations, commandCtx) => applySelectedAssistantElementsToDesigner(commandCtx.store, operations),
      })

      ctx.registerCommand<NonNullable<AssistantResult['dataSource']>, void>({
        id: 'assistant.applyDataSource',
        handler: (dataSource, commandCtx) => {
          applyAssistantDataSourceToDesigner(commandCtx.store, dataSource)
        },
      })

      ctx.registerCommand<void, boolean>({
        id: 'assistant.rollback',
        handler: (_args, commandCtx) => rollbackAssistantDesigner(commandCtx.store),
      })

      ctx.registerCommand<void, { selectedIds: string[], schema: unknown, dataSources: unknown[] }>({
        id: 'assistant.attachCurrentSelection',
        handler: (_args, commandCtx) => ({
          selectedIds: commandCtx.store.selection.ids,
          schema: commandCtx.store.schema,
          dataSources: commandCtx.store.dataSourceRegistry.getSources(),
        }),
      })

      ctx.registerToolbarAction({
        id: 'assistant.toggle',
        icon: IconSparkles,
        label: options.label ?? 'Assistant',
        onClick: () => {
          void ctx.executeCommand('assistant.togglePanel')
        },
      })

      ctx.registerPanel({
        id: 'assistant.panel',
        component: AssistantPanel,
        props: {
          get 'open'() {
            return open.value
          },
          'onUpdate:open': (next: boolean) => {
            open.value = next
          },
          'endpoint': options.endpoint,
          'apiClient': apiClient,
          get 'currentSchema'() {
            return ctx.store.schema
          },
          'onApply': (result: AssistantResult) => {
            void ctx.executeCommand('assistant.applyResult', result)
          },
          'onApplyPatch': (operations: AssistantPatchOperation[]) => {
            void ctx.executeCommand('assistant.applyPatch', operations)
          },
          'onApplySelectedPatch': (operations: AssistantPatchOperation[]) => {
            void ctx.executeCommand('assistant.applySelectedElements', operations)
          },
          'onApplyDataSource': (dataSource: NonNullable<AssistantResult['dataSource']>) => {
            void ctx.executeCommand('assistant.applyDataSource', dataSource)
          },
          'onRollback': () => {
            void ctx.executeCommand('assistant.rollback')
          },
        },
      })

      ctx.onDispose(() => {
        open.value = false
      })
    },
  }
}
