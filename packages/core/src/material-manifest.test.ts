import type { MaterialManifest } from './material-manifest'
import { describe, expect, it } from 'vitest'
import { defineMaterialManifest } from './material-manifest'
import { recordSchemaAdapter } from './schema-adapter'

function validManifest(overrides: Partial<MaterialManifest> = {}): MaterialManifest {
  return {
    manifestVersion: 1,
    apiVersion: 1,
    engineRange: { min: '0.0.30', maxExclusive: '0.1.0' },
    type: 'box',
    modelVersion: 1,
    common: {
      nameKey: 'materials.box.name',
      category: 'layout',
      iconKey: 'box',
      defaultNode: { width: 20, height: 10, unit: 'mm', model: { color: '#fff' } },
      interaction: { rotatable: true, resizable: true },
      binding: { kind: 'none' },
      condition: { scope: 'node', hiddenEffects: ['remove'] },
      layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
      structure: { slots: [] },
      properties: [],
    },
    schemaAdapter: recordSchemaAdapter(1),
    facets: {},
    ...overrides,
  }
}

describe('defineMaterialManifest', () => {
  it('freezes one common semantic source and preserves independent facets', () => {
    const designer = async () => ({ kind: 'designer' })
    const manifest = defineMaterialManifest(validManifest({
      facets: {
        designer,
        ai: {
          generation: {
            enabled: true,
            modelSchema: { type: 'object' },
            bindingShape: { type: 'object' },
            examples: [{ color: '#fff' }],
          },
        },
      },
    }))

    expect(Object.isFrozen(manifest)).toBe(true)
    expect(Object.isFrozen(manifest.common.defaultNode.model)).toBe(true)
    expect(manifest.common.layout.pageRepeat).toBe('none')
    expect(manifest.facets.designer).toBe(designer)
    expect(manifest.facets.viewer).toBeUndefined()
  })

  it('rejects an unversioned or mismatched adapter', () => {
    expect(() => defineMaterialManifest(validManifest({
      modelVersion: 2,
      schemaAdapter: { currentModelVersion: 1 } as never,
    }))).toThrowError('MATERIAL_ADAPTER_VERSION_MISMATCH')
  })

  it.each(['', ' box', 'box ', 'Box', 'acme/', '/invoice', 'acme/invoice/line'])(
    'rejects malformed type id %j',
    type => expect(() => defineMaterialManifest(validManifest({ type }))).toThrowError('MATERIAL_TYPE_INVALID'),
  )

  it('accepts one namespace segment in a type id', () => {
    expect(defineMaterialManifest(validManifest({ type: 'acme/invoice-line' })).type).toBe('acme/invoice-line')
  })

  it('allows disabled AI generation with empty examples', () => {
    const manifest = defineMaterialManifest(validManifest({
      facets: { ai: { generation: { enabled: false, examples: [] } } },
    }))

    expect(manifest.facets.ai?.generation.enabled).toBe(false)
  })

  it('keeps fragmentation ownership in core', () => {
    const input = validManifest()
    input.common.layout.fragmentation = 'material-owned' as never

    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_FRAGMENTATION_INVALID')
  })

  it('strictly validates interaction and layout facets', () => {
    const interaction = validManifest()
    interaction.common.interaction.rotatable = 1 as never
    expect(() => defineMaterialManifest(interaction)).toThrowError('MATERIAL_INTERACTION_INVALID')

    const layout = validManifest()
    layout.common.layout.overflow = 'scroll' as never
    expect(() => defineMaterialManifest(layout)).toThrowError('MATERIAL_LAYOUT_INVALID')
  })

  it('strictly validates structure policy semantics', () => {
    const input = validManifest()
    input.common.structure.slots = [{
      id: 'content',
      key: { kind: 'exact', value: 'content' },
      coordinateSpace: 'page' as never,
      layoutParticipation: 'owner',
      reparent: 'allowed',
    }]

    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_STRUCTURE_POLICY_INVALID')
  })

  it.each([
    { engineRange: { min: '1.0', maxExclusive: '2.0.0' } },
    { engineRange: { min: '1.0.0-beta', maxExclusive: '2.0.0' } },
    { engineRange: { min: '2.0.0', maxExclusive: '2.0.0' } },
    { engineRange: { min: '2.0.1', maxExclusive: '2.0.0' } },
  ])('rejects invalid strict engine bounds %#', ({ engineRange }) => {
    expect(() => defineMaterialManifest(validManifest({ engineRange }))).toThrowError('MATERIAL_ENGINE_RANGE_INVALID')
  })

  it('rejects cyclic manifest records without cloning functions', () => {
    const input = validManifest()
    ;(input.common.defaultNode.model as Record<string, unknown>).self = input.common

    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_MANIFEST_CYCLE')
  })

  it.each(['nameKey', 'category', 'iconKey'] as const)('requires a nonempty common %s', (key) => {
    const input = validManifest()
    input.common[key] = ''

    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_COMMON_KEY_INVALID')
  })

  it('requires positive default dimensions and nonnegative integer model versions', () => {
    const badSize = validManifest()
    badSize.common.defaultNode.width = 0
    expect(() => defineMaterialManifest(badSize)).toThrowError('MATERIAL_DEFAULT_SIZE_INVALID')

    expect(() => defineMaterialManifest(validManifest({ modelVersion: -1 }))).toThrowError('MATERIAL_MODEL_VERSION_INVALID')
    expect(() => defineMaterialManifest(validManifest({ modelVersion: 1.5 }))).toThrowError('MATERIAL_MODEL_VERSION_INVALID')
  })

  it('requires unique property and policy ids', () => {
    const duplicateProperties = validManifest()
    duplicateProperties.common.properties = [
      { key: 'color', label: 'Color', type: 'color' },
      { key: 'color', label: 'Fill', type: 'color' },
    ]
    expect(() => defineMaterialManifest(duplicateProperties)).toThrowError('MATERIAL_PROPERTY_KEY_DUPLICATE')

    const duplicateSlots = validManifest()
    duplicateSlots.common.structure.slots = [
      { id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' },
      { id: 'content', key: { kind: 'exact', value: 'footer' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' },
    ]
    expect(() => defineMaterialManifest(duplicateSlots)).toThrowError('MATERIAL_STRUCTURE_POLICY_ID_DUPLICATE')
  })

  it('rejects overlapping exact and prefix structure policies', () => {
    const input = validManifest()
    input.common.structure.slots = [
      { id: 'rows', key: { kind: 'prefix', value: 'row-' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' },
      { id: 'first-row', key: { kind: 'exact', value: 'row-0' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' },
    ]

    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_STRUCTURE_POLICY_OVERLAP')
  })

  it('validates binding policy overlap and semantic/display role rules', () => {
    const overlap = validManifest()
    overlap.common.binding = {
      kind: 'ports',
      ports: [
        { id: 'series', key: { kind: 'prefix', value: 'series-' }, role: 'semantic', valueShape: 'record-array', formatEditor: false },
        { id: 'first', key: { kind: 'exact', value: 'series-0' }, role: 'semantic', valueShape: 'record-array', formatEditor: false },
      ],
    }
    expect(() => defineMaterialManifest(overlap)).toThrowError('MATERIAL_BINDING_POLICY_OVERLAP')

    const semanticFormatting = validManifest()
    semanticFormatting.common.binding = {
      kind: 'ports',
      ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'scalar', formatEditor: { tabs: ['preset'] } }],
    }
    expect(() => defineMaterialManifest(semanticFormatting)).toThrowError('MATERIAL_BINDING_ROLE_INVALID')

    const displayWithoutModelPath = validManifest()
    displayWithoutModelPath.common.binding = {
      kind: 'ports',
      ports: [{ id: 'label', key: { kind: 'exact', value: 'label' }, role: 'display', valueShape: 'scalar', formatEditor: { tabs: ['preset'] } }],
    }
    expect(() => defineMaterialManifest(displayWithoutModelPath)).toThrowError('MATERIAL_BINDING_MODEL_PATH_INVALID')
  })

  it('enforces matched port formatting rules on default bindings', () => {
    const semantic = validManifest()
    semantic.common.binding = {
      kind: 'ports',
      ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'scalar', formatEditor: false }],
    }
    semantic.common.defaultNode.bindings = {
      value: { sourceId: 'source', fieldPath: 'value', format: { mode: 'preset', preset: { type: 'number' } } },
    }
    expect(() => defineMaterialManifest(semantic)).toThrowError('MATERIAL_BINDING_ROLE_INVALID')

    const disabledDisplayFormat = validManifest()
    disabledDisplayFormat.common.binding = {
      kind: 'ports',
      ports: [{ id: 'label', key: { kind: 'exact', value: 'label' }, role: 'display', valueShape: 'scalar', modelPath: '/model/label', formatEditor: false }],
    }
    disabledDisplayFormat.common.defaultNode.bindings = {
      label: { sourceId: 'source', fieldPath: 'label', format: { mode: 'preset', preset: { type: 'number' } } },
    }
    expect(() => defineMaterialManifest(disabledDisplayFormat)).toThrowError('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
  })

  it('forbids legacy display formatting inside semantic data-contract bindings', () => {
    const input = validManifest()
    input.common.binding = {
      kind: 'ports',
      ports: [{ id: 'dataset', key: { kind: 'exact', value: 'dataset' }, role: 'semantic', valueShape: 'record-array', formatEditor: false }],
    }
    input.common.defaultNode.bindings = {
      dataset: {
        kind: 'data-contract',
        mappings: {
          amount: {
            sourceId: 'source',
            select: { path: 'amount' },
            format: { mode: 'preset', preset: { type: 'number' } },
          },
        },
      },
    }

    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_BINDING_ROLE_INVALID')
  })

  it('requires convertible adapters to provide explicit private-model conversion', () => {
    const input = validManifest()
    input.schemaAdapter = {
      ...recordSchemaAdapter(1),
      modelUnitPolicy: 'convertible',
    }

    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_ADAPTER_UNIT_CONVERSION_REQUIRED')
  })

  it('requires valid model-relative RFC 6901 paths', () => {
    const binding = validManifest()
    binding.common.binding = {
      kind: 'ports',
      ports: [{ id: 'label', key: { kind: 'exact', value: 'label' }, role: 'display', valueShape: 'scalar', modelPath: '/label', formatEditor: false }],
    }
    expect(() => defineMaterialManifest(binding)).toThrowError('MATERIAL_BINDING_MODEL_PATH_INVALID')

    const ai = validManifest()
    ai.facets = { ai: { generation: { enabled: false, examples: [], requiredModelPaths: ['/model/color'] } } }
    expect(() => defineMaterialManifest(ai)).toThrowError('MATERIAL_AI_MODEL_PATH_INVALID')
  })

  it.each([
    ['model schema', { modelSchema: { value: Number.NaN } }],
    ['binding shape', { bindingShape: { value: undefined } }],
    ['example', { examples: [{ value: () => undefined }] }],
  ])('validates AI %s as JSON', (_label, generation) => {
    const input = validManifest()
    input.facets = { ai: { generation: { enabled: false, examples: [], ...generation } as never } }

    expect(captureError(() => defineMaterialManifest(input))).toMatchObject({ code: expect.stringMatching(/^JSON_VALUE_/) })
  })

  it('validates AI descriptors as JSON', () => {
    const input = validManifest()
    input.facets = {
      ai: {
        generation: { enabled: false, examples: [] },
        descriptor: { invalid: Symbol('invalid') } as never,
      },
    }

    expect(captureError(() => defineMaterialManifest(input))).toMatchObject({ code: 'JSON_VALUE_TYPE' })
  })
})

function captureError(run: () => unknown): unknown {
  try {
    run()
  }
  catch (error) {
    return error
  }
  throw new Error('Expected operation to throw')
}

describe('recordSchemaAdapter', () => {
  it('creates a complete migration chain and clones the model during normalization', () => {
    const adapter = recordSchemaAdapter(2)
    const model = { value: 1 }
    const normalized = adapter.normalize({ model, modelVersion: 2 } as never, {} as never)

    expect(adapter.migrations.map(({ from, to }) => [from, to])).toEqual([[0, 1], [1, 2]])
    expect(normalized.model).toEqual(model)
    expect(normalized.model).not.toBe(model)
    expect(adapter.introspect({} as never, {} as never)).toEqual({
      identities: [],
      structures: [],
      references: [],
      resources: [],
      bindings: [],
    })
  })

  it('rejects invalid current model versions', () => {
    expect(() => recordSchemaAdapter(-1)).toThrowError('MATERIAL_MODEL_VERSION_INVALID')
    expect(() => recordSchemaAdapter(1.5)).toThrowError('MATERIAL_MODEL_VERSION_INVALID')
  })
})
