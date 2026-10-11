import type { AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantPlugin } from '@easyink/assistant-plugins'
import type { AssistantLLMConfigService } from '@easyink/assistant-ui'
import type { DesignerCommand, DesignerContext } from '@easyink/plugin-api/designer'
import type { DesignerExtension } from '@easyink/plugin-api/ui'
import type { PropType } from 'vue'
import { DexieAssistantStore } from '@easyink/assistant-store'
import { IconSparkles } from '@easyink/icons'
import { DESIGNER_CONTEXT_TOKEN } from '@easyink/plugin-api/designer'
import { defineAsyncComponent, defineComponent, h, ref, shallowRef } from 'vue'
import {
  applyAssistantDataSourceToDesigner,
  applyAssistantPatchToDesigner,
  applyAssistantResultToDesigner,
  applySelectedAssistantElementsToDesigner,
  rollbackAssistantDesigner,
} from './apply'
import { assistantLocaleMessages } from './locale'
import { createAssistantMaterialManifest } from './material-manifest'

const AssistantPanel = defineAsyncComponent(() => import('./AssistantPanel.vue'))

export interface CreateAssistantContributionOptions {
  id?: string
  label?: string
  endpoint?: string
  llmConfig?: AssistantLLMConfigService
  plugins?: AssistantPlugin[]
}

export function createAssistantContribution(options: CreateAssistantContributionOptions = {}): DesignerExtension {
  const states = new WeakMap<object, ReturnType<typeof createState>>()
  function createState(context: DesignerContext) {
    const open = ref(false)
    const store = new DexieAssistantStore('easyink-assistant-ui')
    context.onDispose(() => {
      open.value = false
      states.delete(context[DESIGNER_CONTEXT_TOKEN] ?? context)
    })
    return { open, store }
  }
  function state(context: DesignerContext) {
    const key = context[DESIGNER_CONTEXT_TOKEN] ?? context
    let value = states.get(key)
    if (!value) {
      value = createState(context)
      states.set(key, value)
    }
    return value
  }
  const panelState: DesignerCommand<void, ReturnType<typeof createState>> = { id: 'assistant.panelState', handler: (_args, ctx) => state(ctx) }
  const ContextAssistantPanel = defineComponent({
    inheritAttrs: false,
    props: { context: { type: Object as PropType<DesignerContext>, required: true } },
    setup(props, { attrs }) {
      const current = shallowRef<ReturnType<typeof createState>>()
      const failure = shallowRef<unknown>()
      void props.context.executeCommand(panelState, undefined).then((value) => {
        if (!props.context.signal.aborted)
          current.value = value
      }).catch((cause) => {
        if (!props.context.signal.aborted)
          failure.value = cause
      })
      return () => {
        if (failure.value)
          throw failure.value
        const value = current.value
        return value ? h(AssistantPanel, { ...attrs, context: props.context, open: value.open.value, store: value.store }) : null
      }
    },
  })
  const open: DesignerCommand = { id: 'assistant.open', handler: (_args, ctx) => {
    state(ctx).open.value = true
  } }
  const close: DesignerCommand = { id: 'assistant.close', handler: (_args, ctx) => {
    state(ctx).open.value = false
  } }
  const toggle: DesignerCommand = { id: 'assistant.togglePanel', handler: (_args, ctx) => {
    state(ctx).open.value = !state(ctx).open.value
  } }
  const apply: DesignerCommand<AssistantResult> = { id: 'assistant.applyResult', handler: (result, ctx) => applyAssistantResultToDesigner(ctx, result) }
  const patch: DesignerCommand<AssistantPatchOperation[], boolean> = { id: 'assistant.applyPatch', handler: (operations, ctx) => applyAssistantPatchToDesigner(ctx, operations) }
  const selected: DesignerCommand<AssistantPatchOperation[], boolean> = { id: 'assistant.applySelectedElements', handler: (operations, ctx) => applySelectedAssistantElementsToDesigner(ctx, operations) }
  const dataSource: DesignerCommand<NonNullable<AssistantResult['dataSource']>> = { id: 'assistant.applyDataSource', handler: (source, ctx) => applyAssistantDataSourceToDesigner(ctx, source) }
  const rollback: DesignerCommand<void, boolean> = { id: 'assistant.rollback', handler: (_args, ctx) => rollbackAssistantDesigner(ctx) }
  const attach = { id: 'assistant.attachCurrentSelection', handler: (_args: void, ctx: DesignerContext) => ({ selectedIds: ctx.getSelection().ids, schema: ctx.getSchema(), dataSources: ctx.getDataSources() }) }
  return {
    id: options.id ?? 'easyink.assistant',
    locale: assistantLocaleMessages,
    commands: [open, close, toggle, panelState, apply, patch, selected, dataSource, rollback, attach],
    ui: {
      toolbar: [{ id: 'assistant.toggle', icon: IconSparkles, label: options.label ?? 'designer.assistant.toolbar.label', onClick: ctx => ctx.executeCommand(toggle, undefined) }],
      overlays: [{
        id: 'assistant.panel',
        component: ContextAssistantPanel,
        getProps: ctx => ({
          'onUpdate:open': (next: boolean) => ctx.executeCommand(next ? open : close, undefined),
          'onRequestClose': () => ctx.executeCommand(close, undefined),
          'endpoint': options.endpoint,
          'conversationId': options.id ?? 'easyink.assistant',
          'llmConfig': options.llmConfig,
          'plugins': options.plugins ?? [],
          'currentSchema': ctx.getSchema(),
          'materialManifest': createAssistantMaterialManifest(ctx),
          't': ctx.t,
          'onApply': (result: AssistantResult) => ctx.executeCommand(apply, result),
          'onApplyPatch': (operations: AssistantPatchOperation[]) => ctx.executeCommand(patch, operations),
          'onApplySelectedPatch': (operations: AssistantPatchOperation[]) => ctx.executeCommand(selected, operations),
          'onApplyDataSource': (source: NonNullable<AssistantResult['dataSource']>) => ctx.executeCommand(dataSource, source),
          'onRollback': () => ctx.executeCommand(rollback, undefined),
        }),
      }],
    },
  }
}
