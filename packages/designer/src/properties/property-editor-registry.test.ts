import { describe, expect, it } from 'vitest'
import { defineComponent, isReactive, markRaw } from 'vue'
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

  it('owns frozen snapshots that caller and returned values cannot retarget', () => {
    const registry = new PropertyEditorRegistry()
    const component = markRaw(defineComponent({ name: 'Original' }))
    const replacement = markRaw(defineComponent({ name: 'Replacement' }))
    const input = { id: 'pkg/editor', ownerPackageId: 'owner', component }
    const dispose = registry.register(input)

    input.id = 'pkg/other'
    input.ownerPackageId = 'attacker'
    input.component = replacement
    const registration = registry.getRegistration('pkg/editor')!
    const listed = registry.list()

    expect(registration).toEqual({ id: 'pkg/editor', ownerPackageId: 'owner', component })
    expect(Object.isFrozen(registration)).toBe(true)
    expect(Object.isFrozen(listed)).toBe(true)
    expect(() => Object.assign(registration, { ownerPackageId: 'attacker', component: replacement })).toThrow()
    expect(registry.unregister('pkg/editor', 'attacker')).toBe(false)
    expect(registry.get('pkg/editor')).toBe(component)

    dispose()
    expect(registry.get('pkg/editor')).toBeUndefined()
  })
})
