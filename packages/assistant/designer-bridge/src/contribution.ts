import type { AssistantResult } from '@easyink/assistant-capabilities'
import type { Contribution } from '@easyink/designer'
import { IconSparkles } from '@easyink/icons'
import { defineAsyncComponent, ref } from 'vue'
import { applyAssistantResultToDesigner } from './apply'

const AssistantPanel = defineAsyncComponent(() => import('./AssistantPanel.vue'))

export interface CreateAssistantContributionOptions {
  id?: string
  label?: string
  endpoint?: string
}

export function createAssistantContribution(options: CreateAssistantContributionOptions = {}): Contribution {
  const open = ref(false)

  return {
    id: options.id ?? 'easyink.assistant',
    activate(ctx) {
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
          'onApply': (result: AssistantResult) => {
            void ctx.executeCommand('assistant.applyResult', result)
            open.value = false
          },
        },
      })

      ctx.onDispose(() => {
        open.value = false
      })
    },
  }
}
