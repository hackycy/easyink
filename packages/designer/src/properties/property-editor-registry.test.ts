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

  it('keeps a replacement registration when an old disposer runs', () => {
    const registry = new PropertyEditorRegistry()
    const first = defineComponent({ name: 'First' })
    const replacement = defineComponent({ name: 'Replacement' })
    const disposeFirst = registry.register({ id: 'pkg/editor', ownerPackageId: 'owner', component: first })

    expect(registry.unregister('pkg/editor', 'owner')).toBe(true)
    const disposeReplacement = registry.register({ id: 'pkg/editor', ownerPackageId: 'owner', component: replacement })

    disposeFirst()
    disposeFirst()
    expect(registry.get('pkg/editor')).toBe(replacement)

    disposeReplacement()
    disposeReplacement()
    expect(registry.get('pkg/editor')).toBeUndefined()
  })
})
