import type { Contribution } from '@easyink/designer'
import { defineAsyncComponent, defineComponent, h, ref } from 'vue'

const SparklesIcon = defineComponent({
  props: {
    size: { type: Number, default: 16 },
    strokeWidth: { type: Number, default: 1.5 },
  },
  setup(props) {
    return () =>
      h('svg', {
        'width': props.size,
        'height': props.size,
        'viewBox': '0 0 24 24',
        'fill': 'none',
        'stroke': 'currentColor',
        'stroke-width': props.strokeWidth,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      }, [
        h('path', { d: 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1' }),
      ])
  },
})

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
        icon: SparklesIcon,
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
