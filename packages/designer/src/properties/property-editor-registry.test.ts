import { describe, expect, it } from 'vitest'
import { defineComponent, isReactive } from 'vue'
import { PropertyEditorRegistry, PropertyEditorRegistryError } from './property-editor-registry'

describe('propertyEditorRegistry', () => {
  it('validates ids and rejects duplicates across owners', () => {
    const registry = new PropertyEditorRegistry()
    const component = defineComponent({})
    expect(() => registry.register({ id: 'Bad', ownerPackageId: 'a', component })).toThrowError(PropertyEditorRegistryError)
    registry.register({ id: 'pkg/editor', ownerPackageId: 'a', component })
    expect(() => registry.register({ id: 'pkg/editor', ownerPackageId: 'b', component })).toThrowError('PROPERTY_EDITOR_DUPLICATE')
    expect(isReactive(registry.get('pkg/editor'))).toBe(false)
  })

  it('only unregisters the matching owner', () => {
    const registry = new PropertyEditorRegistry()
    const component = defineComponent({})
    const dispose = registry.register({ id: 'pkg/editor', ownerPackageId: 'a', component })
    expect(registry.unregister('pkg/editor', 'b')).toBe(false)
    expect(registry.get('pkg/editor')).toBe(component)
    dispose()
    expect(registry.get('pkg/editor')).toBeUndefined()
  })
})
