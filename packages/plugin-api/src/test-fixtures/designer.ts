import type { DesignerCommand, DesignerContext, DesignerExtension, DesignerMaterial, DesignerRenderer, MaterialPropertiesContext } from '@easyink/plugin-api/designer'
import { model } from './model'

export * from '@easyink/plugin-api/designer'

const renderer: DesignerRenderer = context => ({
  renderContent: (_node, container) => {
    container.textContent = context.t('fixture.name')
    return () => {
      container.textContent = ''
    }
  },
})

export const material: DesignerMaterial = {
  model,
  renderer,
  properties: [{ key: 'label', label: 'Label', type: 'string' }],
  sectionFilter: (_section, context) => !context.isEditing,
}
export const lazyMaterial: DesignerMaterial = { model, loadRenderer: async () => renderer }
export const materials: readonly DesignerMaterial[] = [material]
export const none: readonly DesignerMaterial[] = []

export const command: DesignerCommand<{ value: string }, number> = {
  id: 'fixture.length',
  handler: (args, context) => {
    context.tx.run('fixture-node', (draft) => {
      draft.props.label = args.value
    })
    return args.value.length
  },
}
export const extension: DesignerExtension = { id: 'fixture.commands', commands: [command] }

export async function verifyDesignerPermissions(context: DesignerContext, properties: MaterialPropertiesContext) {
  const result: number = await context.executeCommand(command, { value: 'label' })
  // @ts-expect-error Commands preserve their parameter type.
  context.executeCommand(command, { value: 1 })
  // @ts-expect-error Commands preserve their result type.
  const wrongResult: string = await context.executeCommand(command, { value: 'label' })
  // @ts-expect-error Queries never return mutable live documents.
  context.getSchema().elements.push(model.createDefaultNode())
  // @ts-expect-error Selection query results are read-only.
  context.getSelection().ids.push('another')
  // @ts-expect-error Extensions do not receive the Store.
  const forbiddenStore = context.store
  // @ts-expect-error Properties components cannot replace the document.
  properties.replaceDocument({})
  // @ts-expect-error UI contracts cannot be smuggled through a framework-free declaration.
  const invalidUI: DesignerMaterial = { model, renderer, ui: {} }
  return { result, wrongResult, invalidUI, forbiddenStore }
}

// @ts-expect-error A model without a Designer renderer is incomplete.
export const incomplete: DesignerMaterial = { model }
// @ts-expect-error Designer renderers also require a shared model.
export const missingModel: DesignerMaterial = { renderer }
