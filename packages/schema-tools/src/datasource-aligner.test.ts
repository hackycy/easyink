import type { SchemaAdapter } from '@easyink/core'
import type { DocumentSchema } from '@easyink/schema'
import { recordSchemaAdapter } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { DataSourceAligner } from './datasource-aligner'

describe('dataSourceAligner material introspection', () => {
  it('discovers and writes escaped custom binding ports in nested slots', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'owner',
        slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      }),
      createTestMaterialManifest({
        type: 'custom-binding',
        defaultModel: { value: '' },
        binding: { kind: 'ports', ports: [{
          id: 'custom',
          key: { kind: 'exact', value: 'a/b~c' },
          role: 'display',
          valueShape: 'scalar',
          modelPath: '/model/value',
          formatEditor: false,
        }] },
      }),
    ])
    const child = profile.createNode('custom-binding', {
      id: 'child',
      bindings: { 'a/b~c': { sourceId: 'data', fieldPath: 'legacy.name' } },
    })
    const owner = profile.createNode('owner', { id: 'owner', slots: { content: [child] } })
    const schema: DocumentSchema = {
      version: '1.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 100, height: 100 },
      guides: { x: [], y: [] },
      elements: [owner],
    }
    const aligner = new DataSourceAligner()
    const dataSource = { id: 'data', name: 'data', fields: [{ name: 'name', path: 'customer/name' }] }

    const slots = aligner.extractBindings(schema, profile)
    const alignment = aligner.align(schema, dataSource, profile)
    const fixed = aligner.applyAlignment(schema, alignment, profile)

    expect(slots).toEqual([expect.objectContaining({ nodeAddress: expect.objectContaining({ nodeId: 'child', path: '/elements/0/slots/content/0' }), path: '/bindings/a~1b~0c' })])
    expect(fixed.elements[0]?.slots.content?.[0]?.bindings['a/b~c']).toMatchObject({ fieldPath: 'customer/name' })
    expect(schema.elements[0]?.slots.content?.[0]?.bindings['a/b~c']).toMatchObject({ fieldPath: 'legacy.name' })
  })

  it('writes duplicate root and nested IDs by structural address', () => {
    const profile = createProfile()
    const first = profile.createNode('custom-binding', { id: 'duplicate', bindings: { value: { sourceId: 'data', fieldPath: 'legacy.name' } } })
    const nested = profile.createNode('custom-binding', { id: 'duplicate', bindings: { value: { sourceId: 'data', fieldPath: 'legacy.code' } } })
    const owner = profile.createNode('owner', { id: 'owner', slots: { content: [nested] } })
    const schema = makeSchema([first, owner])
    const aligner = new DataSourceAligner()
    const alignment = aligner.align(schema, { id: 'data', name: 'data', fields: [
      { name: 'name', path: 'customer/name' },
      { name: 'code', path: 'order/code' },
    ] }, profile)

    const fixed = aligner.applyAlignment(schema, alignment, profile)

    expect(fixed.elements[0]?.bindings.value).toMatchObject({ fieldPath: 'customer/name' })
    expect(fixed.elements[1]?.slots.content?.[0]?.bindings.value).toMatchObject({ fieldPath: 'order/code' })
    expect(alignment.bindingSlots.map(slot => slot.nodeAddress.path)).toEqual(['/elements/0', '/elements/1/slots/content/0'])
  })

  it('does not expose quarantined bindings and rejects stale addresses', () => {
    const adapter: SchemaAdapter = {
      ...recordSchemaAdapter(1),
      validate: () => [{ code: 'QUARANTINED', severity: 'error', path: '/model', message: 'invalid' }],
    }
    const quarantinedProfile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'custom-binding',
      defaultModel: { value: '' },
      schemaAdapter: adapter,
      binding: bindingDefinition(),
    })])
    const quarantined = createProfile().createNode('custom-binding', { bindings: { value: { sourceId: 'data', fieldPath: 'legacy.name' } } })
    const aligner = new DataSourceAligner()
    const quarantineAlignment = aligner.align(makeSchema([quarantined]), { id: 'data', name: 'data', fields: [{ name: 'name', path: 'customer/name' }] }, quarantinedProfile)
    expect(quarantineAlignment.bindingSlots).toEqual([])

    const profile = createProfile()
    const schema = makeSchema([profile.createNode('custom-binding', { id: 'bound', bindings: { value: { sourceId: 'data', fieldPath: 'legacy.name' } } })])
    const alignment = aligner.align(schema, { id: 'data', name: 'data', fields: [{ name: 'name', path: 'customer/name' }] }, profile)
    expect(() => aligner.applyAlignment(makeSchema([]), alignment, profile)).toThrowError('DATASOURCE_ALIGNMENT_ADDRESS_STALE:/elements/0')
  })
})

function bindingDefinition() {
  return { kind: 'ports' as const, ports: [{
    id: 'custom',
    key: { kind: 'exact' as const, value: 'value' },
    role: 'display' as const,
    valueShape: 'scalar' as const,
    modelPath: '/model/value' as const,
    formatEditor: false as const,
  }] }
}

function createProfile() {
  return createTestCompiledMaterialProfile([
    createTestMaterialManifest({ type: 'owner', slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }] }),
    createTestMaterialManifest({ type: 'custom-binding', defaultModel: { value: '' }, binding: bindingDefinition() }),
  ])
}

function makeSchema(elements: DocumentSchema['elements']): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 100, height: 100 },
    guides: { x: [], y: [] },
    elements,
  }
}
