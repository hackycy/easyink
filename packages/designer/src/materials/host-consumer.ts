import type { ResourceContext } from '@easyink/plugin-api'

import type { DesignerMaterial, DesignerRenderer, DesignerRenderInstance } from '@easyink/plugin-api/designer'

import type { ConsumerContext, Host, HostConfig, HostMaterial, HostRegistry } from '@easyink/plugin-runtime'
import type { DesignerRendererOperations } from './renderer-context'
import { createHost } from '@easyink/plugin-runtime'
import { createDesignerRendererContext } from './renderer-context'

type DesignerHostMaterial = Extract<HostMaterial, DesignerMaterial<unknown>>

/** Framework seam; the Store supplies controlled operations, never itself. */
export async function createDesignerMaterialHost<M extends DesignerHostMaterial>(
  config: HostConfig<M> & { kind: 'designer' },
  operations: DesignerRendererOperations | ((registry: HostRegistry<M>, consumer: ConsumerContext) => DesignerRendererOperations),
) {
  const instances = new Map<string, DesignerRenderInstance>()
  const pending = new Map<string, Promise<DesignerRenderInstance | undefined>>()
  let controlledOperations: DesignerRendererOperations
  const host = await createHost(config, (registry, consumer) => {
    consumer.onDispose(() => {
      pending.clear()
      instances.clear()
    })
    controlledOperations = typeof operations === 'function' ? operations(registry, consumer) : operations
    for (const entry of registry.materials) {
      if (entry.value.renderer) {
        instances.set(entry.key, initialize(entry.value.renderer, consumer.resources(entry.owner)))
      }
    }
  })

  function initialize(renderer: DesignerRenderer, resources: ResourceContext) {
    if (typeof renderer !== 'function')
      throw new TypeError('A Designer renderer must be a factory')
    const extension = renderer(createDesignerRendererContext(controlledOperations, resources))
    if (!extension || typeof extension.renderContent !== 'function')
      throw new TypeError('A Designer factory must return a synchronous renderContent implementation')
    return extension
  }

  function getExtension(type: string): Promise<DesignerRenderInstance | undefined> {
    assertActive(host)
    const cached = instances.get(type)
    if (cached)
      return Promise.resolve(cached)
    const declaration = host.registry.getMaterial(type)?.value
    if (!declaration?.loadRenderer)
      return Promise.resolve(undefined)
    const loading = pending.get(type)
    if (loading)
      return loading
    const task = host.runTask(type, async (resources) => {
      const renderer = await declaration.loadRenderer!(resources)
      // A late loader cannot start the factory, even when the loader ignores abort.
      if (resources.signal.aborted)
        return undefined
      return initialize(renderer, resources)
    }).then((extension) => {
      if (host.state !== 'active')
        return undefined
      if (extension)
        instances.set(type, extension)
      return extension
    }).finally(() => {
      if (pending.get(type) === task)
        pending.delete(type)
    })
    pending.set(type, task)
    return task
  }

  function peekExtension(type: string): DesignerRenderInstance | undefined {
    assertActive(host)
    return instances.get(type)
  }

  return Object.freeze({ host, getExtension, peekExtension, destroy: host.destroy })
}

function assertActive<M extends DesignerHostMaterial>(host: Host<M>) {
  if (host.state !== 'active')
    throw new Error(`Designer does not accept work while ${host.state}`)
}
