import type {
  RuntimeRowId,
  TableAccessibility,
  TableBandId,
  TableBorderStyle,
  TableCellId,
  TableColumnId,
  TableDataConfig,
  TableIdentityAllocator,
  TableInsets,
  TableMergeId,
  TableMergeRegion,
  TableModel,
  TableRowId,
  TableTypography,
} from './model'
import { describe, expect, it, vi } from 'vitest'
import {
  allocateTableIdentity,
  assertValidTableModel,
  createSequentialTableIdentityAllocator,
  createTableModel,
  encodeTableOpaqueIdPart,
  isValidTableStableToken,
} from './model'

type CanonicalIdAliases = TableBandId | TableRowId | TableColumnId | TableCellId | TableMergeId | RuntimeRowId
type CanonicalPublicShapes = TableMergeRegion | TableInsets | TableBorderStyle | TableDataConfig | TableAccessibility

function acceptCanonicalPublicApi(_id: CanonicalIdAliases, _shape: CanonicalPublicShapes): void {}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function expectInvalid(value: unknown, message?: RegExp): void {
  expect(() => assertValidTableModel(value)).toThrow(message)
}

describe('table identity allocation', () => {
  it('allocates stable distinct tokens and skips occupied values', () => {
    const allocator = createSequentialTableIdentityAllocator('report')
    const occupied = new Set<string>(['report:cell:1'])

    expect(allocateTableIdentity(allocator, 'cell', occupied)).toBe('report:cell:2')
    expect(allocateTableIdentity(allocator, 'cell', occupied)).toBe('report:cell:3')
    expect([...occupied]).toEqual(['report:cell:1', 'report:cell:2', 'report:cell:3'])
  })

  it('uses the canonical default namespace and exposes byte-limit validation', () => {
    const occupied = new Set<string>()
    expect(allocateTableIdentity(createSequentialTableIdentityAllocator(), 'cell', occupied)).toBe('default:cell:1')
    expect(isValidTableStableToken('ab', 2)).toBe(true)
    expect(isValidTableStableToken('ab', 1)).toBe(false)
    expect(isValidTableStableToken('ab', 0)).toBe(false)
    expect(acceptCanonicalPublicApi).toBeTypeOf('function')
  })

  it.each(['', 'has space', 'x'.repeat(129)])('rejects invalid allocator token %j', (token) => {
    const allocator: TableIdentityAllocator = { allocate: () => token }
    expect(() => allocateTableIdentity(allocator, 'row', new Set())).toThrow(/stable ID/i)
  })

  it('rejects a colliding allocator result and does not silently retry it', () => {
    const allocator: TableIdentityAllocator = { allocate: () => 'taken' }
    expect(() => allocateTableIdentity(allocator, 'band', new Set(['taken']))).toThrow(/duplicate/i)
  })

  it('encodes opaque values without delimiter or Unicode collisions', () => {
    const values = ['', ':', 'a:b', 'a', '\u00E9', '\uD83D\uDE00']
    const encoded = values.map(encodeTableOpaqueIdPart)
    expect(new Set(encoded).size).toBe(values.length)
    expect(encoded).toEqual(['0:', '1:3a', '3:613a62', '1:61', '2:c3a9', '4:f09f9880'])
  })
})

describe('createTableModel', () => {
  it('creates a stable JSON-compatible static model without a data property', () => {
    const first = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const second = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })

    expect(first).toEqual(second)
    expect(JSON.parse(JSON.stringify(first))).toEqual(first)
    expect(Object.hasOwn(first, 'data')).toBe(false)
    expect(first.columns).toHaveLength(2)
    expect(first.bands).toHaveLength(1)
    expect(first.bands[0]).toMatchObject({ role: 'body' })
    expect(first.bands[0]!.rows).toHaveLength(2)
    expect(first.columns.every(column => column.track.kind === 'fr' && column.track.weight === 1)).toBe(true)
    expect(first.bands[0]!.rows.every(row => row.minHeight === 8)).toBe(true)
    expect(first.bands[0]!.rows.flatMap(row => row.cells).every(cell => cell.content.kind === 'text' && cell.content.text === '')).toBe(true)
    expect(() => assertValidTableModel(first)).not.toThrow()
  })

  it('creates a data model with exactly one detail template row', () => {
    const model = createTableModel({ kind: 'data', columnCount: 3, rowCount: 1 })
    expect(model.data).toEqual({ collectionPort: 'records' })
    expect(model.bands).toHaveLength(1)
    expect(model.bands[0]).toMatchObject({ role: 'detail' })
    expect(model.bands[0]!.rows).toHaveLength(1)
  })

  it.each([
    { kind: 'static' as const, columnCount: 0, rowCount: 1 },
    { kind: 'static' as const, columnCount: 1, rowCount: Number.NaN },
    { kind: 'static' as const, columnCount: Number.MAX_SAFE_INTEGER + 1, rowCount: 1 },
    { kind: 'data' as const, columnCount: 1, rowCount: 2 },
  ])('validates counts before calling the allocator: %j', (input) => {
    const allocate = vi.fn(() => 'unused')
    expect(() => createTableModel(input, { allocate })).toThrow(/count|rowCount/i)
    expect(allocate).not.toHaveBeenCalled()
  })

  it('rejects an injected allocator collision', () => {
    const allocator: TableIdentityAllocator = { allocate: () => 'same' }
    expect(() => createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }, allocator)).toThrow(/duplicate/i)
  })
})

describe('assertValidTableModel', () => {
  it('rejects cross-kind globally duplicate IDs', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    model.bands[0]!.rows[0]!.id = model.columns[0]!.id as unknown as typeof model.bands[0]['rows'][0]['id']
    expectInvalid(model, /globally unique|duplicate/i)
  })

  it('rejects duplicate cells and missing coverage', () => {
    const missing = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    missing.bands[0]!.rows[0]!.cells.pop()
    expectInvalid(missing, /coverage/i)

    const duplicate = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    duplicate.bands[0]!.rows[0]!.cells[1]!.id = duplicate.bands[0]!.rows[0]!.cells[0]!.id
    expectInvalid(duplicate, /globally unique|duplicate/i)
  })

  it('rejects duplicate column coverage even when the cell IDs differ', () => {
    const model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    model.bands[0]!.rows[0]!.cells[1]!.columnId = model.columns[0]!.id
    expectInvalid(model, /coverage/i)
  })

  it('rejects invalid material slot keys and empty binding ports', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const cell = model.bands[0]!.rows[0]!.cells[0]!
    cell.content = { kind: 'materials', slotId: 'wrong' }
    expectInvalid(model, /slotId/i)

    cell.content = { kind: 'text', text: '', bindingPort: '' }
    expectInvalid(model, /bindingPort/i)

    cell.content = { kind: 'text', text: '', bindingPort: '  \t' }
    expectInvalid(model, /bindingPort/i)
  })

  it('accepts canonical partial padding, typography, accessibility, and data config', () => {
    const model = createTableModel({ kind: 'data', columnCount: 1, rowCount: 1 })
    const direction: TableTypography['direction'] = 'auto'
    model.style.padding = { left: 1 }
    model.style.typography = { fontWeight: 'bold', letterSpacing: 0, direction }
    model.accessibility = { caption: 'Orders', description: 'Order lines', decorative: false }
    model.data.detailKeyPort = 'recordId'
    expect(() => assertValidTableModel(model)).not.toThrow()
  })

  it('rejects non-canonical text alignment and overflow values', () => {
    const justified = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    justified.style.typography = { textAlign: 'justify' } as unknown as typeof justified.style.typography
    expectInvalid(justified, /typography/i)

    const hidden = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    hidden.style.overflow = 'hidden' as unknown as typeof hidden.style.overflow
    expectInvalid(hidden, /overflow/i)
  })

  it('rejects unknown and duplicate merge IDs', () => {
    const base = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const rows = base.bands[0]!.rows
    const columns = base.columns
    const anchor = rows[0]!.cells[0]!
    base.merges.push({
      id: 'merge:1' as typeof base.merges[number]['id'],
      rowIds: [rows[0]!.id],
      columnIds: [columns[0]!.id, 'unknown-column' as typeof columns[0]['id']],
      anchorCellId: anchor.id,
      inactiveCellIds: [],
    })
    expectInvalid(base, /unknown/i)

    const duplicate = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    duplicate.merges.push({
      id: duplicate.columns[0]!.id as unknown as typeof duplicate.merges[number]['id'],
      rowIds: [duplicate.bands[0]!.rows[0]!.id],
      columnIds: [duplicate.columns[0]!.id],
      anchorCellId: duplicate.bands[0]!.rows[0]!.cells[0]!.id,
      inactiveCellIds: [],
    })
    expectInvalid(duplicate, /globally unique|duplicate/i)
  })

  it('rejects unknown and duplicate merge row/column IDs', () => {
    const unknownRow = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    unknownRow.merges.push({
      id: 'merge:unknown-row' as typeof unknownRow.merges[number]['id'],
      rowIds: ['row:unknown' as typeof unknownRow.bands[number]['rows'][number]['id']],
      columnIds: [unknownRow.columns[0]!.id],
      anchorCellId: unknownRow.bands[0]!.rows[0]!.cells[0]!.id,
      inactiveCellIds: [],
    })
    expectInvalid(unknownRow, /unknown row/i)

    const duplicateRow = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const row = duplicateRow.bands[0]!.rows[0]!
    duplicateRow.merges.push({
      id: 'merge:duplicate-row' as typeof duplicateRow.merges[number]['id'],
      rowIds: [row.id, row.id],
      columnIds: [duplicateRow.columns[0]!.id],
      anchorCellId: row.cells[0]!.id,
      inactiveCellIds: [],
    })
    expectInvalid(duplicateRow, /row IDs.*duplicate/i)

    const duplicateColumn = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const column = duplicateColumn.columns[0]!
    duplicateColumn.merges.push({
      id: 'merge:duplicate-column' as typeof duplicateColumn.merges[number]['id'],
      rowIds: [duplicateColumn.bands[0]!.rows[0]!.id],
      columnIds: [column.id, column.id],
      anchorCellId: duplicateColumn.bands[0]!.rows[0]!.cells[0]!.id,
      inactiveCellIds: [],
    })
    expectInvalid(duplicateColumn, /column IDs.*duplicate/i)
  })

  it('accepts a canonical merge without bandId and rejects rows from different bands', () => {
    const model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const row = model.bands[0]!.rows[0]!
    model.merges.push({
      id: 'merge:canonical' as typeof model.merges[number]['id'],
      rowIds: [row.id],
      columnIds: model.columns.map(column => column.id),
      anchorCellId: row.cells[0]!.id,
      inactiveCellIds: [row.cells[1]!.id],
    })
    expect(() => assertValidTableModel(model)).not.toThrow()

    const crossBand = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const secondBand = clone(crossBand.bands[0]!)
    secondBand.id = 'band:second' as typeof secondBand.id
    secondBand.rows[0]!.id = 'row:second' as typeof secondBand.rows[number]['id']
    secondBand.rows[0]!.cells[0]!.id = 'cell:second' as typeof secondBand.rows[number]['cells'][number]['id']
    crossBand.bands.push(secondBand)
    crossBand.merges.push({
      id: 'merge:cross-band' as typeof crossBand.merges[number]['id'],
      rowIds: [crossBand.bands[0]!.rows[0]!.id, secondBand.rows[0]!.id],
      columnIds: [crossBand.columns[0]!.id],
      anchorCellId: crossBand.bands[0]!.rows[0]!.cells[0]!.id,
      inactiveCellIds: [secondBand.rows[0]!.cells[0]!.id],
    })
    expectInvalid(crossBand, /one band/i)
  })

  it('rejects a non-rectangular merge and overlapping merge regions', () => {
    const model = createTableModel({ kind: 'static', columnCount: 3, rowCount: 2 })
    const band = model.bands[0]!
    model.merges.push({
      id: 'merge:1' as typeof model.merges[number]['id'],
      rowIds: band.rows.map(row => row.id),
      columnIds: [model.columns[0]!.id, model.columns[2]!.id],
      anchorCellId: band.rows[0]!.cells[0]!.id,
      inactiveCellIds: [band.rows[0]!.cells[2]!.id, band.rows[1]!.cells[0]!.id, band.rows[1]!.cells[2]!.id],
    })
    expectInvalid(model, /continuous|rectangle/i)

    const overlap = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const overlapBand = overlap.bands[0]!
    const region = {
      rowIds: overlapBand.rows.map(row => row.id),
      columnIds: overlap.columns.map(column => column.id),
      anchorCellId: overlapBand.rows[0]!.cells[0]!.id,
      inactiveCellIds: [overlapBand.rows[0]!.cells[1]!.id, overlapBand.rows[1]!.cells[0]!.id, overlapBand.rows[1]!.cells[1]!.id],
    }
    overlap.merges.push(
      { id: 'merge:1' as typeof overlap.merges[number]['id'], ...region },
      { id: 'merge:2' as typeof overlap.merges[number]['id'], ...region },
    )
    expectInvalid(overlap, /overlap/i)
  })

  it('enforces inactive cells as exactly the region minus the anchor', () => {
    const model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const band = model.bands[0]!
    model.merges.push({
      id: 'merge:1' as typeof model.merges[number]['id'],
      rowIds: [band.rows[0]!.id],
      columnIds: model.columns.map(column => column.id),
      anchorCellId: band.rows[0]!.cells[0]!.id,
      inactiveCellIds: [],
    })
    expectInvalid(model, /inactive/i)
  })

  it('enforces data band shape, order, and exact template row count', () => {
    const data = createTableModel({ kind: 'data', columnCount: 1, rowCount: 1 })
    data.bands[0]!.rows.push(clone(data.bands[0]!.rows[0]!))
    data.bands[0]!.rows[1]!.id = 'row:extra' as typeof data.bands[0]['rows'][number]['id']
    data.bands[0]!.rows[1]!.cells[0]!.id = 'cell:extra' as typeof data.bands[0]['rows'][number]['cells'][number]['id']
    expectInvalid(data, /exactly one|template/i)

    const ordered = createTableModel({ kind: 'data', columnCount: 1, rowCount: 1 })
    const footerRow = clone(ordered.bands[0]!.rows[0]!)
    footerRow.id = 'row:footer' as typeof footerRow.id
    footerRow.cells[0]!.id = 'cell:footer' as typeof footerRow.cells[number]['id']
    ordered.bands.unshift({ id: 'band:footer' as typeof ordered.bands[number]['id'], role: 'footer', rows: [footerRow] })
    expectInvalid(ordered, /order/i)

    const body = createTableModel({ kind: 'data', columnCount: 1, rowCount: 1 })
    body.bands[0]!.role = 'body'
    expectInvalid(body, /detail|body/i)
  })

  it('enforces static/data discriminants and stable rejection for malformed input', () => {
    const staticModel = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as TableModel & { data?: { collectionPort: string } }
    staticModel.data = { collectionPort: 'records' }
    expectInvalid(staticModel, /static.*data/i)
    expectInvalid({ kind: 'static', columns: [{}], bands: [undefined], merges: [], style: {} }, /table model|band|column/i)
  })
})
