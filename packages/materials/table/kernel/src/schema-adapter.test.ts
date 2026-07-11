import type { AdaptableMaterialNode, SchemaAdapterContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
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

function node(model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })): AdaptableMaterialNode {
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
})
