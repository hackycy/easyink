import type { DesignerContext, MaterialPropertiesContext } from '@easyink/plugin-api/designer'
import type { ContextComponent, DesignerExtension, DesignerMaterial } from '@easyink/plugin-api/ui'
import type { FunctionalComponent } from 'vue'
import { defineComponent, h } from 'vue'
import { command, material } from './designer'
import { model } from './model'

const Overlay: FunctionalComponent<{ context: DesignerContext }> = props => h('span', props.context.t('fixture.name'))
const Properties: FunctionalComponent<{ context: MaterialPropertiesContext }> = props => h('span', props.context.node.id)
const Icon: FunctionalComponent = () => h('span', 'F')
const StatefulOverlay = defineComponent<{ context: DesignerContext }>(props => () => h('span', props.context.t('fixture.name')), { props: ['context'] })

export const completeMaterial: DesignerMaterial = {
  ...material,
  ui: {
    palette: [{ id: 'default', label: 'Fixture', icon: Icon, group: { id: 'basic', label: 'Basic', order: 10 } }],
    properties: { component: Properties, mode: 'append', props: { label: 'Fixture' } },
  },
}
export const replacedProperties: DesignerMaterial = {
  ...completeMaterial,
  ui: { properties: { component: Properties, mode: 'replace-body' } },
}
export const materials: readonly DesignerMaterial[] = [completeMaterial]
export const extension: DesignerExtension = {
  id: 'fixture.ui-and-command',
  commands: [command],
  ui: {
    toolbar: [{ id: 'toolbar', label: 'Run', icon: Icon, onClick: async (context) => { await context.executeCommand(command, { value: 'toolbar' }) } }],
    contextMenu: [{ id: 'context-menu', label: 'Run', order: -1, disabled: context => context.getSelection().isEmpty, onClick: () => {} }],
    overlays: [{ id: 'overlay', component: StatefulOverlay, getProps: context => ({ label: context.t('fixture.name') }) }],
  },
}
export const independentUI: DesignerExtension = { id: 'fixture.only-ui', ui: { overlays: [{ id: 'panel', component: Overlay }] } }

export function verifyComponentPermissions() {
  // @ts-expect-error Node properties and independent Designer contexts are distinct.
  const wrongContext: ContextComponent<MaterialPropertiesContext> = { component: Overlay }
  // @ts-expect-error Stateful Vue components must receive the matching context too.
  const wrongStatefulContext: ContextComponent<MaterialPropertiesContext> = { component: StatefulOverlay }
  // @ts-expect-error Business props cannot override the host context.
  const overridden: ContextComponent<DesignerContext> = { component: Overlay, props: { context: {} } }
  // @ts-expect-error Getter props cannot override the host context either.
  const overriddenGetter: ContextComponent<DesignerContext> = { component: Overlay, getProps: context => ({ context }) }
  // @ts-expect-error No general properties before/after slots are defined.
  const extraSlot: DesignerExtension = { id: 'extra', ui: { propertiesBefore: [] } }
  // @ts-expect-error UI alone cannot substitute for the required renderer.
  const incomplete: DesignerMaterial = { model, ui: {} }
  return { wrongContext, wrongStatefulContext, overridden, overriddenGetter, extraSlot, incomplete }
}
