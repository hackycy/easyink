import type { DesignerCreateOptions, EasyInkDesignerProps } from '@easyink/designer'
import type { DeepReadonly } from '@easyink/plugin-api'
import type { DesignerCommand, DesignerContext, DesignerExtension, DesignerMaterial, MaterialPropertiesContext } from '@easyink/plugin-api/ui'
import type { DisposeResult } from '@easyink/plugin-runtime'
import type { PropType } from 'vue'
import { materials as defaults } from '@easyink/builtin'
import { materials as all } from '@easyink/builtin/all'
import { materials as basic } from '@easyink/builtin/basic'
import { materials as none } from '@easyink/builtin/none'
import { DesignerStore, EasyInkDesigner } from '@easyink/designer'
import { image } from '@easyink/material-image'
import { text } from '@easyink/material-text'
import { text as viewerText } from '@easyink/material-text/viewer'
import { defineComponent, h } from 'vue'

export const command: DesignerCommand<{ label: string }, number> = {
  id: 'fixture.label-length',
  handler: (args, context) => {
    context.tx.run('node', (draft) => {
      draft.props.label = args.label
    })
    return args.label.length
  },
}

const panel = defineComponent({
  props: { context: { type: Object as PropType<DesignerContext>, required: true } },
  setup: props => () => h('span', props.context.t('fixture.label')),
})
const properties = defineComponent({
  props: { context: { type: Object as PropType<MaterialPropertiesContext>, required: true } },
  setup: props => () => h('span', props.context.node.type),
})
export const extension: DesignerExtension = {
  id: 'fixture.ui-and-command',
  commands: [command],
  ui: {
    toolbar: [{ id: 'length', label: 'Length', onClick: async (context) => { await context.executeCommand(command, { label: 'label' }) } }],
    overlays: [{ id: 'panel', component: panel }],
  },
}
export const material: DesignerMaterial = {
  model: { type: 'fixture', binding: { kind: 'none' }, createDefaultNode: () => ({ id: 'node', type: 'fixture', x: 0, y: 0, width: 10, height: 10, props: {} }) },
  renderer: context => ({ renderContent: (_node, container) => {
    container.textContent = context.getNode('node')?.type ?? ''
    return () => container.replaceChildren()
  } }),
  ui: { properties: { component: properties } },
}

export const collections: readonly (readonly DesignerMaterial[])[] = [defaults, all, basic, none, [text, image, material]]
export const options: DesignerCreateOptions = { materials: all, extensions: [extension] }
export const props: EasyInkDesignerProps = { materials: basic, extensions: [extension] }
export const component = () => h(EasyInkDesigner, { ...props, onReady: () => {}, onError: (_cause: unknown) => {} })
export const emptyComponent = () => h(EasyInkDesigner, { materials: none })

export async function consume() {
  const pending: Promise<DesignerStore> = DesignerStore.create(options)
  // @ts-expect-error Programmatic creation delivers a ready Store asynchronously.
  const synchronous: DesignerStore = DesignerStore.create(options)
  const store = await pending
  const installed: readonly DeepReadonly<DesignerMaterial>[] = store.getMaterialDeclarations()
  const disposal: Promise<DisposeResult> = store.destroy()
  // @ts-expect-error The old synchronous constructor is private.
  const legacy = new DesignerStore()
  // @ts-expect-error Store has no material registration facade.
  store.registerMaterial(material)
  // @ts-expect-error Store has no locale registration facade.
  store.registerLocaleMessages({ messages: {} })
  // @ts-expect-error Store has no Contribution registration facade.
  store.registerContribution(extension)
  // @ts-expect-error Installed declarations are deeply read-only.
  installed[0].model.binding.kind = 'custom'
  // @ts-expect-error Viewer renderers cannot initialize a Designer Host.
  DesignerStore.create({ materials: [viewerText] })
  // @ts-expect-error A selected material must include its Designer renderer.
  DesignerStore.create({ materials: [{ model: material.model }] })
  // @ts-expect-error Creation cannot run the legacy setupStore injection callback.
  DesignerStore.create({ setupStore: (_store: DesignerStore) => {} })
  // @ts-expect-error Component props cannot inject the full Store into extensions.
  const legacyProps: EasyInkDesignerProps = { contributions: [extension] }
  return { installed, disposal, synchronous, legacy, legacyProps }
}

export async function permissions(context: DesignerContext, propertyContext: MaterialPropertiesContext) {
  const length: number = await context.executeCommand(command, { label: 'value' })
  // @ts-expect-error Commands retain argument types through the public creation options.
  context.executeCommand(command, { label: 1 })
  // @ts-expect-error UI and command contexts do not expose the Store.
  const store = context.store
  // @ts-expect-error UI contexts have no registration permission.
  context.registerMaterial(material)
  // @ts-expect-error Query snapshots are deeply read-only.
  context.getSchema().elements[0].props.label = 'changed'
  // @ts-expect-error Properties contexts cannot replace the whole document.
  propertyContext.replaceDocument({})
  return { length, store }
}
