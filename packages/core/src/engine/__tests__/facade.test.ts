import type { Command, SchemaOperations } from '../../command'
import type { EasyInkPlugin, PluginContext, SchemaChangeEvent } from '../../plugin'
import { describe, expect, it, vi } from 'vitest'
import { MigrationRegistry } from '../../migration'
import { createDefaultSchema } from '../../schema'
import { EasyInkEngine } from '../facade'

// ─── helpers ───

function createMockPlugin(name: string, options?: {
  dependencies?: string[]
  install?: (ctx: PluginContext) => void | (() => void)
}): EasyInkPlugin {
  return {
    name,
    dependencies: options?.dependencies,
    install: options?.install ?? (() => {}),
  }
}

function createMockCommand(ops: SchemaOperations): Command {
  const element = {
    id: 'el-1',
    type: 'text',
    layout: { position: 'absolute' as const, width: 100, height: 30 },
    props: { content: 'hello' },
    style: {},
  }
  return {
    id: 'cmd-1',
    type: 'addElement',
    description: 'Add element',
    execute: () => ops.addMaterial(element, -1),
    undo: () => ops.removeMaterial(element.id),
  }
}

// ─── tests ───

describe('easyInkEngine', () => {
  describe('constructor', () => {
    it('should create with default options', () => {
      const engine = new EasyInkEngine()

      expect(engine.schema).toBeDefined()
      expect(engine.plugins).toBeDefined()
      expect(engine.commands).toBeDefined()
      expect(engine.dataSource).toBeDefined()
      expect(engine.dataResolver).toBeDefined()
      expect(engine.layout).toBeDefined()
      expect(engine.materialRegistry).toBeDefined()
      expect(engine.hooks).toBeDefined()
      expect(engine.destroyed).toBe(false)
    })

    it('should create with custom schema', () => {
      const schema = createDefaultSchema()
      schema.meta.name = 'Custom'
      const engine = new EasyInkEngine({ schema })

      expect(engine.schema.schema.meta.name).toBe('Custom')
    })

    it('should install plugins during construction', () => {
      const installFn = vi.fn()
      const plugin = createMockPlugin('test', { install: installFn })
      const engine = new EasyInkEngine({ plugins: [plugin] })

      expect(engine.plugins.has('test')).toBe(true)
      expect(installFn).toHaveBeenCalledOnce()
    })

    it('should register data sources during construction', () => {
      const engine = new EasyInkEngine({
        dataSources: [
          {
            name: 'order',
            displayName: '订单',
            fields: [{ key: 'orderNo', title: '订单号' }],
          },
        ],
      })

      expect(engine.dataSource.has('order')).toBe(true)
    })

    it('should register builtin element types', () => {
      const engine = new EasyInkEngine()

      expect(engine.materialRegistry.has('text')).toBe(true)
      expect(engine.materialRegistry.has('image')).toBe(true)
      expect(engine.materialRegistry.has('table')).toBe(true)
      expect(engine.materialRegistry.has('barcode')).toBe(true)
      expect(engine.materialRegistry.has('rect')).toBe(true)
      expect(engine.materialRegistry.has('line')).toBe(true)
    })

    it('should register builtin formatters', () => {
      const engine = new EasyInkEngine()

      expect(engine.dataResolver.hasFormatter('currency')).toBe(true)
      expect(engine.dataResolver.hasFormatter('date')).toBe(true)
      expect(engine.dataResolver.hasFormatter('number')).toBe(true)
    })
  })

  describe('setData / getData', () => {
    it('should store and retrieve data', () => {
      const engine = new EasyInkEngine()
      const data = { name: '张三', age: 30 }

      engine.setData(data)
      expect(engine.getData()).toEqual(data)
    })

    it('should apply beforeDataResolve hook', () => {
      const engine = new EasyInkEngine()
      engine.hooks.beforeDataResolve.tap('test', (data) => {
        return { ...data, extra: true }
      })

      engine.setData({ name: '张三' })
      expect(engine.getData()).toEqual({ name: '张三', extra: true })
    })

    it('should return empty object by default', () => {
      const engine = new EasyInkEngine()

      expect(engine.getData()).toEqual({})
    })
  })

  describe('calculateLayout', () => {
    it('should return layout result', () => {
      const engine = new EasyInkEngine()
      const result = engine.calculateLayout()

      expect(result).toBeDefined()
      expect(result.materials).toBeInstanceOf(Map)
      expect(typeof result.bodyContentHeight).toBe('number')
    })

    it('should compute layout for elements', () => {
      const schema = createDefaultSchema()
      schema.materials = [
        {
          id: 'el-1',
          type: 'text',
          layout: { position: 'absolute', x: 10, y: 20, width: 50, height: 30 },
          props: { content: 'hello' },
          style: {},
        },
      ]
      const engine = new EasyInkEngine({ schema })
      const result = engine.calculateLayout()

      expect(result.materials.has('el-1')).toBe(true)
      const el = result.materials.get('el-1')!
      expect(el.x).toBe(10)
      expect(el.y).toBe(20)
      expect(el.width).toBe(50)
      expect(el.height).toBe(30)
    })
  })

  describe('getSchema / loadSchema', () => {
    it('should return a deep copy of the schema', () => {
      const engine = new EasyInkEngine()
      const json = engine.getSchema()

      json.meta.name = 'Modified'
      expect(engine.schema.schema.meta.name).not.toBe('Modified')
    })

    it('should load a new schema', () => {
      const engine = new EasyInkEngine()
      const newSchema = createDefaultSchema()
      newSchema.meta.name = 'Loaded'

      engine.loadSchema(newSchema)
      expect(engine.schema.schema.meta.name).toBe('Loaded')
    })
  })

  describe('execute / undo / redo', () => {
    it('should execute a command', () => {
      const engine = new EasyInkEngine()
      const cmd = createMockCommand(engine.operations)

      engine.execute(cmd)
      expect(engine.schema.schema.materials).toHaveLength(1)
      expect(engine.schema.schema.materials[0].id).toBe('el-1')
    })

    it('should undo a command', () => {
      const engine = new EasyInkEngine()
      const cmd = createMockCommand(engine.operations)

      engine.execute(cmd)
      engine.undo()
      expect(engine.schema.schema.materials).toHaveLength(0)
    })

    it('should redo a command', () => {
      const engine = new EasyInkEngine()
      const cmd = createMockCommand(engine.operations)

      engine.execute(cmd)
      engine.undo()
      engine.redo()
      expect(engine.schema.schema.materials).toHaveLength(1)
    })

    it('should intercept command via beforeSchemaChange hook', () => {
      const engine = new EasyInkEngine()
      engine.hooks.beforeSchemaChange.tap('blocker', (_event: SchemaChangeEvent) => {
        return true // intercept
      })

      const cmd = createMockCommand(engine.operations)
      engine.execute(cmd)

      // Command should NOT have been executed
      expect(engine.schema.schema.materials).toHaveLength(0)
    })

    it('should pass through when beforeSchemaChange returns undefined', () => {
      const engine = new EasyInkEngine()
      engine.hooks.beforeSchemaChange.tap('observer', (_event: SchemaChangeEvent) => {
        return undefined
      })

      const cmd = createMockCommand(engine.operations)
      engine.execute(cmd)

      expect(engine.schema.schema.materials).toHaveLength(1)
    })

    it('should provide operations getter', () => {
      const engine = new EasyInkEngine()
      const ops = engine.operations

      expect(ops.addMaterial).toBeTypeOf('function')
      expect(ops.removeMaterial).toBeTypeOf('function')
      expect(ops.getMaterial).toBeTypeOf('function')
      expect(ops.getPageSettings).toBeTypeOf('function')
    })
  })

  describe('on / off events', () => {
    it('should subscribe to schema:change event', () => {
      const engine = new EasyInkEngine()
      const listener = vi.fn()

      engine.on('schema:change', listener)

      // Trigger schema change through schema engine
      engine.schema.addMaterial({
        id: 'el-1',
        type: 'text',
        layout: { position: 'absolute', width: 100, height: 30 },
        props: {},
        style: {},
      }, -1)

      expect(listener).toHaveBeenCalledOnce()
    })

    it('should unsubscribe via off', () => {
      const engine = new EasyInkEngine()
      const listener = vi.fn()

      engine.on('schema:change', listener)
      engine.off('schema:change', listener)

      engine.schema.addMaterial({
        id: 'el-1',
        type: 'text',
        layout: { position: 'absolute', width: 100, height: 30 },
        props: {},
        style: {},
      }, -1)

      expect(listener).not.toHaveBeenCalled()
    })

    it('should throw on unknown event name', () => {
      const engine = new EasyInkEngine()

      expect(() => engine.on('unknown:event', vi.fn())).toThrow('Unknown event')
      expect(() => engine.off('unknown:event', vi.fn())).toThrow('Unknown event')
    })
  })

  describe('installPlugin / uninstallPlugin', () => {
    it('should install a plugin after construction', () => {
      const engine = new EasyInkEngine()
      const plugin = createMockPlugin('late-plugin')

      engine.installPlugin(plugin)
      expect(engine.plugins.has('late-plugin')).toBe(true)
    })

    it('should uninstall a plugin', () => {
      const engine = new EasyInkEngine()
      const plugin = createMockPlugin('removable')

      engine.installPlugin(plugin)
      engine.uninstallPlugin('removable')
      expect(engine.plugins.has('removable')).toBe(false)
    })
  })

  describe('registerDataSource / unregisterDataSource', () => {
    it('should register a data source', () => {
      const engine = new EasyInkEngine()

      engine.registerDataSource('invoice', {
        displayName: '发票',
        fields: [{ key: 'invoiceNo', title: '发票号' }],
      })
      expect(engine.dataSource.has('invoice')).toBe(true)
    })

    it('should unregister a data source', () => {
      const engine = new EasyInkEngine()

      engine.registerDataSource('invoice', {
        displayName: '发票',
        fields: [{ key: 'invoiceNo', title: '发票号' }],
      })
      engine.unregisterDataSource('invoice')
      expect(engine.dataSource.has('invoice')).toBe(false)
    })
  })

  describe('hooks access', () => {
    it('should expose hooks for advanced usage', () => {
      const engine = new EasyInkEngine()

      expect(engine.hooks.beforeRender).toBeDefined()
      expect(engine.hooks.schemaChanged).toBeDefined()
      expect(engine.hooks.beforeSchemaChange).toBeDefined()
    })

    it('should allow plugins to tap into hooks', () => {
      const tapFn = vi.fn(node => node)
      const plugin = createMockPlugin('hook-test', {
        install: (ctx) => {
          ctx.hooks.beforeMaterialCreate.tap('hook-test', tapFn)
        },
      })
      const engine = new EasyInkEngine({ plugins: [plugin] })

      engine.schema.addMaterial({
        id: 'el-1',
        type: 'text',
        layout: { position: 'absolute', width: 100, height: 30 },
        props: {},
        style: {},
      }, -1)

      expect(tapFn).toHaveBeenCalledOnce()
    })
  })

  describe('destroy', () => {
    it('should mark engine as destroyed', () => {
      const engine = new EasyInkEngine()

      engine.destroy()
      expect(engine.destroyed).toBe(true)
    })

    it('should be idempotent', () => {
      const engine = new EasyInkEngine()

      engine.destroy()
      engine.destroy()
      expect(engine.destroyed).toBe(true)
    })

    it('should clear all subsystems', () => {
      const dispose = vi.fn()
      const plugin = createMockPlugin('to-clear', { install: () => dispose })
      const engine = new EasyInkEngine({ plugins: [plugin] })

      engine.registerDataSource('test', {
        displayName: '测试',
        fields: [{ key: 'x', title: 'X' }],
      })
      engine.setData({ name: '张三' })

      engine.destroy()

      expect(dispose).toHaveBeenCalledOnce()
      expect(engine.plugins.list()).toEqual([])
      expect(engine.materialRegistry.types()).toEqual([])
      expect(engine.getData()).toEqual({})
    })

    it('should throw on setData after destroy', () => {
      const engine = new EasyInkEngine()
      engine.destroy()

      expect(() => engine.setData({})).toThrow('destroyed')
    })

    it('should throw on calculateLayout after destroy', () => {
      const engine = new EasyInkEngine()
      engine.destroy()

      expect(() => engine.calculateLayout()).toThrow('destroyed')
    })

    it('should throw on execute after destroy', () => {
      const engine = new EasyInkEngine()
      const ops = engine.operations
      engine.destroy()

      expect(() => engine.execute(createMockCommand(ops))).toThrow('destroyed')
    })

    it('should throw on undo after destroy', () => {
      const engine = new EasyInkEngine()
      engine.destroy()

      expect(() => engine.undo()).toThrow('destroyed')
    })

    it('should throw on redo after destroy', () => {
      const engine = new EasyInkEngine()
      engine.destroy()

      expect(() => engine.redo()).toThrow('destroyed')
    })

    it('should throw on installPlugin after destroy', () => {
      const engine = new EasyInkEngine()
      engine.destroy()

      expect(() => engine.installPlugin(createMockPlugin('x'))).toThrow('destroyed')
    })

    it('should throw on uninstallPlugin after destroy', () => {
      const engine = new EasyInkEngine()
      engine.destroy()

      expect(() => engine.uninstallPlugin('x')).toThrow('destroyed')
    })

    it('should throw on registerDataSource after destroy', () => {
      const engine = new EasyInkEngine()
      engine.destroy()

      expect(() => engine.registerDataSource('x', {
        displayName: 'X',
        fields: [],
      })).toThrow('destroyed')
    })

    it('should throw on on() after destroy', () => {
      const engine = new EasyInkEngine()
      engine.destroy()

      expect(() => engine.on('schema:change', vi.fn())).toThrow('destroyed')
    })

    it('should throw on loadSchema after destroy', () => {
      const engine = new EasyInkEngine()
      engine.destroy()

      expect(() => engine.loadSchema(createDefaultSchema())).toThrow('destroyed')
    })

    it('should clear font cache on destroy', async () => {
      const engine = new EasyInkEngine({
        fontProvider: {
          listFonts: async () => [],
          loadFont: async () => 'url',
        },
      })
      await engine.font.loadFont('Test')
      expect(engine.font.isLoaded('Test')).toBe(true)

      engine.destroy()

      expect(engine.font.isLoaded('Test')).toBe(false)
    })
  })

  describe('font', () => {
    it('should create FontManager without provider', () => {
      const engine = new EasyInkEngine()
      expect(engine.font).toBeDefined()
      expect(engine.font.provider).toBeUndefined()
    })

    it('should create FontManager with provider', () => {
      const provider = {
        listFonts: async () => [],
        loadFont: async () => 'url' as const,
      }
      const engine = new EasyInkEngine({ fontProvider: provider })
      expect(engine.font.provider).toBe(provider)
    })

    it('should load font via FontManager', async () => {
      const engine = new EasyInkEngine({
        fontProvider: {
          listFonts: async () => [
            { family: 'TestFont', displayName: '测试', weights: ['400'], styles: ['normal'] },
          ],
          loadFont: async () => 'https://cdn.example.com/test.woff2',
        },
      })
      const fonts = await engine.font.listFonts()
      expect(fonts).toHaveLength(1)
      expect(fonts[0].family).toBe('TestFont')
    })
  })

  describe('migration', () => {
    it('should be undefined when no migrationRegistry provided', () => {
      const engine = new EasyInkEngine()
      expect(engine.migration).toBeUndefined()
    })

    it('should expose migrationRegistry when provided', () => {
      const registry = new MigrationRegistry()
      const engine = new EasyInkEngine({ migrationRegistry: registry })
      expect(engine.migration).toBe(registry)
    })
  })
})
