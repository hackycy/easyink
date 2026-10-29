import type { ViewerMaterial } from '@easyink/plugin-api/viewer'
import { describe, expect, it, vi } from 'vitest'
import { AssemblyError, createHost, HostCreationError } from './index'
import { Staging } from './staging'
import { designerMaterial, model, viewerMaterial } from './test-fixtures/material'

describe('complete Host assembly', () => {
  it('waits for required initialization after every declaration is visible', async () => {
    const initialized = Promise.withResolvers<void>()
    let ready = false
    const creation = createHost({ kind: 'viewer', materials: [viewerMaterial('a'), viewerMaterial('b')] }, async (registry, context) => {
      expect(registry.materials.map(entry => entry.key)).toEqual(['a', 'b'])
      expect(context.signal.aborted).toBe(false)
      await initialized.promise
    }).then((host) => {
      ready = true
      return host
    })
    await Promise.resolve()
    expect(ready).toBe(false)
    initialized.resolve()
    const host = await creation
    expect(host.state).toBe('active')
    expect(Object.isFrozen(host.registry.materials)).toBe(true)
    expect(Object.isFrozen(host.registry.getMaterial('a')!.owner)).toBe(true)
    await host.destroy()
  })

  it('supports empty selections and never loads lazy renderers during creation', async () => {
    const loadRenderer = vi.fn(async () => viewerMaterial('lazy').renderer!)
    const host = await createHost({ kind: 'viewer', materials: [{ model: model('lazy'), loadRenderer }] })
    expect(loadRenderer).not.toHaveBeenCalled()
    await host.destroy()
    const none = await createHost({ kind: 'viewer', materials: [] })
    expect(none.registry.materials).toEqual([])
    await none.destroy()
  })

  it('accepts all existing core binding kinds without redefining their semantics', async () => {
    const base = viewerMaterial('text')
    const host = await createHost({ kind: 'viewer', materials: [{ ...base, model: { ...base.model, binding: { kind: 'ordinary', primaryProp: 'content', formatEditor: false } } }] })
    expect(host.registry.getMaterial('text')!.value.model.binding.kind).toBe('ordinary')
    await host.destroy()
  })

  it('rejects duplicate material and extension identities, including repeated objects', async () => {
    const material = viewerMaterial('repeat')
    await expect(createHost({ kind: 'viewer', materials: [material, material] })).rejects.toMatchObject({ cause: { code: 'duplicate-identity', key: 'material:repeat', owners: [{ pluginId: 'material:repeat' }, { pluginId: 'material:repeat' }] } })
    await expect(createHost({ kind: 'designer', materials: [], extensions: [{ id: 'same' }, { id: 'same' }] })).rejects.toMatchObject({ cause: { code: 'duplicate-identity' } })
  })

  it('rejects incomplete or wrong-host implementations before consumers start', async () => {
    const initialize = vi.fn()
    // Deliberate JavaScript configuration faults bypass the compile-time guard.
    const invalid = [
      { model: model('missing') },
      { model: model('both'), renderer: viewerMaterial('both').renderer, loadRenderer: async () => viewerMaterial('both').renderer },
      { model: model('wrong-host'), renderer: designerMaterial('wrong-host').renderer },
      { model: model('bad-loader'), loadRenderer: true },
    ] as unknown as ViewerMaterial[]
    for (const material of invalid)
      await expect(createHost({ kind: 'viewer', materials: [material] }, initialize)).rejects.toMatchObject({ cause: { code: 'invalid-material' } })
    expect(initialize).not.toHaveBeenCalled()
  })

  it('does not reinterpret missing optional UI, properties or locale as fatal', async () => {
    const host = await createHost({ kind: 'designer', materials: [designerMaterial('minimal')] })
    expect(host.registry.getMaterial('minimal')).toBeDefined()
    await host.destroy()
  })

  it('rejects competing command keys with both owners and never initializes consumers', async () => {
    const initialize = vi.fn()
    const command = { id: 'run', handler: () => {} }
    await expect(createHost({ kind: 'designer', materials: [], extensions: [{ id: 'first', commands: [command] }, { id: 'second', commands: [command] }] }, initialize)).rejects.toMatchObject({
      cause: { code: 'duplicate-contribution', point: 'designer.command', key: 'run', owners: [{ pluginId: 'first' }, { pluginId: 'second' }] },
    })
    expect(initialize).not.toHaveBeenCalled()
  })

  it('preserves the first declaration fault when a later declaration also conflicts', async () => {
    const incomplete = { model: model('missing') } as ViewerMaterial
    const repeated = viewerMaterial('repeat')
    await expect(createHost({ kind: 'viewer', materials: [incomplete, repeated, repeated] })).rejects.toMatchObject({ cause: { code: 'invalid-material', key: 'missing' } })
  })

  it('keeps different list owners and input order while rejecting local duplicates', async () => {
    const item = { id: 'button' }
    const host = await createHost({ kind: 'designer', materials: [], extensions: [{ id: 'a', ui: { toolbar: [item] } }, { id: 'b', ui: { toolbar: [item] } }] })
    expect(host.registry.contributions('designer.toolbar').map(entry => entry.owner.pluginId)).toEqual(['a', 'b'])
    await host.destroy()
    await expect(createHost({ kind: 'designer', materials: [], extensions: [{ id: 'a', ui: { toolbar: [item, item] } }] })).rejects.toMatchObject({ cause: { code: 'duplicate-contribution' } })
  })

  it('cleans acquired core resources before rejecting creation and preserves the first cause', async () => {
    const cause = new Error('initialization')
    const cleanupError = new Error('cleanup')
    const cleaned: string[] = []
    const failure = await createHost({ kind: 'viewer', materials: [viewerMaterial('a'), viewerMaterial('b')] }, (registry, context) => {
      for (const material of registry.materials)
        context.resources(material.owner).onDispose(() => { cleaned.push(material.key) })
      context.onDispose(async () => {
        await Promise.resolve()
        cleaned.push('first')
      })
      context.onDispose(() => {
        cleaned.push('second')
        throw cleanupError
      })
      throw cause
    }).catch(error => error)
    expect(failure).toBeInstanceOf(HostCreationError)
    expect(failure.cause).toBe(cause)
    expect(cleaned).toEqual(['second', 'first', 'b', 'a'])
    expect(failure.cleanup.errors).toMatchObject([{ owner: { pluginId: 'host', contributionId: 'consumer' }, phase: 'consumer', cause: cleanupError }])
  })
})

describe('private owned staging transaction', () => {
  it('cannot be revived by catching a core registration exception inside setup', async () => {
    const staging = new Staging([])
    const scope = staging.open('plugin')
    const clean = vi.fn()
    staging.collect(scope, () => {
      scope.context.onDispose(clean)
      staging.add(scope, 'designer.command', 'key', 'first', {})
      try {
        staging.add(scope, 'designer.command', 'key', 'second', {})
      }
      catch {}
    })
    expect(() => staging.seal()).toThrow(AssemblyError)
    await scope.destroy()
    expect(clean).toHaveBeenCalledOnce()
  })

  it('rejects local contribution ids reused at another point and registration after seal', () => {
    const staging = new Staging([])
    const scope = staging.open('plugin')
    staging.add(scope, 'designer.toolbar', 'one', 'same', {}, true)
    expect(() => staging.add(scope, 'designer.overlay', 'two', 'same', {}, true)).toThrow(AssemblyError)
    expect(() => staging.seal()).toThrow(AssemblyError)
    const sealed = new Staging([])
    const installed = sealed.open('installed')
    sealed.seal()
    expect(() => sealed.add(installed, 'designer.command', 'later', 'later', {})).toThrow(/closed/i)
  })

  it('rejects throwing and asynchronous setup while releasing its managed resources', async () => {
    for (const asynchronous of [false, true]) {
      const staging = new Staging([])
      const scope = staging.open('plugin')
      const clean = vi.fn()
      const cause = new Error('setup')
      staging.collect(scope, () => {
        scope.context.onDispose(clean)
        if (asynchronous)
          return Promise.reject(cause)
        throw cause
      })
      expect(() => staging.seal()).toThrow(asynchronous ? /Async setup/ : cause)
      await scope.destroy()
      expect(clean).toHaveBeenCalledOnce()
    }
  })
})
