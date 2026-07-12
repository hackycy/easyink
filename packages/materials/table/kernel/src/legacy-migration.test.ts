import type { AdaptableMaterialNode, SchemaAdapterContext } from '@easyink/core'
import { loadDocumentWithProfile } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { cloneJsonValue } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import { migrateLegacyTableV0ToV1, validateLegacyTableV0Input } from './legacy-migration'
import { assertValidTableModel } from './model'
import { tableSchemaAdapter } from './schema-adapter'

const context: SchemaAdapterContext = {
  documentVersion: '1.0.0',
  sourceUnit: 'mm',
  documentUnit: 'mm',
  materialType: 'table-static',
}

function legacy(type = 'table-static'): AdaptableMaterialNode {
  return {
    id: 'legacy/table node',
    type,
    x: 1,
    y: 2,
    width: 100,
    height: 20,
    rotation: 0,
    alpha: 1,
    zIndex: 3,
    modelVersion: 0,
    model: {
      borderWidth: 1,
      borderColor: '#123456',
      borderType: 'dashed',
      cellPadding: 2,
      table: {
        kind: type === 'table-data' ? 'data' : 'static',
        topology: {
          columns: [{ ratio: 2 }, { ratio: 1 }],
          rows: [{
            height: 8,
            ...(type === 'table-data' ? { role: 'repeat-template' } : {}),
            cells: [
              {
                colSpan: 2,
                padding: { top: 1, right: 2, bottom: 3, left: 4 },
                typography: { fontSize: 10, textAlign: 'center', verticalAlign: 'middle' },
                content: { text: 'fallback', elements: [{ id: 'child', type: 'text', x: 0, y: 0, width: 1, height: 1, modelVersion: 1, model: {}, slots: {}, bindings: {}, output: { visibility: 'include' } }] },
                binding: { sourceId: 'binding', fieldPath: 'binding' },
                staticBinding: { sourceId: 'static', fieldPath: 'value' },
              },
              { content: { text: 'covered' } },
            ],
          }],
        },
      },
    },
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
    compat: { vendor: { keep: true } },
  }
}

describe('legacy table v0 migration', () => {
  it('losslessly migrates materials, static binding, styles, merge topology, and raw compat', () => {
    const source = legacy()
    const before = cloneJsonValue(source as any)
    expect(validateLegacyTableV0Input(source, context)).toEqual([])
    const migrated = migrateLegacyTableV0ToV1.migrate(source, context)
    const model = migrated.model as any
    expect(migrated.modelVersion).toBe(1)
    expect(model.kind).toBe('static')
    expect(model).not.toHaveProperty('data')
    expect(model.columns.map((column: any) => column.track.weight)).toEqual([2, 1])
    expect(model.bands[0].role).toBe('body')
    const cells = model.bands[0].rows[0].cells
    expect(cells[0].content).toEqual({ kind: 'materials', slotId: `cell:${cells[0].id}` })
    expect((migrated.slots as any)[`cell:${cells[0].id}`][0].id).toBe('child')
    expect((migrated.slots as any)[`cell:${cells[0].id}`]).not.toBe((source.model as any).table.topology.rows[0].cells[0].content.elements)
    expect(migrated.bindings).toEqual({})
    expect((migrated.compat as any).materials['table-static'].v0.table.topology.rows[0].cells[0].staticBinding)
      .toEqual({ sourceId: 'static', fieldPath: 'value' })
    expect(cells[0].style).toMatchObject({ padding: { top: 1, right: 2, bottom: 3, left: 4 }, typography: { fontSize: 10, textAlign: 'center', verticalAlign: 'middle' } })
    expect(model.style).toMatchObject({ padding: { top: 2, right: 2, bottom: 2, left: 2 }, border: { blockStart: { width: 1, style: 'dashed', color: '#123456' } } })
    expect(model.merges[0]).toMatchObject({ anchorCellId: cells[0].id, inactiveCellIds: [cells[1].id] })
    expect(cells[1].content).toEqual({ kind: 'text', text: 'covered' })
    expect((migrated.compat as any).vendor).toEqual({ keep: true })
    expect((migrated.compat as any).materials['table-static'].v0).toEqual(before.model)
    expect(source).toEqual(before)
    expect(() => assertValidTableModel(model)).not.toThrow()
    expect(tableSchemaAdapter.validate(migrated, context)).toEqual([])
    expect(JSON.parse(JSON.stringify(migrated))).toEqual(migrated)
  })

  it('migrates a binding-only text cell to a canonical scalar port with static precedence', () => {
    const source = legacy()
    const cell = (source.model as any).table.topology.rows[0].cells[0]
    cell.content = { text: 'bound' }
    cell.colSpan = 1
    const migrated = migrateLegacyTableV0ToV1.migrate(source, context)
    const canonicalCell = (migrated.model as any).bands[0].rows[0].cells[0]
    expect(canonicalCell.content).toEqual({ kind: 'text', text: 'bound', bindingPort: `cell:${canonicalCell.id}:value` })
    expect((migrated.bindings as any)[canonicalCell.content.bindingPort]).toEqual({ sourceId: 'static', fieldPath: 'value' })
    expect(tableSchemaAdapter.validate(migrated, context)).toEqual([])
  })

  it('migrates root table typography with field-level table and layout precedence', () => {
    const source = legacy()
    ;(source.model as any).typography = {
      fontFamily: 'Root Sans',
      fontSize: 9,
      color: '#111111',
      fontWeight: 'bold',
      fontStyle: 'italic',
      lineHeight: 1.4,
      letterSpacing: 0.2,
      textAlign: 'left',
      verticalAlign: 'bottom',
    }
    ;(source.model as any).table.typography = { color: '#222222', textAlign: 'right' }
    ;(source.model as any).table.layout = { typography: { fontSize: 11 } }
    const migrated = migrateLegacyTableV0ToV1.migrate(source, context)
    expect((migrated.model as any).style.typography).toEqual({
      fontFamily: 'Root Sans',
      fontSize: 11,
      color: '#222222',
      fontWeight: 'bold',
      fontStyle: 'italic',
      lineHeight: 1.4,
      letterSpacing: 0.2,
      textAlign: 'end',
      verticalAlign: 'bottom',
    })
    expect((migrated.compat as any).materials['table-static'].v0.typography.textAlign).toBe('left')
    expect(JSON.parse(JSON.stringify(migrated))).toEqual(migrated)
    expect(tableSchemaAdapter.validate(migrated, context)).toEqual([])
  })

  it('maps mixed physical cell border visibility to exact logical edges without losing other cell styles', () => {
    const source = legacy()
    const cell = (source.model as any).table.topology.rows[0].cells[0]
    cell.border = { top: true, right: false, bottom: true, left: false }
    const migrated = migrateLegacyTableV0ToV1.migrate(source, context)
    const style = (migrated.model as any).bands[0].rows[0].cells[0].style
    expect(style.padding).toEqual({ top: 1, right: 2, bottom: 3, left: 4 })
    expect(style.typography).toMatchObject({ fontSize: 10, textAlign: 'center' })
    expect(style.border).toEqual({
      blockStart: { width: 1, style: 'dashed', color: '#123456' },
      inlineEnd: { width: 0, style: 'none', color: '#123456' },
      blockEnd: { width: 1, style: 'dashed', color: '#123456' },
      inlineStart: { width: 0, style: 'none', color: '#123456' },
    })
    expect((migrated.compat as any).materials['table-static'].v0.table.topology.rows[0].cells[0].border).toEqual(cell.border)

    cell.border = { diagonal: true }
    expect(validateLegacyTableV0Input(source, context)).toContainEqual(expect.objectContaining({
      code: 'TABLE_LEGACY_STRUCTURE_INVALID',
      path: '/model/table/topology/rows/0/cells/0/border/diagonal',
    }))
    cell.border = { top: 'yes' }
    expect(validateLegacyTableV0Input(source, context)).toContainEqual(expect.objectContaining({
      code: 'TABLE_LEGACY_STRUCTURE_INVALID',
      path: '/model/table/topology/rows/0/cells/0/border/top',
    }))
  })

  it('is deterministic across object key order and generates globally unique bounded IDs', () => {
    const first = legacy()
    const second = cloneJsonValue(first as any) as AdaptableMaterialNode
    const cell = (second.model as any).table.topology.rows[0].cells[0]
    cell.content = { elements: cell.content.elements, text: cell.content.text }
    const a = migrateLegacyTableV0ToV1.migrate(first, context)
    const b = migrateLegacyTableV0ToV1.migrate(second, context)
    expect(a).toEqual(b)
    const model = a.model as any
    const ids = [
      ...model.columns.map((item: any) => item.id),
      ...model.bands.map((item: any) => item.id),
      ...model.bands.flatMap((band: any) => band.rows.flatMap((row: any) => [row.id, ...row.cells.map((item: any) => item.id)])),
      ...model.merges.map((item: any) => item.id),
    ]
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.every((id: string) => id.length <= 128)).toBe(true)
  })

  it('maps data roles and visibility while retaining the complete raw model', () => {
    const source = legacy('table-data')
    const table = (source.model as any).table
    table.showHeader = false
    table.showFooter = false
    table.topology.rows.unshift({ role: 'header', cells: [{}, {}] })
    table.topology.rows.push({ role: 'footer', cells: [{}, {}] })
    source.bindings = { value: { sourceId: 'source', fieldPath: 'rows' } }
    expect(validateLegacyTableV0Input(source, { ...context, materialType: 'table-data' })).toEqual([])
    const migrated = migrateLegacyTableV0ToV1.migrate(source, { ...context, materialType: 'table-data' })
    expect((migrated.model as any).bands.map((band: any) => band.role)).toEqual(['detail'])
    expect((migrated.model as any).data).toEqual({ collectionPort: 'value' })
    expect((migrated.compat as any).materials['table-data'].v0.table.topology.rows).toHaveLength(3)
  })

  it('rejects two detail templates and invalid spans before migration', () => {
    const data = legacy('table-data')
    ;(data.model as any).table.topology.rows.push({ role: 'repeat-template', cells: [{}, {}] })
    expect(validateLegacyTableV0Input(data, { ...context, materialType: 'table-data' }))
      .toContainEqual(expect.objectContaining({ code: 'TABLE_LEGACY_DETAIL_TEMPLATE_COUNT', path: '/model/table/topology/rows' }))

    const out = legacy()
    ;(out.model as any).table.topology.rows[0].cells[0].colSpan = 3
    expect(validateLegacyTableV0Input(out, context)).toContainEqual(expect.objectContaining({ path: '/model/table/topology/rows/0/cells/0/colSpan' }))

    const crossing = legacy('table-data')
    const rows = (crossing.model as any).table.topology.rows
    rows[0].role = 'header'
    rows[0].cells[0].rowSpan = 2
    rows.push({ role: 'repeat-template', cells: [{}, {}] })
    expect(validateLegacyTableV0Input(crossing, { ...context, materialType: 'table-data' }))
      .toContainEqual(expect.objectContaining({ path: '/model/table/topology/rows/0/cells/0/rowSpan' }))
  })

  it('converts row spans row-major and rejects an overlapping covered anchor', () => {
    const source = legacy()
    const rows = (source.model as any).table.topology.rows
    rows[0].cells[0].colSpan = 1
    rows[0].cells[0].rowSpan = 2
    rows.push({ height: 4, cells: [{ content: { text: 'inactive' } }, { content: { text: 'live' } }] })
    const migrated = migrateLegacyTableV0ToV1.migrate(source, context)
    const model = migrated.model as any
    expect(model.merges[0].rowIds).toHaveLength(2)
    expect(model.merges[0].inactiveCellIds).toEqual([model.bands[0].rows[1].cells[0].id])
    expect(model.bands[0].rows[1].cells[0].content.text).toBe('inactive')

    rows[1].cells[0].colSpan = 2
    expect(validateLegacyTableV0Input(source, context)).toContainEqual(expect.objectContaining({
      code: 'TABLE_LEGACY_MERGE_OVERLAP',
      path: '/model/table/topology/rows/1/cells/0/colSpan',
    }))
  })

  it('pre-rejects envelope collisions, orphan ports, and malformed scalar bindings', () => {
    const source = legacy()
    const first = migrateLegacyTableV0ToV1.migrate(source, context)
    const slot = Object.keys(first.slots!)[0]!
    source.slots = { [slot]: [] }
    expect(validateLegacyTableV0Input(source, context)).toContainEqual(expect.objectContaining({
      code: 'TABLE_LEGACY_ENVELOPE_COLLISION',
      path: `/slots/${slot}`,
    }))

    const orphan = legacy()
    orphan.bindings = { orphan: { sourceId: ' source', fieldPath: 'value' } }
    expect(validateLegacyTableV0Input(orphan, context)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TABLE_BINDING_ORPHAN', path: '/bindings/orphan' }),
      expect.objectContaining({ code: 'TABLE_BINDING_INVALID', path: '/bindings/orphan' }),
    ]))
  })

  it('snapshots proxies once without invoking their get trap', () => {
    const source = legacy()
    const rawTable = (source.model as any).table
    let gets = 0
    let ownKeys = 0
    ;(source.model as any).table = new Proxy(rawTable, {
      get() {
        gets += 1
        throw new Error('get trap must not run')
      },
      ownKeys(target) {
        ownKeys += 1
        return Reflect.ownKeys(target)
      },
    })
    expect(validateLegacyTableV0Input(source, context)).toEqual([])
    expect(gets).toBe(0)
    expect(ownKeys).toBe(1)
    migrateLegacyTableV0ToV1.migrate(source, context)
    expect(gets).toBe(0)
    expect(ownKeys).toBe(2)
  })

  it('fails closed on accessors without invoking them', () => {
    const source = legacy()
    let reads = 0
    Object.defineProperty((source.model as any).table, 'showHeader', {
      enumerable: true,
      get() {
        reads += 1
        return true
      },
    })
    expect(validateLegacyTableV0Input(source, context)).toContainEqual(expect.objectContaining({ path: '/model/table/showHeader' }))
    expect(reads).toBe(0)
  })

  it('is wired as the adapter 0 to 1 migration and dispatches input validation by version', () => {
    expect(tableSchemaAdapter.migrations).toEqual([migrateLegacyTableV0ToV1])
    expect(tableSchemaAdapter.validateInput(legacy(), context)).toEqual([])
    expect(tableSchemaAdapter.validateInput({ ...legacy(), modelVersion: 1 }, context)).not.toEqual([])
  })

  it('requires exact v0 admission and never reinterprets an already migrated node', () => {
    const source = legacy()
    source.modelVersion = 2
    expect(validateLegacyTableV0Input(source, context)).toContainEqual(expect.objectContaining({
      code: 'TABLE_LEGACY_VERSION_INVALID',
      path: '/model',
    }))
    expect(() => migrateLegacyTableV0ToV1.migrate(source, context)).toThrow(/TABLE_LEGACY_VERSION_INVALID/)
    const v0 = legacy()
    const v1 = migrateLegacyTableV0ToV1.migrate(v0, context)
    const before = cloneJsonValue(v1 as any)
    expect(() => migrateLegacyTableV0ToV1.migrate(v1, context)).toThrow(/TABLE_LEGACY_VERSION_INVALID/)
    expect(v1).toEqual(before)
  })

  it('pre-rejects malformed or colliding owned compat without losing other namespaces', () => {
    for (const compat of [
      'invalid',
      { materials: 'invalid' },
      { materials: { 'table-static': 'invalid' } },
    ]) {
      const source = legacy()
      source.compat = compat as any
      expect(validateLegacyTableV0Input(source, context)).toContainEqual(expect.objectContaining({
        code: 'TABLE_LEGACY_COMPAT_INVALID',
      }))
    }
    const collision = legacy()
    collision.compat = { vendor: { keep: true }, materials: { 'other': { keep: true }, 'table-static': { v0: { different: true } } } }
    expect(validateLegacyTableV0Input(collision, context)).toContainEqual(expect.objectContaining({
      code: 'TABLE_LEGACY_ENVELOPE_COLLISION',
      path: '/compat/materials/table-static/v0',
    }))
    const raw = cloneJsonValue(collision.model as any)
    collision.compat = { vendor: { keep: true }, materials: { 'other': { keep: true }, 'table-static': { v0: raw } } }
    const migrated = migrateLegacyTableV0ToV1.migrate(collision, context)
    expect(migrated.compat).toMatchObject({ vendor: { keep: true }, materials: { 'other': { keep: true }, 'table-static': { v0: raw } } })
  })

  it('migrates the complete canonical binding format surface', () => {
    for (const format of [
      { prefix: '$', suffix: ' USD', fallback: '-' },
      { mode: 'custom', custom: { source: '(value) => String(value)' }, prefix: '#' },
      { mode: 'preset', preset: { type: 'number', minimumFractionDigits: 1, maximumFractionDigits: 2 } },
    ]) {
      const source = legacy()
      const cell = (source.model as any).table.topology.rows[0].cells[0]
      cell.content = { text: 'bound' }
      cell.colSpan = 1
      cell.staticBinding.format = format
      const migrated = migrateLegacyTableV0ToV1.migrate(source, context)
      expect(Object.values(migrated.bindings!)[0]).toMatchObject({ format })
      expect(tableSchemaAdapter.validate(migrated, context)).toEqual([])
    }
    const invalid = legacy()
    const cell = (invalid.model as any).table.topology.rows[0].cells[0]
    cell.content = { text: 'bound' }
    cell.colSpan = 1
    cell.staticBinding.format = { mode: 'preset', preset: { type: 'number', minimumFractionDigits: 3, maximumFractionDigits: 2 } }
    expect(validateLegacyTableV0Input(invalid, context)).toContainEqual(expect.objectContaining({ code: 'TABLE_LEGACY_BINDING_INVALID' }))
  })

  it('caps hostile structure diagnostics and migrates a large grid with direct cell lookup', () => {
    const hostile = legacy()
    const topology = (hostile.model as any).table.topology
    topology.columns = Array.from({ length: 100 }, () => ({}))
    topology.rows = Array.from({ length: 100 }, () => ({
      cells: Array.from({ length: 100 }, () => ({ border: { top: 'invalid' } })),
    }))
    const issues = validateLegacyTableV0Input(hostile, context)
    expect(issues.length).toBeLessThanOrEqual(256)
    expect(issues.at(-1)).toMatchObject({ code: 'TABLE_LEGACY_ISSUES_TRUNCATED' })
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'table-static',
      schemaAdapter: tableSchemaAdapter,
    })])
    const loaded = loadDocumentWithProfile({
      unit: 'mm',
      page: { mode: 'fixed', width: 100, height: 100 },
      elements: [hostile as unknown as import('@easyink/schema').MaterialNodeInput],
    }, profile)
    expect(loaded.diagnostics).not.toContainEqual(expect.objectContaining({ code: 'MATERIAL_ADAPTER_ISSUES_INVALID' }))
    expect(loaded.nodeStates.get(hostile.id)).toMatchObject({ status: 'quarantined', stage: 'validate-input' })

    for (const row of topology.rows) {
      for (const entry of row.cells)
        delete entry.border
    }
    const migrated = migrateLegacyTableV0ToV1.migrate(hostile, context)
    expect((migrated.model as any).bands[0].rows).toHaveLength(100)
    expect((migrated.model as any).bands[0].rows[99].cells).toHaveLength(100)
  })

  it('loads an admitted v0 node through the core migration pipeline', () => {
    const source = legacy()
    const cell = (source.model as any).table.topology.rows[0].cells[0]
    cell.content = { text: 'bound' }
    cell.colSpan = 1
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'table-static',
      schemaAdapter: tableSchemaAdapter,
      binding: {
        kind: 'ports',
        ports: [{
          id: 'cells',
          key: { kind: 'prefix', value: 'cell:' },
          role: 'semantic',
          valueShape: 'scalar',
          formatEditor: false,
        }],
      },
    })])
    const result = loadDocumentWithProfile({
      unit: 'mm',
      page: { mode: 'fixed', width: 100, height: 100 },
      elements: [source as unknown as import('@easyink/schema').MaterialNodeInput],
    }, profile)
    expect(result.nodeStates.get(source.id)?.status).toBe('ready')
    expect(result.diagnostics).toEqual([])
    expect(result.schema.elements[0]).toMatchObject({ modelVersion: 1, model: { kind: 'static' } })
  })
})
