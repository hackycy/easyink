import type { Contribution } from '@easyink/designer'
import { IconSparkles } from '@easyink/icons'
import { defineAsyncComponent, ref } from 'vue'

const AIPanel = defineAsyncComponent(() => import('./components/AIPanel.vue'))

export interface CreateAIContributionOptions {
  /** Optional contribution id; defaults to "easyink.ai". */
  id?: string
  /** Toolbar button label / tooltip. */
  label?: string
  /** Known material types passed to AIPanel for stricter validation. */
  knownMaterialTypes?: Set<string>
}

/**
 * Create an EasyInk Designer contribution that exposes an AI template
 * generation panel, a toolbar toggle button, and a `ai.togglePanel` command.
 */
export function createAIContribution(options: CreateAIContributionOptions = {}): Contribution {
  const open = ref(false)

  return {
    id: options.id ?? 'easyink.ai',
    activate(ctx) {
      ctx.registerCommand({
        id: 'ai.togglePanel',
        handler: () => {
          open.value = !open.value
        },
      })

      ctx.registerToolbarAction({
        id: 'ai.toggle',
        icon: IconSparkles,
        label: options.label ?? 'AI 模板生成',
        onClick: () => {
          void ctx.executeCommand('ai.togglePanel')
        },
      })

      ctx.registerPanel({
        id: 'ai.panel',
        component: AIPanel,
        props: {
          get 'open'() {
            return open.value
          },
          'onUpdate:open': (next: boolean) => {
            open.value = next
          },
          'knownMaterialTypes': options.knownMaterialTypes,
        },
      })

      ctx.onDispose(() => {
        open.value = false
      })
    },
  }
}
