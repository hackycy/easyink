import type { BackgroundLayer } from '@easyink/shared'
import type { PluginHooks } from '../../plugin'
import type { ElementNode, TemplateSchema } from '../types'
import { describe, expect, it, vi } from 'vitest'
import { ElementRegistry } from '../../elements'
import { MigrationRegistry } from '../../migration'
import { createPluginHooks } from '../../plugin/manager'
import { createDefaultSchema, SCHEMA_VERSION } from '../defaults'
import { SchemaEngine } from '../engine'

// ── 辅助函数 ──

function createElement(overrides?: Partial<ElementNode>): ElementNode {
  return {
    id: `el-${Math.random().toString(36).slice(2, 8)}`,
    type: 'text',
    layout: { position: 'absolute', width: 100, height: 30 },
    props: { content: 'hello' },
    style: {},
    ...overrides,
  }
}

function createEngineWithElements(
  elements: ElementNode[],
  options?: { hooks?: PluginHooks, elementRegistry?: ElementRegistry },
): SchemaEngine {
  const schema = createDefaultSchema()
  schema.elements = elements
  return new SchemaEngine({ schema, ...options })
}

describe('schemaEngine', () => {
  describe('constructor', () => {
    it('should create with default schema when no options', () => {
      const engine = new SchemaEngine()

      expect(engine.schema.version).toBe(SCHEMA_VERSION)
      expect(engine.schema.elements).toEqual([])
    })

    it('should use provided schema', () => {
      const schema = createDefaultSchema()
      schema.meta.name = '自定义模板'

      const engine = new SchemaEngine({ schema })

      expect(engine.schema.meta.name).toBe('自定义模板')
    })

    it('should accept hooks option', () => {
      const hooks = createPluginHooks()
      const engine = new SchemaEngine({ hooks })

      expect(engine.schema).toBeDefined()
    })

    it('should accept elementRegistry option', () => {
      const registry = new ElementRegistry()
      const engine = new SchemaEngine({ elementRegistry: registry })

      expect(engine.schema).toBeDefined()
    })
  })

  describe('getElement', () => {
    it('should find element by id in top level', () => {
      const el = createElement({ id: 'e1' })
      const engine = createEngineWithElements([el])

      expect(engine.getElement('e1')).toBe(el)
    })

    it('should return undefined for non-existing id', () => {
      const engine = createEngineWithElements([])

      expect(engine.getElement('missing')).toBeUndefined()
    })

    it('should not search in children', () => {
      const child = createElement({ id: 'child-1' })
      const parent = createElement({
        id: 'parent',
        type: 'table',
        children: [child],
      })
      const engine = createEngineWithElements([parent])

      expect(engine.getElement('child-1')).toBeUndefined()
    })
  })

  describe('getElementById', () => {
    it('should find top-level element', () => {
      const el = createElement({ id: 'e1' })
      const engine = createEngineWithElements([el])

      expect(engine.getElementById('e1')).toBe(el)
    })

    it('should find nested element in children', () => {
      const child = createElement({ id: 'child-1' })
      const parent = createElement({
        id: 'parent',
        type: 'table',
        children: [child],
      })
      const engine = createEngineWithElements([parent])

      expect(engine.getElementById('child-1')).toBe(child)
    })

    it('should return undefined for non-existing id', () => {
      const engine = createEngineWithElements([])

      expect(engine.getElementById('missing')).toBeUndefined()
    })
  })

  describe('addElement', () => {
    it('should append element when index is -1', () => {
      const engine = createEngineWithElements([createElement({ id: 'e1' })])
      const newEl = createElement({ id: 'e2' })

      engine.addElement(newEl, -1)

      expect(engine.schema.elements).toHaveLength(2)
      expect(engine.schema.elements[1].id).toBe('e2')
    })

    it('should insert element at specified index', () => {
      const engine = createEngineWithElements([
        createElement({ id: 'e1' }),
        createElement({ id: 'e3' }),
      ])
      const newEl = createElement({ id: 'e2' })

      engine.addElement(newEl, 1)

      expect(engine.schema.elements).toHaveLength(3)
      expect(engine.schema.elements[1].id).toBe('e2')
    })

    it('should append when index exceeds array length', () => {
      const engine = createEngineWithElements([])
      const el = createElement({ id: 'e1' })

      engine.addElement(el, 100)

      expect(engine.schema.elements).toHaveLength(1)
      expect(engine.schema.elements[0].id).toBe('e1')
    })

    it('should trigger beforeElementCreate hook', () => {
      const hooks = createPluginHooks()
      hooks.beforeElementCreate.tap('test', (element) => {
        return { ...element, name: 'modified' }
      })
      const engine = new SchemaEngine({ hooks })

      const el = createElement({ id: 'e1' })
      engine.addElement(el, -1)

      expect(engine.schema.elements[0].name).toBe('modified')
    })

    it('should trigger schemaChanged event', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const engine = new SchemaEngine({ hooks })

      engine.addElement(createElement({ id: 'e1' }), -1)

      expect(callback).toHaveBeenCalledOnce()
      expect(callback).toHaveBeenCalledWith(engine.schema)
    })
  })

  describe('removeElement', () => {
    it('should remove existing element and return it', () => {
      const el = createElement({ id: 'e1' })
      const engine = createEngineWithElements([el])

      const removed = engine.removeElement('e1')

      expect(removed).toBe(el)
      expect(engine.schema.elements).toHaveLength(0)
    })

    it('should return undefined for non-existing element', () => {
      const engine = createEngineWithElements([])

      const removed = engine.removeElement('missing')

      expect(removed).toBeUndefined()
    })

    it('should trigger schemaChanged event', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const el = createElement({ id: 'e1' })
      const engine = createEngineWithElements([el], { hooks })

      engine.removeElement('e1')

      expect(callback).toHaveBeenCalledOnce()
    })
  })

  describe('reorderElement', () => {
    it('should move element to new position', () => {
      const engine = createEngineWithElements([
        createElement({ id: 'a' }),
        createElement({ id: 'b' }),
        createElement({ id: 'c' }),
      ])

      engine.reorderElement('a', 2)

      expect(engine.schema.elements.map(e => e.id)).toEqual([
        'b',
        'c',
        'a',
      ])
    })

    it('should do nothing for non-existing element', () => {
      const engine = createEngineWithElements([
        createElement({ id: 'a' }),
      ])

      engine.reorderElement('missing', 0)

      expect(engine.schema.elements).toHaveLength(1)
    })

    it('should trigger schemaChanged event', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const engine = createEngineWithElements(
        [
          createElement({ id: 'a' }),
          createElement({ id: 'b' }),
        ],
        { hooks },
      )

      engine.reorderElement('a', 1)

      expect(callback).toHaveBeenCalledOnce()
    })
  })

  describe('updateElementLayout', () => {
    it('should merge partial layout', () => {
      const el = createElement({ id: 'e1', layout: { position: 'absolute', width: 100, height: 50, x: 0, y: 0 } })
      const engine = createEngineWithElements([el])

      engine.updateElementLayout('e1', { x: 10, y: 20 })

      expect(el.layout.x).toBe(10)
      expect(el.layout.y).toBe(20)
      expect(el.layout.width).toBe(100)
    })

    it('should do nothing for non-existing element', () => {
      const engine = createEngineWithElements([])

      engine.updateElementLayout('missing', { x: 10 })
      // no throw
    })

    it('should find element in children', () => {
      const child = createElement({ id: 'child', layout: { position: 'absolute', width: 50, height: 20 } })
      const parent = createElement({ id: 'parent', children: [child] })
      const engine = createEngineWithElements([parent])

      engine.updateElementLayout('child', { width: 200 })

      expect(child.layout.width).toBe(200)
    })
  })

  describe('updateElementProps', () => {
    it('should merge props', () => {
      const el = createElement({ id: 'e1', props: { content: 'old', size: 12 } })
      const engine = createEngineWithElements([el])

      engine.updateElementProps('e1', { content: 'new' })

      expect(el.props.content).toBe('new')
      expect(el.props.size).toBe(12)
    })

    it('should do nothing for non-existing element', () => {
      const engine = createEngineWithElements([])

      engine.updateElementProps('missing', { content: 'x' })
    })
  })

  describe('updateElementStyle', () => {
    it('should merge partial style', () => {
      const el = createElement({ id: 'e1', style: { color: 'red', fontSize: 14 } })
      const engine = createEngineWithElements([el])

      engine.updateElementStyle('e1', { color: 'blue' })

      expect(el.style.color).toBe('blue')
      expect(el.style.fontSize).toBe(14)
    })

    it('should do nothing for non-existing element', () => {
      const engine = createEngineWithElements([])

      engine.updateElementStyle('missing', { color: 'red' })
    })
  })

  describe('updateElementBinding', () => {
    it('should set binding', () => {
      const el = createElement({ id: 'e1' })
      const engine = createEngineWithElements([el])

      engine.updateElementBinding('e1', { path: 'name' })

      expect(el.binding).toEqual({ path: 'name' })
    })

    it('should clear binding with undefined', () => {
      const el = createElement({ id: 'e1', binding: { path: 'name' } })
      const engine = createEngineWithElements([el])

      engine.updateElementBinding('e1', undefined)

      expect(el.binding).toBeUndefined()
    })

    it('should do nothing for non-existing element', () => {
      const engine = createEngineWithElements([])

      engine.updateElementBinding('missing', { path: 'x' })
    })
  })

  describe('getPageSettings / updatePageSettings', () => {
    it('should return current page settings', () => {
      const engine = new SchemaEngine()

      const settings = engine.getPageSettings()

      expect(settings.paper).toBe('A4')
      expect(settings.orientation).toBe('portrait')
    })

    it('should replace page settings', () => {
      const engine = new SchemaEngine()
      const newSettings = {
        ...engine.getPageSettings(),
        orientation: 'landscape' as const,
      }

      engine.updatePageSettings(newSettings)

      expect(engine.schema.page.orientation).toBe('landscape')
    })

    it('should trigger schemaChanged event', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const engine = new SchemaEngine({ hooks })

      engine.updatePageSettings({
        ...engine.getPageSettings(),
        orientation: 'landscape',
      })

      expect(callback).toHaveBeenCalledOnce()
    })
  })

  describe('traverse', () => {
    it('should visit all top-level elements', () => {
      const engine = createEngineWithElements([
        createElement({ id: 'a' }),
        createElement({ id: 'b' }),
        createElement({ id: 'c' }),
      ])
      const visited: string[] = []

      engine.traverse((node) => {
        visited.push(node.id)
      })

      expect(visited).toEqual([
        'a',
        'b',
        'c',
      ])
    })

    it('should visit children recursively', () => {
      const child1 = createElement({ id: 'c1' })
      const child2 = createElement({ id: 'c2' })
      const parent = createElement({ id: 'p', children: [child1, child2] })
      const engine = createEngineWithElements([parent])
      const visited: string[] = []

      engine.traverse((node) => {
        visited.push(node.id)
      })

      expect(visited).toEqual([
        'p',
        'c1',
        'c2',
      ])
    })

    it('should pass parent to callback', () => {
      const child = createElement({ id: 'child' })
      const parent = createElement({ id: 'parent', children: [child] })
      const engine = createEngineWithElements([parent])
      const parents: Array<string | undefined> = []

      engine.traverse((_node, p) => {
        parents.push(p?.id)
      })

      expect(parents).toEqual([undefined, 'parent'])
    })

    it('should stop when callback returns false', () => {
      const engine = createEngineWithElements([
        createElement({ id: 'a' }),
        createElement({ id: 'b' }),
        createElement({ id: 'c' }),
      ])
      const visited: string[] = []

      engine.traverse((node) => {
        visited.push(node.id)
        if (node.id === 'b')
          return false
      })

      expect(visited).toEqual(['a', 'b'])
    })

    it('should stop traversal in nested children', () => {
      const child1 = createElement({ id: 'c1' })
      const child2 = createElement({ id: 'c2' })
      const parent = createElement({ id: 'p', children: [child1, child2] })
      const sibling = createElement({ id: 's' })
      const engine = createEngineWithElements([parent, sibling])
      const visited: string[] = []

      engine.traverse((node) => {
        visited.push(node.id)
        if (node.id === 'c1')
          return false
      })

      expect(visited).toEqual(['p', 'c1'])
    })
  })

  describe('find', () => {
    it('should find matching element', () => {
      const target = createElement({ id: 'target', type: 'image' })
      const engine = createEngineWithElements([
        createElement({ id: 'other' }),
        target,
      ])

      const found = engine.find(n => n.type === 'image')

      expect(found).toBe(target)
    })

    it('should return undefined when not found', () => {
      const engine = createEngineWithElements([createElement({ id: 'a' })])

      const found = engine.find(n => n.type === 'nonexistent')

      expect(found).toBeUndefined()
    })

    it('should find element in children', () => {
      const child = createElement({ id: 'child', type: 'image' })
      const parent = createElement({ id: 'parent', children: [child] })
      const engine = createEngineWithElements([parent])

      const found = engine.find(n => n.type === 'image')

      expect(found).toBe(child)
    })
  })

  describe('findByType', () => {
    it('should find all elements of given type', () => {
      const engine = createEngineWithElements([
        createElement({ id: 'a', type: 'text' }),
        createElement({ id: 'b', type: 'image' }),
        createElement({ id: 'c', type: 'text' }),
      ])

      const result = engine.findByType('text')

      expect(result).toHaveLength(2)
      expect(result.map(e => e.id)).toEqual(['a', 'c'])
    })

    it('should return empty array when no match', () => {
      const engine = createEngineWithElements([])

      expect(engine.findByType('text')).toEqual([])
    })

    it('should include children matches', () => {
      const child = createElement({ id: 'child', type: 'text' })
      const parent = createElement({ id: 'parent', type: 'table', children: [child] })
      const engine = createEngineWithElements([parent])

      const result = engine.findByType('text')

      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('child')
    })
  })

  describe('validate', () => {
    it('should return valid for empty default schema', () => {
      const engine = new SchemaEngine()

      const result = engine.validate()

      expect(result.valid).toBe(true)
      expect(result.issues).toEqual([])
    })

    it('should report error for missing version', () => {
      const schema = createDefaultSchema()
      schema.version = ''
      const engine = new SchemaEngine({ schema })

      const result = engine.validate()

      expect(result.valid).toBe(false)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].level).toBe('error')
      expect(result.issues[0].message).toContain('version')
    })

    it('should report error for duplicate element ids', () => {
      const engine = createEngineWithElements([
        createElement({ id: 'dup' }),
        createElement({ id: 'dup' }),
      ])

      const result = engine.validate()

      expect(result.valid).toBe(false)
      expect(result.issues.some(i =>
        i.level === 'error' && i.message.includes('Duplicate'),
      )).toBe(true)
    })

    it('should report error for missing element id', () => {
      const engine = createEngineWithElements([
        createElement({ id: '' }),
      ])

      const result = engine.validate()

      expect(result.valid).toBe(false)
      expect(result.issues.some(i =>
        i.level === 'error' && i.message.includes('missing id'),
      )).toBe(true)
    })

    it('should report error for missing element type', () => {
      const engine = createEngineWithElements([
        createElement({ id: 'e1', type: '' }),
      ])

      const result = engine.validate()

      expect(result.valid).toBe(false)
      expect(result.issues.some(i =>
        i.level === 'error' && i.message.includes('missing type'),
      )).toBe(true)
    })

    it('should report error for missing layout', () => {
      const el = createElement({ id: 'e1' })
      ;(el as any).layout = undefined
      const engine = createEngineWithElements([el])

      const result = engine.validate()

      expect(result.valid).toBe(false)
      expect(result.issues.some(i =>
        i.level === 'error' && i.message.includes('missing layout'),
      )).toBe(true)
    })

    it('should report warning for unregistered type when registry provided', () => {
      const registry = new ElementRegistry()
      const engine = createEngineWithElements(
        [createElement({ id: 'e1', type: 'custom-type' })],
        { elementRegistry: registry },
      )

      const result = engine.validate()

      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(1)
      expect(result.issues[0].level).toBe('warning')
      expect(result.issues[0].message).toContain('not registered')
    })

    it('should not check type registration when no registry', () => {
      const engine = createEngineWithElements([
        createElement({ id: 'e1', type: 'custom-type' }),
      ])

      const result = engine.validate()

      expect(result.valid).toBe(true)
      expect(result.issues).toEqual([])
    })

    it('should validate elements in children', () => {
      const child = createElement({ id: 'dup' })
      const parent = createElement({ id: 'dup', children: [child] })
      const engine = createEngineWithElements([parent])

      const result = engine.validate()

      expect(result.valid).toBe(false)
      expect(result.issues.some(i => i.message.includes('Duplicate'))).toBe(true)
    })
  })

  describe('toJSON', () => {
    it('should return deep copy of schema', () => {
      const engine = createEngineWithElements([createElement({ id: 'e1' })])

      const json = engine.toJSON()

      expect(json).toEqual(engine.schema)
      expect(json).not.toBe(engine.schema)
      expect(json.elements[0]).not.toBe(engine.schema.elements[0])
    })

    it('should not affect internal state when modifying output', () => {
      const engine = createEngineWithElements([createElement({ id: 'e1' })])

      const json = engine.toJSON()
      json.elements.push(createElement({ id: 'e2' }))

      expect(engine.schema.elements).toHaveLength(1)
    })
  })

  describe('loadSchema', () => {
    it('should replace current schema', () => {
      const engine = new SchemaEngine()
      const newSchema: TemplateSchema = {
        ...createDefaultSchema(),
        meta: { name: '新模板' },
      }

      engine.loadSchema(newSchema)

      expect(engine.schema.meta.name).toBe('新模板')
    })

    it('should throw for version newer than supported', () => {
      const engine = new SchemaEngine()
      const newSchema = createDefaultSchema()
      newSchema.version = '99.0.0'

      expect(() => engine.loadSchema(newSchema)).toThrow('newer than')
    })

    it('should accept schema with same version', () => {
      const engine = new SchemaEngine()
      const newSchema = createDefaultSchema()
      newSchema.version = SCHEMA_VERSION

      engine.loadSchema(newSchema)

      expect(engine.schema.version).toBe(SCHEMA_VERSION)
    })

    it('should accept schema with older version', () => {
      const engine = new SchemaEngine()
      const newSchema = createDefaultSchema()
      newSchema.version = '0.0.1'

      engine.loadSchema(newSchema)

      expect(engine.schema.version).toBe('0.0.1')
    })

    it('should trigger schemaChanged event', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const engine = new SchemaEngine({ hooks })

      engine.loadSchema(createDefaultSchema())

      expect(callback).toHaveBeenCalledOnce()
    })

    it('should accept migrationRegistry option', () => {
      const migrationRegistry = new MigrationRegistry()
      const engine = new SchemaEngine({ migrationRegistry })
      expect(engine.schema.version).toBe(SCHEMA_VERSION)
    })
  })

  describe('updateElementVisibility', () => {
    it('should set element hidden', () => {
      const el = createElement({ id: 'e1' })
      const engine = createEngineWithElements([el])

      engine.updateElementVisibility('e1', true)

      expect(el.hidden).toBe(true)
    })

    it('should unset element hidden', () => {
      const el = createElement({ id: 'e1', hidden: true })
      const engine = createEngineWithElements([el])

      engine.updateElementVisibility('e1', false)

      expect(el.hidden).toBe(false)
    })

    it('should trigger schemaChanged', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const el = createElement({ id: 'e1' })
      const engine = createEngineWithElements([el], { hooks })

      engine.updateElementVisibility('e1', true)

      expect(callback).toHaveBeenCalledOnce()
    })
  })

  describe('updateElementLock', () => {
    it('should set element locked', () => {
      const el = createElement({ id: 'e1' })
      const engine = createEngineWithElements([el])

      engine.updateElementLock('e1', true)

      expect(el.locked).toBe(true)
    })

    it('should unset element locked', () => {
      const el = createElement({ id: 'e1', locked: true })
      const engine = createEngineWithElements([el])

      engine.updateElementLock('e1', false)

      expect(el.locked).toBe(false)
    })
  })

  describe('updateExtensions', () => {
    it('should set extension key', () => {
      const engine = new SchemaEngine()

      engine.updateExtensions('guides', [{ id: 'g1', position: 10 }])

      expect(engine.schema.extensions?.guides).toEqual([{ id: 'g1', position: 10 }])
    })

    it('should create extensions object if not present', () => {
      const schema = createDefaultSchema()
      delete schema.extensions
      const engine = new SchemaEngine({ schema })

      engine.updateExtensions('foo', 'bar')

      expect(engine.schema.extensions).toEqual({ foo: 'bar' })
    })

    it('should trigger schemaChanged', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const engine = new SchemaEngine({ hooks })

      engine.updateExtensions('test', 123)

      expect(callback).toHaveBeenCalledOnce()
    })
  })

  describe('addBackgroundLayer', () => {
    it('should auto-initialize background when not present', () => {
      const engine = new SchemaEngine()

      const layer: BackgroundLayer = { type: 'color', color: '#fff' }
      engine.addBackgroundLayer(layer, -1)

      expect(engine.schema.page.background).toBeDefined()
      expect(engine.schema.page.background!.layers).toHaveLength(1)
      expect(engine.schema.page.background!.layers[0]).toBe(layer)
    })

    it('should insert at specified index', () => {
      const schema = createDefaultSchema()
      schema.page.background = {
        layers: [
          { type: 'color', color: '#000' },
          { type: 'color', color: '#fff' },
        ],
      }
      const engine = new SchemaEngine({ schema })

      const newLayer: BackgroundLayer = { type: 'image', url: 'test.png' }
      engine.addBackgroundLayer(newLayer, 1)

      expect(engine.schema.page.background!.layers).toHaveLength(3)
      expect(engine.schema.page.background!.layers[1]).toBe(newLayer)
    })

    it('should append when index is -1', () => {
      const schema = createDefaultSchema()
      schema.page.background = { layers: [{ type: 'color', color: '#000' }] }
      const engine = new SchemaEngine({ schema })

      const newLayer: BackgroundLayer = { type: 'color', color: '#fff' }
      engine.addBackgroundLayer(newLayer, -1)

      expect(engine.schema.page.background!.layers).toHaveLength(2)
      expect(engine.schema.page.background!.layers[1]).toBe(newLayer)
    })

    it('should trigger schemaChanged', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const engine = new SchemaEngine({ hooks })

      engine.addBackgroundLayer({ type: 'color', color: '#fff' }, -1)

      expect(callback).toHaveBeenCalledOnce()
    })
  })

  describe('removeBackgroundLayer', () => {
    it('should remove layer at index and return it', () => {
      const layer: BackgroundLayer = { type: 'color', color: '#000' }
      const schema = createDefaultSchema()
      schema.page.background = { layers: [layer, { type: 'color', color: '#fff' }] }
      const engine = new SchemaEngine({ schema })

      const removed = engine.removeBackgroundLayer(0)

      expect(removed).toBe(layer)
      expect(engine.schema.page.background!.layers).toHaveLength(1)
    })

    it('should return undefined when no background', () => {
      const engine = new SchemaEngine()

      expect(engine.removeBackgroundLayer(0)).toBeUndefined()
    })

    it('should return undefined for out-of-range index', () => {
      const schema = createDefaultSchema()
      schema.page.background = { layers: [{ type: 'color', color: '#000' }] }
      const engine = new SchemaEngine({ schema })

      expect(engine.removeBackgroundLayer(5)).toBeUndefined()
      expect(engine.removeBackgroundLayer(-1)).toBeUndefined()
    })

    it('should trigger schemaChanged', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const schema = createDefaultSchema()
      schema.page.background = { layers: [{ type: 'color', color: '#000' }] }
      const engine = new SchemaEngine({ schema, hooks })

      engine.removeBackgroundLayer(0)

      expect(callback).toHaveBeenCalledOnce()
    })
  })

  describe('updateBackgroundLayer', () => {
    it('should replace layer at index', () => {
      const schema = createDefaultSchema()
      schema.page.background = { layers: [{ type: 'color', color: '#000' }] }
      const engine = new SchemaEngine({ schema })

      const newLayer: BackgroundLayer = { type: 'color', color: '#fff', opacity: 0.5 }
      engine.updateBackgroundLayer(0, newLayer)

      expect(engine.schema.page.background!.layers[0]).toBe(newLayer)
    })

    it('should do nothing when no background', () => {
      const engine = new SchemaEngine()

      engine.updateBackgroundLayer(0, { type: 'color', color: '#fff' })

      expect(engine.schema.page.background).toBeUndefined()
    })

    it('should do nothing for out-of-range index', () => {
      const schema = createDefaultSchema()
      schema.page.background = { layers: [{ type: 'color', color: '#000' }] }
      const engine = new SchemaEngine({ schema })

      engine.updateBackgroundLayer(5, { type: 'color', color: '#fff' })

      expect(engine.schema.page.background!.layers).toHaveLength(1)
      expect(engine.schema.page.background!.layers[0].type).toBe('color')
    })

    it('should trigger schemaChanged', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const schema = createDefaultSchema()
      schema.page.background = { layers: [{ type: 'color', color: '#000' }] }
      const engine = new SchemaEngine({ schema, hooks })

      engine.updateBackgroundLayer(0, { type: 'color', color: '#fff' })

      expect(callback).toHaveBeenCalledOnce()
    })
  })

  describe('reorderBackgroundLayer', () => {
    it('should move layer from one position to another', () => {
      const schema = createDefaultSchema()
      const layerA: BackgroundLayer = { type: 'color', color: '#aaa' }
      const layerB: BackgroundLayer = { type: 'color', color: '#bbb' }
      const layerC: BackgroundLayer = { type: 'color', color: '#ccc' }
      schema.page.background = { layers: [layerA, layerB, layerC] }
      const engine = new SchemaEngine({ schema })

      engine.reorderBackgroundLayer(0, 2)

      expect(engine.schema.page.background!.layers).toEqual([layerB, layerC, layerA])
    })

    it('should do nothing when no background', () => {
      const engine = new SchemaEngine()

      engine.reorderBackgroundLayer(0, 1)

      expect(engine.schema.page.background).toBeUndefined()
    })

    it('should do nothing for out-of-range fromIndex', () => {
      const schema = createDefaultSchema()
      schema.page.background = { layers: [{ type: 'color', color: '#000' }] }
      const engine = new SchemaEngine({ schema })

      engine.reorderBackgroundLayer(5, 0)

      expect(engine.schema.page.background!.layers).toHaveLength(1)
    })

    it('should trigger schemaChanged', () => {
      const hooks = createPluginHooks()
      const callback = vi.fn()
      hooks.schemaChanged.on('test', callback)
      const schema = createDefaultSchema()
      schema.page.background = {
        layers: [
          { type: 'color', color: '#000' },
          { type: 'color', color: '#fff' },
        ],
      }
      const engine = new SchemaEngine({ schema, hooks })

      engine.reorderBackgroundLayer(0, 1)

      expect(callback).toHaveBeenCalledOnce()
    })
  })

  describe('operations', () => {
    it('should return SchemaOperations object', () => {
      const engine = new SchemaEngine()
      const ops = engine.operations

      expect(ops.addBackgroundLayer).toBeTypeOf('function')
      expect(ops.addElement).toBeTypeOf('function')
      expect(ops.getElement).toBeTypeOf('function')
      expect(ops.getPageSettings).toBeTypeOf('function')
      expect(ops.removeBackgroundLayer).toBeTypeOf('function')
      expect(ops.removeElement).toBeTypeOf('function')
      expect(ops.reorderBackgroundLayer).toBeTypeOf('function')
      expect(ops.reorderElement).toBeTypeOf('function')
      expect(ops.updateBackgroundLayer).toBeTypeOf('function')
      expect(ops.updateElementBinding).toBeTypeOf('function')
      expect(ops.updateElementLayout).toBeTypeOf('function')
      expect(ops.updateElementLock).toBeTypeOf('function')
      expect(ops.updateElementProps).toBeTypeOf('function')
      expect(ops.updateElementStyle).toBeTypeOf('function')
      expect(ops.updateElementVisibility).toBeTypeOf('function')
      expect(ops.updateExtensions).toBeTypeOf('function')
      expect(ops.updatePageSettings).toBeTypeOf('function')
    })

    it('should delegate to schemaEngine methods', () => {
      const el = createElement({ id: 'e1' })
      const engine = createEngineWithElements([el])
      const ops = engine.operations

      ops.updateElementLayout('e1', { x: 42 })

      expect(el.layout.x).toBe(42)
    })
  })
})
