import type { SchemaAdapter } from '@easyink/core'
import type { DocumentSchema } from '@easyink/schema'
import { recordSchemaAdapter } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { isBindingRef } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { collectDocumentBindingSlots, DataSourceAligner } from './datasource-aligner'
import { collectAdapterQuarantinedAddresses } from './diagnostic-address'

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
          formatEditor: { tabs: ['preset'], presetTypes: ['number'] },
        }] },
      }),
    ])
    const child = profile.createNode('custom-binding', {
      id: 'child',
      bindings: { 'a/b~c': {
        sourceId: 'data',
        sourceName: 'Customers',
        sourceTag: 'primary',
        fieldPath: 'legacy.name',
        fieldKey: 'name',
        fieldLabel: 'Customer name',
        required: true,
        extensions: { plugin: { enabled: true } },
        format: {
          mode: 'preset',
          prefix: '#',
          preset: { type: 'number', minimumFractionDigits: 2 },
          extensions: { formatter: true },
        },
      } },
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
    const fixedBinding = fixed.elements[0]?.slots.content?.[0]?.bindings['a/b~c']
    expect(fixedBinding).toMatchObject({
      sourceName: 'Customers',
      sourceTag: 'primary',
      fieldPath: 'customer/name',
      fieldKey: 'name',
      fieldLabel: 'Customer name',
      required: true,
      extensions: { plugin: { enabled: true } },
      format: { mode: 'preset', prefix: '#', preset: { type: 'number', minimumFractionDigits: 2 } },
    })
    if (!isBindingRef(fixedBinding))
      throw new Error('Expected a BindingRef')
    expect(Object.isFrozen(fixedBinding)).toBe(true)
    expect(Object.isFrozen(fixedBinding.format)).toBe(true)
    expect(Object.isFrozen(fixedBinding.extensions)).toBe(true)
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

  it('skips only the exact quarantined node and retains healthy relatives', () => {
    const invalidAdapter: SchemaAdapter = {
      ...recordSchemaAdapter(1),
      validate: () => [{ code: 'INVALID_CHILD', severity: 'error', path: '/model', message: 'invalid' }],
    }
    const warningAdapter: SchemaAdapter = {
      ...recordSchemaAdapter(1),
      validate: () => [{ code: 'CHILD_WARNING', severity: 'warning', path: '/model', message: 'warning' }],
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'bound-owner',
        defaultModel: { value: '' },
        binding: bindingDefinition(),
        slots: [{ id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
      }),
      createTestMaterialManifest({ type: 'invalid-child', defaultModel: { value: '' }, schemaAdapter: invalidAdapter, binding: bindingDefinition() }),
      createTestMaterialManifest({ type: 'warning-child', defaultModel: { value: '' }, schemaAdapter: warningAdapter, binding: bindingDefinition() }),
      createTestMaterialManifest({ type: 'healthy', defaultModel: { value: '' }, binding: bindingDefinition() }),
    ])
    const badChild = { ...profile.createNode('healthy', { id: 'bad-child', bindings: { value: { sourceId: 'data', fieldPath: 'bad.child' } } }), type: 'invalid-child' }
    const warningChild = { ...profile.createNode('healthy', { id: 'warning-child', bindings: { value: { sourceId: 'data', fieldPath: 'warning.child' } } }), type: 'warning-child' }
    const owner = profile.createNode('bound-owner', {
      id: 'owner',
      bindings: { value: { sourceId: 'data', fieldPath: 'owner.value' } },
      slots: { content: [badChild, warningChild] },
    })
    const roots = Array.from({ length: 10 }, (_, index) => profile.createNode('healthy', {
      id: `healthy-${index}`,
      bindings: { value: { sourceId: 'data', fieldPath: `healthy.${index}` } },
    }))
    roots[0] = { ...profile.createNode('healthy', { id: 'bad-owner', bindings: { value: { sourceId: 'data', fieldPath: 'bad.owner' } } }), type: 'invalid-child' }
    const schema = makeSchema([owner, ...roots])

    const slots = new DataSourceAligner().extractBindings(schema, profile)
    const collected = collectDocumentBindingSlots(schema, profile)

    expect(slots.map(slot => slot.nodeAddress.nodeId)).toEqual([
      'owner',
      'warning-child',
      'healthy-1',
      'healthy-2',
      'healthy-3',
      'healthy-4',
      'healthy-5',
      'healthy-6',
      'healthy-7',
      'healthy-8',
      'healthy-9',
    ])
    expect(slots.map(slot => slot.nodeAddress.path)).toContain('/elements/10')
    expect(collected.map(slot => slot.nodeAddress.nodeId)).toEqual(slots.map(slot => slot.nodeAddress.nodeId))
  })

  it('keeps duplicate-ID bindings when quarantine is graph-only', () => {
    const profile = createProfile()
    const first = profile.createNode('custom-binding', { id: 'same', bindings: { value: { sourceId: 'data', fieldPath: 'first.value' } } })
    const second = profile.createNode('custom-binding', { id: 'same', bindings: { value: { sourceId: 'data', fieldPath: 'second.value' } } })

    const slots = new DataSourceAligner().extractBindings(makeSchema([first, second]), profile)

    expect(slots.map(slot => slot.nodeAddress.path)).toEqual(['/elements/0', '/elements/1'])
  })

  it.each([
    ['second', false, true, ['/elements/0']],
    ['first', true, false, ['/elements/1']],
  ] as const)('quarantines only the %s same-ID occurrence with an adapter error', (_label, firstInvalid, secondInvalid, expected) => {
    const profile = createAddressQuarantineProfile()
    const makeDuplicate = (invalid: boolean, fieldPath: string) => ({
      ...profile.createNode('healthy', { id: 'same', bindings: { value: { sourceId: 'data', fieldPath } } }),
      type: invalid ? 'invalid' : 'healthy',
    })
    const schema = makeSchema([
      makeDuplicate(firstInvalid, 'first.value'),
      makeDuplicate(secondInvalid, 'second.value'),
    ])

    const slots = new DataSourceAligner().extractBindings(schema, profile)

    expect(slots.map(slot => slot.nodeAddress.path)).toEqual(expected)
  })

  it('quarantines the exact nested duplicate under an escaped slot address', () => {
    const profile = createAddressQuarantineProfile()
    const healthy = profile.createNode('healthy', { id: 'same-child', bindings: { value: { sourceId: 'data', fieldPath: 'healthy.value' } } })
    const invalid = {
      ...profile.createNode('healthy', { id: 'same-child', bindings: { value: { sourceId: 'data', fieldPath: 'invalid.value' } } }),
      type: 'invalid',
    }
    const owner = profile.createNode('escaped-owner', {
      id: 'escaped-owner',
      bindings: { value: { sourceId: 'data', fieldPath: 'owner.value' } },
      slots: { 'a/b~c': [healthy, invalid] },
    })

    const slots = new DataSourceAligner().extractBindings(makeSchema([owner]), profile)

    expect(slots.map(slot => slot.nodeAddress.path)).toEqual([
      '/elements/0',
      '/elements/0/slots/a~1b~0c/0',
    ])
  })

  it('does not quarantine nodes for a document-level error without an address match', () => {
    const schema = makeSchema([createProfile().createNode('custom-binding')])

    const addresses = collectAdapterQuarantinedAddresses(schema, [{
      code: 'DOCUMENT_INVALID',
      severity: 'error',
      path: '/unit',
      stage: 'envelope',
      message: 'invalid document unit',
    }])

    expect(addresses).toEqual(new Set())
  })

  it('attributes an escaped slot diagnostic to its nearest owner address', () => {
    const profile = createAddressQuarantineProfile()
    const child = profile.createNode('healthy', { id: 'child' })
    const owner = profile.createNode('escaped-owner', { id: 'owner', slots: { 'a/b~c': [child] } })
    const schema = makeSchema([owner])

    const addresses = collectAdapterQuarantinedAddresses(schema, [{
      code: 'SLOT_INVALID',
      severity: 'error',
      path: '/elements/0/slots/a~1b~0c',
      stage: 'validate',
      nodeId: 'owner',
      message: 'invalid slot',
    }])

    expect(addresses).toEqual(new Set(['/elements/0']))
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

function createAddressQuarantineProfile() {
  const invalidAdapter: SchemaAdapter = {
    ...recordSchemaAdapter(1),
    validate: () => [{ code: 'INVALID', severity: 'error', path: '/model', message: 'invalid' }],
  }
  return createTestCompiledMaterialProfile([
    createTestMaterialManifest({ type: 'healthy', defaultModel: { value: '' }, binding: bindingDefinition() }),
    createTestMaterialManifest({ type: 'invalid', defaultModel: { value: '' }, schemaAdapter: invalidAdapter, binding: bindingDefinition() }),
    createTestMaterialManifest({
      type: 'escaped-owner',
      defaultModel: { value: '' },
      binding: bindingDefinition(),
      slots: [{ id: 'escaped', key: { kind: 'exact', value: 'a/b~c' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' }],
    }),
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
