import { describe, expect, it } from 'vitest'
import { ElementRenderRegistry } from '../element-registry'

describe('elementRenderRegistry', () => {
  it('should register and retrieve a render function', () => {
    const registry = new ElementRenderRegistry()
    const fn = () => document.createElement('div')
    registry.register('text', fn)
    expect(registry.get('text')).toBe(fn)
  })

  it('should return undefined for unregistered type', () => {
    const registry = new ElementRenderRegistry()
    expect(registry.get('unknown')).toBeUndefined()
  })

  it('should report has correctly', () => {
    const registry = new ElementRenderRegistry()
    expect(registry.has('text')).toBe(false)
    registry.register('text', () => document.createElement('div'))
    expect(registry.has('text')).toBe(true)
  })

  it('should override existing registration', () => {
    const registry = new ElementRenderRegistry()
    const fn1 = () => document.createElement('div')
    const fn2 = () => document.createElement('span')
    registry.register('text', fn1)
    registry.register('text', fn2)
    expect(registry.get('text')).toBe(fn2)
  })

  it('should unregister a render function', () => {
    const registry = new ElementRenderRegistry()
    registry.register('text', () => document.createElement('div'))
    expect(registry.unregister('text')).toBe(true)
    expect(registry.has('text')).toBe(false)
  })

  it('should return false when unregistering non-existent type', () => {
    const registry = new ElementRenderRegistry()
    expect(registry.unregister('unknown')).toBe(false)
  })

  it('should clear all registrations', () => {
    const registry = new ElementRenderRegistry()
    registry.register('text', () => document.createElement('div'))
    registry.register('image', () => document.createElement('div'))
    registry.clear()
    expect(registry.has('text')).toBe(false)
    expect(registry.has('image')).toBe(false)
  })
})
