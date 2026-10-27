import type { ViewerImplementation, ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { HostConfig, InitializeConsumer } from '@easyink/plugin-runtime'
import { createHost } from '@easyink/plugin-runtime'

/** Renderer availability only; output and session lifetimes belong to rendering. */
export async function createViewerMaterialHost(config: HostConfig<ViewerMaterial> & { kind: 'viewer' }, initialize?: InitializeConsumer<ViewerMaterial>) {
  const resolved = new Map<string, ViewerImplementation>()
  const pending = new Map<string, Promise<ViewerImplementation | undefined>>()
  const host = await createHost(config, async (registry, consumer) => {
    consumer.onDispose(() => {
      pending.clear()
      resolved.clear()
    })
    await initialize?.(registry, consumer)
  })

  function getRenderer(type: string): Promise<ViewerImplementation | undefined> {
    if (host.state !== 'active')
      throw new Error(`Viewer does not accept work while ${host.state}`)
    const declaration = host.registry.getMaterial(type)?.value
    if (!declaration)
      return Promise.resolve(undefined)
    // Eager declarations remain in the kernel; only acquired implementations are cached.
    if (declaration.renderer)
      return Promise.resolve(declaration.renderer)
    const cached = resolved.get(type)
    if (cached)
      return Promise.resolve(cached)
    const loading = pending.get(type)
    if (loading)
      return loading
    const task = host.runTask(type, async (resources) => {
      const renderer = await declaration.loadRenderer!(resources)
      if (resources.signal.aborted)
        return undefined
      if (!renderer || typeof renderer !== 'object'
        || (!('render' in renderer && typeof renderer.render === 'function')
          && !('createSession' in renderer && typeof renderer.createSession === 'function'))) {
        throw new TypeError('A Viewer loader must return a renderer or session factory')
      }
      return renderer
    }).then((renderer) => {
      if (host.state !== 'active')
        return undefined
      if (renderer)
        resolved.set(type, renderer)
      return renderer
    }).finally(() => {
      if (pending.get(type) === task)
        pending.delete(type)
    })
    pending.set(type, task)
    return task
  }

  function peekRenderer(type: string): ViewerImplementation | undefined {
    if (host.state !== 'active')
      throw new Error(`Viewer does not accept work while ${host.state}`)
    return host.registry.getMaterial(type)?.value.renderer ?? resolved.get(type)
  }

  return Object.freeze({ host, getRenderer, peekRenderer, destroy: host.destroy })
}
