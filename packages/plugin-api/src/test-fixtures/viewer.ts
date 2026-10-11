import type { ViewerContext, ViewerMaterial, ViewerRenderer } from '@easyink/plugin-api/viewer'
import { model } from './model'

export * from '@easyink/plugin-api/viewer'

const renderer: ViewerRenderer = {
  render: (_node, context) => ({ element: context.document.createElement('span') }),
  measure: node => ({ width: node.width, height: node.height }),
  getRenderSize: node => ({ width: node.width }),
}

export const material: ViewerMaterial = {
  model,
  renderer,
  locale: { messages: { fixture: { name: 'Fixture' } } },
  ai: { type: model.type, description: 'Fixture', properties: [] },
}
export const lazyMaterial: ViewerMaterial = {
  model,
  loadRenderer: async (context) => {
    context.onDispose(() => {})
    return renderer
  },
}
export const sessionMaterial: ViewerMaterial = {
  model,
  renderer: {
    createSession: context => ({
      prepare: async () => { context.signal.throwIfAborted() },
      ...renderer,
    }),
  },
}
export const materials: readonly ViewerMaterial[] = [material]
export const none: readonly ViewerMaterial[] = []

// @ts-expect-error Selected materials must include their host renderer or loader.
export const missingRenderer: ViewerMaterial = { model }
// @ts-expect-error Selected renderer implementations require their shared model.
export const missingModel: ViewerMaterial = { renderer }
// @ts-expect-error A declaration chooses one implementation acquisition mode.
export const bothRenderers: ViewerMaterial = { model, renderer, loadRenderer: async () => renderer }

export function verifyViewerPermissions(context: ViewerContext) {
  // @ts-expect-error Viewer callbacks cannot edit documents.
  context.replaceDocument({})
  // @ts-expect-error Viewer callbacks cannot access the Designer Store.
  const forbiddenStore = context.store
  // @ts-expect-error Viewer callbacks cannot register more capabilities.
  context.registerMaterial(material)
  // @ts-expect-error Render input snapshots are read-only.
  context.data.changed = true
  // @ts-expect-error Render methods cannot return a Promise.
  const asynchronousRender: ViewerRenderer['render'] = async () => ({})
  // @ts-expect-error Domain page semantics belong to the model.
  const duplicatedDomain: ViewerRenderer = { ...renderer, pageAware: true }
  return { asynchronousRender, duplicatedDomain, forbiddenStore }
}
