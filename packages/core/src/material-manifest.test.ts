import type { MaterialManifest } from './material-manifest'
import { describe, expect, it } from 'vitest'
import { assertMaterialBindingValue, resolveMaterialBindingPortPolicy, resolveMaterialBindingPortPolicyDefinition } from './material-binding'
import { assertCanonicalMaterialBindingMap, deepFreezeManifest, defineMaterialManifest } from './material-manifest'
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

  it('freezes all admitted structural records while preserving shared aliases', () => {
    const shared = { tone: 'red' }
    const input = validManifest()
    input.common.defaultNode.model = { shared }
    input.common.properties = [{
      key: 'tone',
      label: 'Tone',
      type: 'string',
      editorOptions: shared,
    }]

    const manifest = defineMaterialManifest(input)

    expect(manifest.common.defaultNode.model.shared).toBe(shared)
    expect(manifest.common.properties[0]?.editorOptions).toBe(shared)
    expect([
      manifest.engineRange,
      manifest.common,
      manifest.common.defaultNode,
      manifest.common.interaction,
      manifest.common.layout,
      manifest.common.structure,
      manifest.common.structure.slots,
      manifest.common.properties,
      manifest.common.properties[0],
      manifest.schemaAdapter,
      manifest.schemaAdapter.migrations,
      manifest.schemaAdapter.migrations[0],
      manifest.facets,
      shared,
    ].every(value => Object.isFrozen(value))).toBe(true)
  })

  it('rejects accessors without executing them', () => {
    let rootReads = 0
    const root = validManifest()
    Object.defineProperty(root, 'type', {
      enumerable: true,
      get: () => {
        rootReads += 1
        return 'box'
      },
    })

    expect(() => defineMaterialManifest(root)).toThrowError('MATERIAL_MANIFEST_STRUCTURE_INVALID')
    expect(rootReads).toBe(0)

    let nestedReads = 0
    const nested = validManifest()
    Object.defineProperty(nested.common.defaultNode.model, 'secret', {
      enumerable: true,
      get: () => {
        nestedReads += 1
        return 'secret'
      },
    })
    expect(() => defineMaterialManifest(nested)).toThrowError('MATERIAL_MANIFEST_STRUCTURE_INVALID')
    expect(nestedReads).toBe(0)
  })

  it('makes deep freezing descriptor-safe', () => {
    let reads = 0
    const input = {}
    Object.defineProperty(input, 'value', {
      enumerable: true,
      get: () => {
        reads += 1
        return 1
      },
    })

    expect(() => deepFreezeManifest(input)).toThrowError('MATERIAL_MANIFEST_STRUCTURE_INVALID')
    expect(reads).toBe(0)
  })

  it('rejects symbolic, non-enumerable, and prototyped structural records', () => {
    const symbolic = validManifest()
    Object.defineProperty(symbolic.common, Symbol('hidden'), { value: true, enumerable: true })
    expect(() => defineMaterialManifest(symbolic)).toThrowError('MATERIAL_MANIFEST_STRUCTURE_INVALID')

    const hidden = validManifest()
    Object.defineProperty(hidden.common, 'hidden', { value: true, enumerable: false })
    expect(() => defineMaterialManifest(hidden)).toThrowError('MATERIAL_MANIFEST_STRUCTURE_INVALID')

    class EngineRange {
      min = '0.0.30'
      maxExclusive = '0.1.0'
    }
    const prototyped = validManifest()
    prototyped.engineRange = new EngineRange() as never
    expect(() => defineMaterialManifest(prototyped)).toThrowError('MATERIAL_MANIFEST_STRUCTURE_INVALID')
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

  it('rejects very deep models with a stable depth error instead of overflowing the stack', () => {
    const input = validManifest()
    const root: Record<string, unknown> = {}
    let cursor = root
    for (let depth = 0; depth < 6_000; depth += 1) {
      const next: Record<string, unknown> = {}
      cursor.next = next
      cursor = next
    }
    input.common.defaultNode.model = root

    expect(captureError(() => defineMaterialManifest(input))).toMatchObject({ code: 'JSON_VALUE_DEPTH_LIMIT' })
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

  it('rejects malformed declared record containers with stable codes', () => {
    const common = validManifest()
    common.common = null as never
    expect(() => defineMaterialManifest(common)).toThrowError('MATERIAL_COMMON_INVALID')

    const defaultNode = validManifest()
    defaultNode.common.defaultNode = null as never
    expect(() => defineMaterialManifest(defaultNode)).toThrowError('MATERIAL_DEFAULT_NODE_INVALID')

    const model = validManifest()
    model.common.defaultNode.model = [] as never
    expect(() => defineMaterialManifest(model)).toThrowError('MATERIAL_DEFAULT_MODEL_INVALID')

    const output = validManifest()
    output.common.defaultNode.output = [] as never
    expect(() => defineMaterialManifest(output)).toThrowError('MATERIAL_DEFAULT_OUTPUT_INVALID')

    const bindings = validManifest()
    bindings.common.defaultNode.bindings = [] as never
    expect(() => defineMaterialManifest(bindings)).toThrowError('MATERIAL_DEFAULT_BINDINGS_INVALID')

    const editorOptions = validManifest()
    editorOptions.common.properties = [{ key: 'value', label: 'Value', type: 'string', editorOptions: [] as never }]
    expect(() => defineMaterialManifest(editorOptions)).toThrowError('MATERIAL_PROPERTY_DESCRIPTOR_INVALID')

    const missingBinding = validManifest()
    missingBinding.common.binding = undefined as never
    expect(() => defineMaterialManifest(missingBinding)).toThrowError('MATERIAL_BINDING_DEFINITION_INVALID')

    const malformedPolicy = validManifest()
    malformedPolicy.common.binding = { kind: 'ports', ports: [null as never] }
    expect(() => defineMaterialManifest(malformedPolicy)).toThrowError('MATERIAL_BINDING_POLICY_INVALID')
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

  it('strictly validates property descriptors and accessors', () => {
    const malformed = validManifest()
    malformed.common.properties = [null as never]
    expect(() => defineMaterialManifest(malformed)).toThrowError('MATERIAL_PROPERTY_DESCRIPTOR_INVALID')

    const descriptor = validManifest()
    descriptor.common.properties = [{ key: 'color', label: '', type: 'unknown' as never }]
    expect(() => defineMaterialManifest(descriptor)).toThrowError('MATERIAL_PROPERTY_DESCRIPTOR_INVALID')

    const accessor = validManifest()
    accessor.common.properties = [{
      key: 'color',
      label: 'Color',
      type: 'color',
      accessor: { paths: ['/model/color'], read: 'read' as never, write: () => undefined },
    }]
    expect(() => defineMaterialManifest(accessor)).toThrowError('MATERIAL_PROPERTY_ACCESSOR_INVALID')
  })

  it('strictly validates the condition capability', () => {
    const input = validManifest()
    input.common.condition = { scope: 'document', hiddenEffects: ['hide'] } as never

    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_CONDITION_INVALID')
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

  it('validates actual preset containers and globally supported types', () => {
    const createInput = () => {
      const input = validManifest()
      input.common.binding = {
        kind: 'ports',
        ports: [{
          id: 'label',
          key: { kind: 'exact', value: 'label' },
          role: 'display',
          valueShape: 'scalar',
          modelPath: '/model/label',
          formatEditor: { tabs: ['preset'] },
        }],
      }
      return input
    }

    const script = createInput()
    script.common.defaultNode.bindings = {
      label: { sourceId: 'source', fieldPath: 'label', format: { mode: 'preset', preset: { type: 'script' as never } } },
    }
    expect(() => defineMaterialManifest(script)).toThrowError('MATERIAL_BINDING_FORMAT_POLICY_INVALID')

    const container = createInput()
    container.common.defaultNode.bindings = {
      label: { sourceId: 'source', fieldPath: 'label', format: { mode: 'preset', preset: 'number' as never } },
    }
    expect(() => defineMaterialManifest(container)).toThrowError('MATERIAL_BINDING_FORMAT_POLICY_INVALID')

    const malformed = createInput()
    malformed.common.defaultNode.bindings = {
      label: {
        sourceId: 'source',
        fieldPath: 'label',
        format: { mode: 'preset', preset: { type: 'number', minimumFractionDigits: '2' as never } },
      },
    }
    expect(() => defineMaterialManifest(malformed)).toThrowError('MATERIAL_BINDING_FORMAT_POLICY_INVALID')

    const valid = createInput()
    valid.common.defaultNode.bindings = {
      label: { sourceId: 'source', fieldPath: 'label', format: { mode: 'preset', preset: { type: 'number', minimumFractionDigits: 2 } } },
    }
    expect(() => defineMaterialManifest(valid)).not.toThrow()
  })

  it('rejects legacy arrays, bindIndex, and data-contract objects from canonical defaults', () => {
    const input = validManifest()
    input.common.binding = {
      kind: 'ports',
      ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'scalar', formatEditor: false }],
    }
    input.common.defaultNode.bindings = { value: [{ sourceId: 'source', fieldPath: 'value' }] } as never
    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_BINDING_EXPRESSION_INVALID')

    input.common.defaultNode.bindings = { value: { sourceId: 'source', fieldPath: 'value', bindIndex: 0 } } as never
    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_BINDING_EXPRESSION_INVALID')

    input.common.defaultNode.bindings = { value: { kind: 'data-contract', mappings: {} } } as never
    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_BINDING_EXPRESSION_INVALID')
  })

  it('requires declared binding record containers to remain records', () => {
    const expression = validManifest()
    expression.common.binding = {
      kind: 'ports',
      ports: [{ id: 'value', key: { kind: 'exact', value: 'value' }, role: 'semantic', valueShape: 'scalar', formatEditor: false }],
    }
    expression.common.defaultNode.bindings = {
      value: { sourceId: 'source', fieldPath: 'value', extensions: [] as never },
    }
    expect(() => defineMaterialManifest(expression)).toThrowError('MATERIAL_BINDING_EXPRESSION_INVALID')

    const format = validManifest()
    format.common.binding = {
      kind: 'ports',
      ports: [{
        id: 'value',
        key: { kind: 'exact', value: 'value' },
        role: 'display',
        valueShape: 'scalar',
        modelPath: '/model/value',
        formatEditor: { tabs: ['preset'] },
      }],
    }
    format.common.defaultNode.bindings = {
      value: {
        sourceId: 'source',
        fieldPath: 'value',
        format: { mode: 'preset', preset: { type: 'number' }, extensions: [] as never },
      },
    }
    expect(() => defineMaterialManifest(format)).toThrowError('MATERIAL_BINDING_FORMAT_POLICY_INVALID')

    const dataContract = validManifest()
    dataContract.common.binding = { kind: 'ports', ports: [], dataContract: {} as never }
    expect(() => defineMaterialManifest(dataContract)).toThrowError('MATERIAL_BINDING_DATA_CONTRACT_INVALID')
  })

  it('fully validates material data-contract fields', () => {
    const createInput = (field: Record<string, unknown>) => {
      const input = validManifest()
      input.common.binding = {
        kind: 'ports',
        ports: [],
        dataContract: {
          version: 3,
          model: { kind: 'tabular', fields: { value: field as never } },
        },
      }
      return input
    }

    expect(() => defineMaterialManifest(createInput({}))).toThrowError('MATERIAL_BINDING_DATA_CONTRACT_INVALID')
    expect(() => defineMaterialManifest(createInput({ labelKey: 'value', type: 'script' }))).toThrowError('MATERIAL_BINDING_DATA_CONTRACT_INVALID')
    expect(() => defineMaterialManifest(createInput({ labelKey: 'value', type: 'string', required: 'yes' }))).toThrowError('MATERIAL_BINDING_DATA_CONTRACT_INVALID')
    expect(() => defineMaterialManifest(createInput({ labelKey: 'value', type: 'string', format: 'preset' }))).toThrowError('MATERIAL_BINDING_DATA_CONTRACT_INVALID')
    expect(() => defineMaterialManifest(createInput({
      labelKey: 'value',
      type: 'string',
      format: 'display',
      formatEditor: { tabs: ['custom'], defaultTab: 'custom' },
    }))).toThrowError('MATERIAL_BINDING_DATA_CONTRACT_INVALID')
    expect(() => defineMaterialManifest(createInput({
      labelKey: 'value',
      type: 'string',
      format: 'display',
      formatEditor: { tabs: ['preset'], presetTypes: ['script'] },
    }))).toThrowError('MATERIAL_BINDING_DATA_CONTRACT_INVALID')
    expect(() => defineMaterialManifest(createInput({
      labelKey: 'value',
      type: 'string',
      format: 'raw',
      formatEditor: { tabs: ['preset'] },
    }))).toThrowError('MATERIAL_BINDING_DATA_CONTRACT_INVALID')
    expect(() => defineMaterialManifest(createInput({
      labelKey: 'materials.value',
      type: 'string',
      required: true,
      format: 'display',
      formatEditor: { tabs: ['preset'], defaultTab: 'preset', presetTypes: ['number'] },
    }))).not.toThrow()
  })

  it('requires convertible adapters to provide explicit private-model conversion', () => {
    const input = validManifest()
    input.schemaAdapter = {
      ...recordSchemaAdapter(1),
      modelUnitPolicy: 'convertible',
    }

    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_ADAPTER_UNIT_CONVERSION_REQUIRED')
  })

  it('forbids converters on independent model-unit adapters', () => {
    const input = validManifest()
    input.schemaAdapter = { ...recordSchemaAdapter(1), convertModelUnits: model => ({ ...model }) }

    expect(() => defineMaterialManifest(input)).toThrowError('MATERIAL_ADAPTER_UNIT_CONVERSION_FORBIDDEN')
  })

  it('requires a complete continuous migration chain', () => {
    const empty = validManifest()
    empty.schemaAdapter = { ...recordSchemaAdapter(1), migrations: [] }
    expect(() => defineMaterialManifest(empty)).toThrowError('MATERIAL_ADAPTER_MIGRATIONS_INVALID')

    const malformed = validManifest()
    malformed.schemaAdapter = {
      ...recordSchemaAdapter(1),
      migrations: [null as never],
    }
    expect(() => defineMaterialManifest(malformed)).toThrowError('MATERIAL_ADAPTER_MIGRATIONS_INVALID')

    const skipped = validManifest()
    skipped.schemaAdapter = {
      ...recordSchemaAdapter(1),
      migrations: [{ from: 0, to: 2, migrate: 'migrate' as never }],
    }
    expect(() => defineMaterialManifest(skipped)).toThrowError('MATERIAL_ADAPTER_MIGRATIONS_INVALID')
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

    const malformedList = validManifest()
    malformedList.facets = { ai: { generation: { enabled: false, examples: [], requiredModelPaths: 'color' as never } } }
    expect(() => defineMaterialManifest(malformedList)).toThrowError('MATERIAL_AI_MODEL_PATH_INVALID')
  })

  it('validates facet factories and preset allowlists', () => {
    const facet = validManifest({ facets: { designer: {} as never } })
    expect(() => defineMaterialManifest(facet)).toThrowError('MATERIAL_FACET_FACTORY_INVALID')

    const preset = validManifest()
    preset.common.binding = {
      kind: 'ports',
      ports: [{
        id: 'label',
        key: { kind: 'exact', value: 'label' },
        role: 'display',
        valueShape: 'scalar',
        modelPath: '/model/label',
        formatEditor: { tabs: ['preset'], presetTypes: ['script' as never] },
      }],
    }
    expect(() => defineMaterialManifest(preset)).toThrowError('MATERIAL_BINDING_FORMAT_POLICY_INVALID')
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

  it('requires AI portable schemas and examples to be JSON objects', () => {
    const missing = validManifest()
    missing.facets = { ai: null as never }
    expect(() => defineMaterialManifest(missing)).toThrowError('MATERIAL_AI_GENERATION_INVALID')

    const schema = validManifest()
    schema.facets = { ai: { generation: { enabled: false, modelSchema: [] as never, examples: [] } } }
    expect(() => defineMaterialManifest(schema)).toThrowError('MATERIAL_AI_GENERATION_INVALID')

    const example = validManifest()
    example.facets = { ai: { generation: { enabled: false, examples: [1 as never] } } }
    expect(() => defineMaterialManifest(example)).toThrowError('MATERIAL_AI_GENERATION_INVALID')
  })
})

describe('material binding value policies', () => {
  it.each([
    ['scalar', null],
    ['scalar', 'value'],
    ['record', { value: 1 }],
    ['record-array', [{ value: 1 }]],
    ['json', [1, { nested: true }]],
  ] as const)('accepts %s values', (shape, value) => {
    expect(() => assertMaterialBindingValue(value, shape)).not.toThrow()
  })

  it.each([
    ['scalar', { value: 1 }],
    ['record', []],
    ['record-array', [1]],
    ['json', undefined],
  ] as const)('rejects invalid %s values', (shape, value) => {
    expect(() => assertMaterialBindingValue(value, shape)).toThrowError('MATERIAL_BINDING_VALUE_INVALID')
  })

  it('rejects accessor-backed values', () => {
    const value = {}
    Object.defineProperty(value, 'secret', { enumerable: true, get: () => 'value' })

    expect(() => assertMaterialBindingValue(value, 'record')).toThrowError('MATERIAL_BINDING_VALUE_INVALID')
  })

  it('rejects unknown value-shape tokens', () => {
    expect(() => assertMaterialBindingValue(null, 'collection' as never)).toThrowError('MATERIAL_BINDING_VALUE_SHAPE_INVALID')
  })

  it('resolves exactly one policy and validates its raw value shape', () => {
    const definition = {
      kind: 'ports',
      ports: [
        { id: 'title', key: { kind: 'exact', value: 'title' }, role: 'display', valueShape: 'scalar', modelPath: '/model/title', formatEditor: false },
        { id: 'series', key: { kind: 'prefix', value: 'series-' }, role: 'semantic', valueShape: 'record-array', formatEditor: false },
      ],
    } as const

    expect(resolveMaterialBindingPortPolicy(definition, 'series-sales', [{ value: 1 }]).id).toBe('series')
    expect(() => resolveMaterialBindingPortPolicy(definition, 'missing', null)).toThrowError('MATERIAL_BINDING_POLICY_UNMATCHED')
    expect(() => resolveMaterialBindingPortPolicy(definition, 'series-sales', 1)).toThrowError('MATERIAL_BINDING_VALUE_INVALID')
    expect(() => resolveMaterialBindingPortPolicy({
      kind: 'ports',
      ports: [definition.ports[1], { ...definition.ports[1], id: 'duplicate' }],
    }, 'series-sales', [])).toThrowError('MATERIAL_BINDING_POLICY_AMBIGUOUS')
  })

  it('resolves binding keys declared by exact and wildcard model paths', () => {
    const definition = {
      kind: 'ports',
      ports: [
        { id: 'collection', key: { kind: 'model', paths: ['/data/collectionPort'] }, role: 'semantic', valueShape: 'record-array', formatEditor: false },
        { id: 'cell', key: { kind: 'model', paths: ['/bands/*/rows/*/cells/*/content/bindingPort'] }, role: 'display', valueShape: 'scalar', modelPath: '/model/bands', formatEditor: false },
      ],
    } as const
    const model = {
      data: { collectionPort: 'orders' },
      bands: [{ rows: [{ cells: [{ content: { bindingPort: 'detail:name' } }] }] }],
    }

    expect(resolveMaterialBindingPortPolicyDefinition(definition, 'orders', model).id).toBe('collection')
    expect(resolveMaterialBindingPortPolicyDefinition(definition, 'detail:name', model).id).toBe('cell')
    expect(() => resolveMaterialBindingPortPolicyDefinition(definition, 'missing', model))
      .toThrowError('MATERIAL_BINDING_POLICY_UNMATCHED')
    expect(() => assertCanonicalMaterialBindingMap(definition, {
      'orders': { sourceId: 'invoice', fieldPath: 'orders' },
      'detail:name': { sourceId: 'invoice', fieldPath: 'orders/name' },
    }, model)).not.toThrow()
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
