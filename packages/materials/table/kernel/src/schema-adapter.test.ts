import type { AdaptableMaterialNode, SchemaAdapterContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableModel } from './model'
import { cloneJsonValue, convertUnit } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import { createTableModel } from './model'
import { tableSchemaAdapter } from './schema-adapter'

const context: SchemaAdapterContext = {
  documentVersion: '1.0.0',
  sourceUnit: 'mm',
  documentUnit: 'mm',
  materialType: 'table-static',
}

function node(model: TableModel = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })): AdaptableMaterialNode {
  return {
    id: 'node',
    type: 'table-static',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: model as unknown as Record<string, never>,
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

describe('table schema adapter', () => {
  it('normalizes idempotently without leaking legacy table state', () => {
    const source = { ...node(), table: { old: true } } as AdaptableMaterialNode
    const once = tableSchemaAdapter.normalize(source, context)
    const twice = tableSchemaAdapter.normalize(once, context)
    expect(twice).toEqual(once)
    expect(once).not.toBe(source)
    expect((once as any).table).toBeUndefined()
    expect((once.model as any).table).toBeUndefined()
  })

  it('reports topology, kind, slot, orphan binding, and scalar binding errors at stable paths', () => {
    const duplicate = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    duplicate.columns[1]!.id = duplicate.columns[0]!.id
    expect(tableSchemaAdapter.validate(node(duplicate), context)).toContainEqual(expect.objectContaining({ code: 'TABLE_MODEL_INVALID', path: '/model' }))

    const materials = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const cell = materials.bands[0]!.rows[0]!.cells[0]!
    cell.content = { kind: 'materials', slotId: `cell:${cell.id}` }
    expect(tableSchemaAdapter.validate(node(materials), context)).toContainEqual(expect.objectContaining({ code: 'TABLE_SLOT_MISSING' }))

    const bindings = node()
    bindings.bindings = { orphan: [{ sourceId: 's', fieldPath: 'x' }] } as any
    const issues = tableSchemaAdapter.validate(bindings, context)
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TABLE_BINDING_ORPHAN', path: '/bindings/orphan' }),
      expect.objectContaining({ code: 'TABLE_BINDING_SCALAR_REQUIRED', path: '/bindings/orphan' }),
    ]))

    expect(tableSchemaAdapter.validate({ ...node(), type: 'table-data' }, context))
      .toContainEqual(expect.objectContaining({ code: 'TABLE_MODEL_KIND_MISMATCH', path: '/model/kind' }))
  })

  it('rejects semantic port collisions without normalizing them away', () => {
    const model = createTableModel({ kind: 'data', columnCount: 1, rowCount: 1 })
    model.data.detailKeyPort = model.data.collectionPort
    const input = node(model)
    input.type = 'table-data'
    const dataContext = { ...context, materialType: 'table-data' }

    expect(tableSchemaAdapter.validateInput(input, dataContext)).toEqual([expect.objectContaining({
      code: 'TABLE_MODEL_STRUCTURE_INVALID',
      path: '/model/data/detailKeyPort',
    })])
    const normalized = tableSchemaAdapter.normalize(input, dataContext)
    expect((normalized.model as any).data).toEqual({ collectionPort: 'records', detailKeyPort: 'records' })
    expect(tableSchemaAdapter.validate(normalized, dataContext)).toEqual([expect.objectContaining({
      code: 'TABLE_MODEL_STRUCTURE_INVALID',
      path: '/model/data/detailKeyPort',
    })])
  })

  it('admits only table root ids that fit the DOM identity component contract', () => {
    const valid = node()
    valid.id = 'x'.repeat(256)
    expect(tableSchemaAdapter.validateInput(valid, context)).toEqual([])

    for (const id of ['x'.repeat(257), '\uD800']) {
      const invalid = node()
      invalid.id = id
      expect(tableSchemaAdapter.validateInput(invalid, context)).toContainEqual({
        code: 'TABLE_NODE_ID_INVALID',
        severity: 'error',
        path: '/id',
        message: expect.stringMatching(/UTF-8|UTF-16|256/i),
      })
      const normalized = tableSchemaAdapter.normalize(invalid, context)
      expect(normalized.id).toBe(id)
      expect(tableSchemaAdapter.validate(normalized, context)).toContainEqual(expect.objectContaining({
        code: 'TABLE_NODE_ID_INVALID',
        path: '/id',
      }))
    }
  })

  it('introspects dynamic cells, references, named bindings, and fonts', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const cell = model.bands[0]!.rows[0]!.cells[0]!
    cell.content = { kind: 'materials', slotId: `cell:${cell.id}` }
    cell.style = { typography: { fontFamily: 'Inter' } }
    const input = node(model) as MaterialNode
    input.slots = { [`cell:${cell.id}`]: [] }
    const result = tableSchemaAdapter.introspect(input, context)
    expect(result.structures).toContainEqual(expect.objectContaining({ slot: `cell:${cell.id}`, policyId: 'table-cell-free', coordinateSpace: 'slot' }))
    expect(result.resources).toContainEqual(expect.objectContaining({ kind: 'font', value: 'Inter' }))
    expect(result.identities.map(entry => entry.value)).toEqual(expect.arrayContaining([cell.id, model.columns[0]!.id]))
    expect(result.references).toContainEqual(expect.objectContaining({
      path: '/model/bands/0/rows/0/cells/0/content/slotId',
      value: cell.id,
    }))
  })

  it('admits the complete detached snapshot before producing introspection claims', () => {
    const empty = { identities: [], structures: [], references: [], resources: [], bindings: [] }

    const duplicate = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    duplicate.columns[1]!.id = duplicate.columns[0]!.id
    expect(tableSchemaAdapter.introspect(node(duplicate) as MaterialNode, context)).toEqual(empty)

    const missingSlot = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const cell = missingSlot.bands[0]!.rows[0]!.cells[0]!
    cell.content = { kind: 'materials', slotId: `cell:${cell.id}` }
    expect(tableSchemaAdapter.introspect(node(missingSlot) as MaterialNode, context)).toEqual(empty)

    const orphanSlot = node() as MaterialNode
    orphanSlot.slots = { 'cell:orphan': [] }
    expect(tableSchemaAdapter.introspect(orphanSlot, context)).toEqual(empty)

    const orphanBinding = node() as MaterialNode
    orphanBinding.bindings = { orphan: { sourceId: 'source', fieldPath: 'value' } }
    expect(tableSchemaAdapter.introspect(orphanBinding, context)).toEqual(empty)

    const invalidBinding = node() as MaterialNode
    invalidBinding.bindings = { orphan: { sourceId: '', fieldPath: 'value' } }
    expect(tableSchemaAdapter.introspect(invalidBinding, context)).toEqual(empty)

    const data = createTableModel({ kind: 'data', columnCount: 1, rowCount: 1 })
    expect(tableSchemaAdapter.introspect(node(data as any) as MaterialNode, context)).toEqual(empty)
  })

  it('re-admits a stateful model descriptor within the introspection stage', () => {
    const valid = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const duplicate = cloneJsonValue(valid as any)
    duplicate.columns[1].id = duplicate.columns[0].id
    const source = node(valid)
    let modelDescriptors = 0
    const stateful = new Proxy(source, {
      getOwnPropertyDescriptor(target, key) {
        if (key === 'model') {
          modelDescriptors += 1
          return {
            value: modelDescriptors === 1 ? valid : duplicate,
            enumerable: true,
            configurable: true,
            writable: true,
          }
        }
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    expect(tableSchemaAdapter.validate(stateful, context)).toEqual([])
    expect(tableSchemaAdapter.introspect(stateful as MaterialNode, context)).toEqual({
      identities: [],
      structures: [],
      references: [],
      resources: [],
      bindings: [],
    })
    expect(modelDescriptors).toBe(2)
  })

  it('converts every physical model length while preserving ratios and line height', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    model.columns[0]!.track = { kind: 'fixed', size: 10, min: 2, max: 20 }
    model.bands[0]!.rows[0]!.minHeight = 4
    model.style = {
      padding: { top: 1 },
      typography: { fontSize: 3, letterSpacing: 0.5, lineHeight: 1.2 },
      border: { blockStart: { width: 0.2, style: 'solid', color: '#000' } },
    }
    const converted = tableSchemaAdapter.convertModelUnits!(model as any, 'mm', 'px') as any
    expect(converted).not.toBe(model)
    expect(converted.columns[0].track.size).toBe(convertUnit(10, 'mm', 'px'))
    expect(converted.bands[0].rows[0].minHeight).toBe(convertUnit(4, 'mm', 'px'))
    expect(converted.style.padding.top).toBe(convertUnit(1, 'mm', 'px'))
    expect(converted.style.typography.fontSize).toBe(convertUnit(3, 'mm', 'px'))
    expect(converted.style.typography.letterSpacing).toBe(convertUnit(0.5, 'mm', 'px'))
    expect(converted.style.typography.lineHeight).toBe(1.2)
    expect(converted.style.border.blockStart.width).toBe(convertUnit(0.2, 'mm', 'px'))
    expect(cloneJsonValue(model as any)).toEqual(model)
  })

  it('uses the bands path for an invalid second detail template', () => {
    const model = createTableModel({ kind: 'data', columnCount: 1, rowCount: 1 })
    model.bands.push(cloneJsonValue(model.bands[0] as any))
    model.bands[1]!.id = 'second-detail' as any
    model.bands[1]!.rows[0]!.id = 'second-row' as any
    model.bands[1]!.rows[0]!.cells[0]!.id = 'second-cell' as any
    expect(tableSchemaAdapter.validate(node(model as any), { ...context, materialType: 'table-data' }))
      .toContainEqual(expect.objectContaining({ code: 'TABLE_MODEL_INVALID', path: '/model/bands' }))
  })

  it('fails closed on binding accessors without invoking them', () => {
    const input = node()
    let reads = 0
    const bindings = {}
    Object.defineProperty(bindings, 'danger', {
      enumerable: true,
      get() {
        reads += 1
        return { sourceId: 'source', fieldPath: 'value' }
      },
    })
    input.bindings = bindings
    expect(tableSchemaAdapter.validate(input, context)).toContainEqual(expect.objectContaining({
      code: 'TABLE_BINDING_INVALID',
      path: '/bindings',
    }))
    expect(reads).toBe(0)
  })

  it('validates binding keys and canonical scalar expression structure', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    model.bands[0]!.rows[0]!.cells[0]!.content = { kind: 'text', text: '', bindingPort: 'value' }
    const input = node(model)
    let reads = 0
    const accessorExpression = { sourceId: 'source' } as Record<string, unknown>
    Object.defineProperty(accessorExpression, 'fieldPath', {
      enumerable: true,
      get() {
        reads += 1
        return 'value'
      },
    })
    input.bindings = {
      'bad ~/port': { sourceId: 'source', fieldPath: 'value' },
      'empty-source': { sourceId: '', fieldPath: 'value' },
      'empty-path': { sourceId: 'source', fieldPath: '' },
      'unknown': { sourceId: 'source', fieldPath: 'value', surprise: true },
      'value': accessorExpression,
    } as any
    const issues = tableSchemaAdapter.validate(input, context)
    expect(issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TABLE_BINDING_PORT_INVALID', path: '/bindings/bad ~0~1port' }),
      expect.objectContaining({ code: 'TABLE_BINDING_INVALID', path: '/bindings/empty-source' }),
      expect.objectContaining({ code: 'TABLE_BINDING_INVALID', path: '/bindings/empty-path' }),
      expect.objectContaining({ code: 'TABLE_BINDING_INVALID', path: '/bindings/unknown' }),
      expect.objectContaining({ code: 'TABLE_BINDING_INVALID', path: '/bindings/value' }),
    ]))
    expect(reads).toBe(0)

    const inspected = tableSchemaAdapter.introspect(input as MaterialNode, context)
    expect(inspected.bindings).toEqual([])
    expect(reads).toBe(0)

    const mapAccessorNode = node(model) as MaterialNode
    const mapAccessor = {}
    Object.defineProperty(mapAccessor, 'value', {
      enumerable: true,
      get() {
        reads += 1
        return { sourceId: 'source', fieldPath: 'value' }
      },
    })
    mapAccessorNode.bindings = mapAccessor
    expect(tableSchemaAdapter.introspect(mapAccessorNode, context).bindings).toEqual([])
    expect(reads).toBe(0)
  })

  it('accepts and introspects a canonical binding expression with optional fields', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    model.bands[0]!.rows[0]!.cells[0]!.content = { kind: 'text', text: '', bindingPort: 'value' }
    const input = node(model)
    input.bindings = {
      value: {
        sourceId: 'source',
        sourceName: 'Source',
        fieldPath: 'record/value',
        fieldKey: 'value',
        required: true,
        format: {
          mode: 'preset',
          preset: { type: 'number', minimumFractionDigits: 2 },
          fallback: '-',
        },
        extensions: { owner: 'table' },
      },
    }
    expect(tableSchemaAdapter.validate(input, context)).toEqual([])
    expect(tableSchemaAdapter.introspect(input as MaterialNode, context).bindings)
      .toContainEqual(expect.objectContaining({ port: 'value', path: '/bindings/value' }))
  })

  it('mirrors canonical binding whitespace, length, and preset fraction rules', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    model.bands[0]!.rows[0]!.cells[0]!.content = { kind: 'text', text: '', bindingPort: 'value' }

    const long = node(model)
    long.bindings = { value: { sourceId: 's'.repeat(16_385), fieldPath: 'value' } }
    expect(tableSchemaAdapter.validate(long, context)).toEqual([])
    expect(tableSchemaAdapter.introspect(long as MaterialNode, context).bindings).toHaveLength(1)

    for (const expression of [
      { sourceId: ' source', fieldPath: 'value' },
      { sourceId: 'source', fieldPath: 'value ' },
      {
        sourceId: 'source',
        fieldPath: 'value',
        format: {
          mode: 'preset',
          preset: { type: 'number', minimumFractionDigits: 3, maximumFractionDigits: 2 },
        },
      },
    ]) {
      const input = node(model)
      input.bindings = { value: expression as any }
      expect(tableSchemaAdapter.validate(input, context)).toContainEqual(expect.objectContaining({
        code: 'TABLE_BINDING_INVALID',
        path: '/bindings/value',
      }))
      expect(tableSchemaAdapter.introspect(input as MaterialNode, context).bindings).toEqual([])
    }
  })

  it('bounds hostile envelope maps before and during descriptor capture', () => {
    const entries = Object.fromEntries(Array.from({ length: 100_000 }, (_, index) => [
      `orphan:${index}`,
      { sourceId: 'source', fieldPath: 'value' },
    ]))
    let descriptors = 0
    let gets = 0
    const bindings = new Proxy(entries, {
      getOwnPropertyDescriptor(target, key) {
        descriptors += 1
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
      get(target, key, receiver) {
        gets += 1
        return Reflect.get(target, key, receiver)
      },
    })
    const input = node()
    input.bindings = bindings
    const issues = tableSchemaAdapter.validate(input, context)
    expect(issues.length).toBeLessThanOrEqual(256)
    expect(issues).toContainEqual(expect.objectContaining({ code: 'TABLE_ENVELOPE_ISSUES_TRUNCATED' }))
    expect(descriptors).toBeLessThanOrEqual(100_000)
    expect(gets).toBe(0)

    descriptors = 0
    const oversized = new Proxy({ ...entries, extra: { sourceId: 'source', fieldPath: 'value' } }, {
      getOwnPropertyDescriptor(target, key) {
        descriptors += 1
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    input.bindings = oversized
    expect(tableSchemaAdapter.validate(input, context)).toContainEqual(expect.objectContaining({
      code: 'TABLE_ENVELOPE_BUDGET_EXCEEDED',
      path: '/bindings',
    }))
    expect(descriptors).toBe(0)
  })

  it('introspects one detached descriptor-safe envelope snapshot', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const cell = model.bands[0]!.rows[0]!.cells[0]!
    cell.content = { kind: 'materials', slotId: `cell:${cell.id}` }
    const child = node() as MaterialNode
    let gets = 0
    const children = new Proxy([child], {
      get(target, key, receiver) {
        gets += 1
        return Reflect.get(target, key, receiver)
      },
    })
    const slots = new Proxy({ [`cell:${cell.id}`]: children }, {
      get(target, key, receiver) {
        gets += 1
        return Reflect.get(target, key, receiver)
      },
    })
    const source = node(model) as MaterialNode
    source.slots = slots
    const hostile = new Proxy(source, {
      get(target, key, receiver) {
        gets += 1
        return Reflect.get(target, key, receiver)
      },
    })
    const result = tableSchemaAdapter.introspect(hostile, context)
    expect(gets).toBe(0)
    expect(result.structures).toContainEqual(expect.objectContaining({
      slot: `cell:${cell.id}`,
      children: [child],
    }))

    let modelReads = 0
    Object.defineProperty(source, 'model', {
      enumerable: true,
      get() {
        modelReads += 1
        return model
      },
    })
    expect(tableSchemaAdapter.introspect(source, context)).toEqual({
      identities: [],
      structures: [],
      references: [],
      resources: [],
      bindings: [],
    })
    expect(modelReads).toBe(0)
  })

  it('rejects unknown units and non-finite conversion results', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    expect(() => tableSchemaAdapter.convertModelUnits!(model as any, 'cm' as any, 'px')).toThrow(/TABLE_MODEL_UNIT_INVALID/)
    model.columns[0]!.track = { kind: 'fixed', size: Number.MAX_VALUE }
    expect(() => tableSchemaAdapter.convertModelUnits!(model as any, 'mm', 'px')).toThrow(/TABLE_MODEL_UNIT_CONVERSION_INVALID/)
  })
})
