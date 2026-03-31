import type { EasyInkPlugin, PluginContext } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { createPluginHooks, PluginManager } from '../manager'

function createTestPlugin(name: string, options?: {
  dependencies?: string[]
  install?: (ctx: PluginContext) => void | (() => void)
}): EasyInkPlugin {
  return {
    name,
    dependencies: options?.dependencies,
    install: options?.install ?? (() => {}),
  }
}

describe('pluginManager', () => {
  it('should install a plugin', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const plugin = createTestPlugin('test')

    manager.install(plugin)
    expect(manager.has('test')).toBe(true)
    expect(manager.list()).toEqual(['test'])
  })

  it('should call plugin install with context', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const installFn = vi.fn()
    const plugin = createTestPlugin('test', { install: installFn })

    manager.install(plugin)
    expect(installFn).toHaveBeenCalledOnce()
    expect(installFn).toHaveBeenCalledWith(
      expect.objectContaining({ hooks }),
    )
  })

  it('should throw on duplicate install', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const plugin = createTestPlugin('test')

    manager.install(plugin)
    expect(() => manager.install(plugin)).toThrow('already installed')
  })

  it('should check dependencies before install', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const plugin = createTestPlugin('child', { dependencies: ['parent'] })

    expect(() => manager.install(plugin)).toThrow('missing dependencies: parent')
  })

  it('should install when dependencies are satisfied', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const parent = createTestPlugin('parent')
    const child = createTestPlugin('child', { dependencies: ['parent'] })

    manager.install(parent)
    manager.install(child)
    expect(manager.has('child')).toBe(true)
  })

  it('should uninstall a plugin', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const plugin = createTestPlugin('test')

    manager.install(plugin)
    manager.uninstall('test')
    expect(manager.has('test')).toBe(false)
  })

  it('should call dispose on uninstall', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const dispose = vi.fn()
    const plugin = createTestPlugin('test', { install: () => dispose })

    manager.install(plugin)
    manager.uninstall('test')
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('should throw when uninstalling a non-existent plugin', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)

    expect(() => manager.uninstall('nope')).toThrow('not installed')
  })

  it('should prevent uninstalling a plugin depended on by others', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const parent = createTestPlugin('parent')
    const child = createTestPlugin('child', { dependencies: ['parent'] })

    manager.install(parent)
    manager.install(child)
    expect(() => manager.uninstall('parent')).toThrow('depended on by child')
  })

  it('should allow uninstall after dependent is removed', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const parent = createTestPlugin('parent')
    const child = createTestPlugin('child', { dependencies: ['parent'] })

    manager.install(parent)
    manager.install(child)
    manager.uninstall('child')
    manager.uninstall('parent')
    expect(manager.list()).toEqual([])
  })

  it('installAll should install in order', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const order: string[] = []
    const a = createTestPlugin('a', {
      install: () => {
        order.push('a')
      },
    })
    const b = createTestPlugin('b', {
      dependencies: ['a'],
      install: () => {
        order.push('b')
      },
    })

    manager.installAll([a, b])
    expect(order).toEqual(['a', 'b'])
    expect(manager.list()).toEqual(['a', 'b'])
  })

  it('clear should dispose all plugins in reverse order', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const order: string[] = []
    const a = createTestPlugin('a', { install: () => () => order.push('dispose-a') })
    const b = createTestPlugin('b', { install: () => () => order.push('dispose-b') })

    manager.installAll([a, b])
    manager.clear()
    expect(order).toEqual(['dispose-b', 'dispose-a'])
    expect(manager.list()).toEqual([])
  })

  it('plugin should be able to tap hooks', () => {
    const hooks = createPluginHooks()
    const manager = new PluginManager(hooks)
    const plugin = createTestPlugin('modifier', {
      install: (ctx) => {
        ctx.hooks.beforeMaterialCreate.tap('modifier', (node) => {
          return { ...node, name: `[modified] ${node.name}` }
        })
      },
    })

    manager.install(plugin)

    const result = hooks.beforeMaterialCreate.call({
      id: '1',
      type: 'text',
      name: 'test',
      layout: { position: 'absolute', width: 100, height: 50 },
      props: {},
      style: {},
    })
    expect(result.name).toBe('[modified] test')
  })
})

describe('createPluginHooks', () => {
  it('should create a fresh hooks instance', () => {
    const hooks = createPluginHooks()
    expect(hooks.beforeRender).toBeDefined()
    expect(hooks.afterRender).toBeDefined()
    expect(hooks.beforeExport).toBeDefined()
    expect(hooks.beforeMaterialCreate).toBeDefined()
    expect(hooks.beforeDataResolve).toBeDefined()
    expect(hooks.beforeSchemaChange).toBeDefined()
    expect(hooks.schemaChanged).toBeDefined()
    expect(hooks.selectionChanged).toBeDefined()
    expect(hooks.exportCompleted).toBeDefined()
    expect(hooks.designerReady).toBeDefined()
  })

  it('should create independent instances', () => {
    const hooks1 = createPluginHooks()
    const hooks2 = createPluginHooks()
    hooks1.beforeMaterialCreate.tap('test', node => node)
    // hooks2 should be unaffected
    const result = hooks2.beforeMaterialCreate.call({
      id: '1',
      type: 'text',
      layout: { position: 'absolute', width: 100, height: 50 },
      props: {},
      style: {},
    })
    expect(result.id).toBe('1')
  })
})
