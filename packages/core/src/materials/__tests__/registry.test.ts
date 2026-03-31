import type { MaterialTypeDefinition } from '../types'
import { describe, expect, it } from 'vitest'
import { MaterialRegistry } from '../registry'

function createTestDefinition(overrides?: Partial<MaterialTypeDefinition>): MaterialTypeDefinition {
  return {
    type: 'test-element',
    name: '测试元素',
    icon: 'test-icon',
    propSchemas: [],
    defaultProps: {},
    defaultLayout: { position: 'absolute', width: 100, height: 50 },
    ...overrides,
  }
}

describe('materialRegistry', () => {
  describe('register', () => {
    it('should register an element type', () => {
      const registry = new MaterialRegistry()
      const def = createTestDefinition()

      registry.register(def)

      expect(registry.has('test-element')).toBe(true)
      expect(registry.get('test-element')).toBe(def)
    })

    it('should overwrite existing definition with same type', () => {
      const registry = new MaterialRegistry()
      const def1 = createTestDefinition({ name: '旧定义' })
      const def2 = createTestDefinition({ name: '新定义' })

      registry.register(def1)
      registry.register(def2)

      expect(registry.get('test-element')).toBe(def2)
      expect(registry.get('test-element')!.name).toBe('新定义')
    })

    it('should throw TypeError if type is empty string', () => {
      const registry = new MaterialRegistry()
      const def = createTestDefinition({ type: '' })

      expect(() => registry.register(def)).toThrow(TypeError)
      expect(() => registry.register(def)).toThrow('non-empty string')
    })

    it('should register multiple different types', () => {
      const registry = new MaterialRegistry()

      registry.register(createTestDefinition({ type: 'text' }))
      registry.register(createTestDefinition({ type: 'image' }))
      registry.register(createTestDefinition({ type: 'rect' }))

      expect(registry.has('text')).toBe(true)
      expect(registry.has('image')).toBe(true)
      expect(registry.has('rect')).toBe(true)
    })
  })

  describe('registerAll', () => {
    it('should register multiple definitions at once', () => {
      const registry = new MaterialRegistry()
      const defs = [
        createTestDefinition({ type: 'a' }),
        createTestDefinition({ type: 'b' }),
        createTestDefinition({ type: 'c' }),
      ]

      registry.registerAll(defs)

      expect(registry.types()).toEqual(['a', 'b', 'c'])
    })

    it('should throw TypeError if any definition has empty type', () => {
      const registry = new MaterialRegistry()
      const defs = [
        createTestDefinition({ type: 'a' }),
        createTestDefinition({ type: '' }),
      ]

      expect(() => registry.registerAll(defs)).toThrow(TypeError)
    })
  })

  describe('unregister', () => {
    it('should unregister an existing type', () => {
      const registry = new MaterialRegistry()
      registry.register(createTestDefinition())

      const result = registry.unregister('test-element')

      expect(result).toBe(true)
      expect(registry.has('test-element')).toBe(false)
    })

    it('should return false for non-existing type', () => {
      const registry = new MaterialRegistry()

      const result = registry.unregister('non-existing')

      expect(result).toBe(false)
    })
  })

  describe('get', () => {
    it('should return undefined for non-existing type', () => {
      const registry = new MaterialRegistry()

      expect(registry.get('non-existing')).toBeUndefined()
    })

    it('should return the registered definition', () => {
      const registry = new MaterialRegistry()
      const def = createTestDefinition()
      registry.register(def)

      expect(registry.get('test-element')).toBe(def)
    })
  })

  describe('has', () => {
    it('should return false for non-existing type', () => {
      const registry = new MaterialRegistry()

      expect(registry.has('non-existing')).toBe(false)
    })

    it('should return true for registered type', () => {
      const registry = new MaterialRegistry()
      registry.register(createTestDefinition())

      expect(registry.has('test-element')).toBe(true)
    })
  })

  describe('list', () => {
    it('should return empty array when no types registered', () => {
      const registry = new MaterialRegistry()

      expect(registry.list()).toEqual([])
    })

    it('should return all registered definitions', () => {
      const registry = new MaterialRegistry()
      const defs = [
        createTestDefinition({ type: 'a' }),
        createTestDefinition({ type: 'b' }),
      ]
      registry.registerAll(defs)

      const result = registry.list()

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('a')
      expect(result[1].type).toBe('b')
    })

    it('should return a copy (modifying result does not affect registry)', () => {
      const registry = new MaterialRegistry()
      registry.register(createTestDefinition())

      const result = registry.list()
      result.pop()

      expect(registry.list()).toHaveLength(1)
    })
  })

  describe('types', () => {
    it('should return empty array when no types registered', () => {
      const registry = new MaterialRegistry()

      expect(registry.types()).toEqual([])
    })

    it('should return all registered type identifiers', () => {
      const registry = new MaterialRegistry()
      registry.register(createTestDefinition({ type: 'text' }))
      registry.register(createTestDefinition({ type: 'image' }))

      expect(registry.types()).toEqual(['text', 'image'])
    })
  })

  describe('clear', () => {
    it('should remove all registered types', () => {
      const registry = new MaterialRegistry()
      registry.register(createTestDefinition({ type: 'a' }))
      registry.register(createTestDefinition({ type: 'b' }))

      registry.clear()

      expect(registry.list()).toEqual([])
      expect(registry.has('a')).toBe(false)
      expect(registry.has('b')).toBe(false)
    })
  })
})
