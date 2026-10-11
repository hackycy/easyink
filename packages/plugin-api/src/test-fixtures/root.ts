import type { MaterialModel, ResourceContext } from '@easyink/plugin-api'
import { model } from './model'

export * from '@easyink/plugin-api'
export const materialModel: MaterialModel = model
export function consumeLifetime(context: ResourceContext) {
  context.signal.throwIfAborted()
  context.onDispose(() => {})
}
