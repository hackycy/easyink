import type { TableIdentityAllocator, TableMergeId } from './model'
import type { TableTopologyDelta } from './topology-engine'
import { deepClone } from '@easyink/shared'
import { describe, expect, it, vi } from 'vitest'
import {
  assertValidTableModel,
  createSequentialTableIdentityAllocator,
  createTableModel,

} from './model'
import {
  applyTableTopologyDelta,
  invertTableTopologyDelta,
  materializeTableTopologyDelta,

  TableTopologyEngine,
} from './topology-engine'

describe('tableTopologyEngine structural operations', () => {
  it('inserts, removes, and reorders columns without changing surviving ids', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const identities = createSequentialTableIdentityAllocator('edit')
    const original = source.columns.map(column => column.id)
    const inserted = TableTopologyEngine.insertColumn(source, {
      target: { after: original[0]! },
      track: { kind: 'fr', weight: 1 },
      identities,
    })
    const added = inserted.columns.find(column => !original.includes(column.id))!
    const movedBack = TableTopologyEngine.reorderColumn(inserted, added.id, { atEnd: true })
    expect(movedBack.columns.map(column => column.id)).toEqual([...original, added.id])
    const reordered = TableTopologyEngine.reorderColumn(movedBack, added.id, { before: original[0]! })
    expect(reordered.columns.map(column => column.id)).toEqual([added.id, ...original])
    expect(reordered.bands[0]!.rows.every(row => row.cells.some(cell => cell.columnId === added.id))).toBe(true)
    const removed = TableTopologyEngine.removeColumn(reordered, added.id)
    expect(removed.model.columns.map(column => column.id)).toEqual(original)
    expect(removed.rebase.columns).toEqual([{ removedId: added.id, nearestSurvivorId: original[0] }])
    expect(removed.effects.removedCellIds).toHaveLength(2)
  })

  it('inserts, removes, and reorders rows inside an explicit band', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const identities = createSequentialTableIdentityAllocator('edit')
    const band = source.bands[0]!
    const original = band.rows.map(row => row.id)
    const inserted = TableTopologyEngine.insertRow(source, {
      bandId: band.id,
      target: { after: original[0]! },
      minHeight: 12,
      identities,
    })
    const added = inserted.bands[0]!.rows.find(row => !original.includes(row.id))!
    const movedBack = TableTopologyEngine.reorderRow(inserted, added.id, { atEnd: true })
    expect(movedBack.bands[0]!.rows.map(row => row.id)).toEqual([...original, added.id])
    const result = TableTopologyEngine.removeRow(movedBack, added.id)
    expect(result.model.bands[0]!.rows.map(row => row.id)).toEqual(original)
    expect(result.rebase.rows).toEqual([{ removedId: added.id, nearestSurvivorId: original[1] }])
  })

  it('inserts, reorders, and removes data header/footer bands without moving detail', () => {
    const source = createTableModel({ kind: 'data', columnCount: 2, rowCount: 1 })
    const identities = createSequentialTableIdentityAllocator('band-edit')
    const first = TableTopologyEngine.insertBand(source, {
      role: 'header',
      target: { atEnd: true },
      minHeight: 8,
      identities,
    })
    const firstHeader = first.bands.find(band => band.role === 'header')!
    const second = TableTopologyEngine.insertBand(first, {
      role: 'header',
      target: { after: firstHeader.id },
      minHeight: 8,
      identities,
    })
    const secondHeader = second.bands.filter(band => band.role === 'header')[1]!
    const withFooter = TableTopologyEngine.insertBand(second, {
      role: 'footer',
      target: { atEnd: true },
      minHeight: 8,
      identities,
    })
    const reordered = TableTopologyEngine.reorderBand(withFooter, secondHeader.id, { before: firstHeader.id })
    expect(reordered.bands.map(band => band.role)).toEqual(['header', 'header', 'detail', 'footer'])
    const removedHeader = reordered.bands[0]!
    removedHeader.rows[0]!.cells[0]!.content = {
      kind: 'materials',
      slotId: `cell:${removedHeader.rows[0]!.cells[0]!.id}`,
    }
    removedHeader.rows[0]!.cells[1]!.content = { kind: 'text', text: '', bindingPort: 'header-value' }
    const removed = TableTopologyEngine.removeBand(reordered, removedHeader.id)
    expect(removed.model.bands.map(band => band.role)).toEqual(['header', 'detail', 'footer'])
    expect(removed.effects).toMatchObject({
      removedCellIds: removedHeader.rows[0]!.cells.map(cell => cell.id),
      releasedSlotIds: [`cell:${removedHeader.rows[0]!.cells[0]!.id}`],
      releasedBindingPorts: ['header-value'],
    })
    expect(() => TableTopologyEngine.removeBand(source, source.bands[0]!.id)).toThrow(/detail/)
    expect(() => TableTopologyEngine.insertRow(source, {
      bandId: source.bands[0]!.id,
      target: { atEnd: true },
      minHeight: 8,
      identities,
    })).toThrow(/detail/)
  })

  it('validates stable siblings before allocation and never mutates planner sources', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const before = deepClone(source)
    const allocate = vi.fn(() => 'unused')
    expect(() => TableTopologyEngine.planInsertColumn(source, {
      target: { after: 'missing-column' as never },
      track: { kind: 'fr', weight: 1 },
      identities: { allocate },
      topologyRevision: 4,
    })).toThrow(/column not found/)
    expect(allocate).not.toHaveBeenCalled()
    expect(source).toEqual(before)
  })

  it('rejects stale and malformed deltas atomically without prototype pollution', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const delta = TableTopologyEngine.planReorderColumn(source, source.columns[0]!.id, {
      target: { atEnd: true },
      topologyRevision: 3,
    })
    const stale = deepClone(source)
    expect(() => applyTableTopologyDelta(stale, delta, 2)).toThrow('TABLE_TOPOLOGY_REVISION_STALE')
    expect(stale).toEqual(source)

    const malformed: TableTopologyDelta = {
      ...delta,
      expectedTopologyRevision: 0,
      forward: [{ kind: 'set', path: ['__proto__', 'polluted'], value: true }],
    }
    const draft = deepClone(source)
    expect(() => applyTableTopologyDelta(draft, malformed, 0)).toThrow(/path/)
    expect(draft).toEqual(source)
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()

    const lateFailure: TableTopologyDelta = {
      ...delta,
      expectedTopologyRevision: 0,
      forward: [
        { kind: 'splice', path: ['columns'], index: 0, deleteCount: 1, values: [] },
        { kind: 'splice', path: ['columns'], index: 99, deleteCount: 0, values: [] },
      ],
    }
    expect(() => applyTableTopologyDelta(draft, lateFailure, 0)).toThrow(/bounds/)
    expect(draft).toEqual(source)

    const invalidModel: TableTopologyDelta = {
      ...delta,
      expectedTopologyRevision: 0,
      forward: [{ kind: 'set', path: ['kind'], value: 'data' }],
    }
    expect(() => applyTableTopologyDelta(draft, invalidModel, 0)).toThrow(/data table model/)
    expect(draft).toEqual(source)

    const oneColumn = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const removesSoleColumn: TableTopologyDelta = {
      ...delta,
      expectedTopologyRevision: 0,
      forward: [{ kind: 'splice', path: ['columns'], index: 0, deleteCount: 1, values: [] }],
    }
    const oneColumnDraft = deepClone(oneColumn)
    expect(() => applyTableTopologyDelta(oneColumnDraft, removesSoleColumn, 0)).toThrow(/at least one column/)
    expect(oneColumnDraft).toEqual(oneColumn)

    const unknownKind: TableTopologyDelta = {
      ...delta,
      expectedTopologyRevision: 0,
      forward: [{ kind: 'replace', path: ['kind'], value: 'data' } as never],
    }
    expect(() => applyTableTopologyDelta(draft, unknownKind, 0)).toThrow(/edit kind/)
    expect(draft).toEqual(source)
  })

  it('deep clones edit payloads and emits bounded exact scripts', () => {
    const source = createTableModel({ kind: 'static', columnCount: 20, rowCount: 100 })
    const delta = TableTopologyEngine.planInsertColumn(source, {
      target: { after: source.columns[0]!.id },
      track: { kind: 'fr', weight: 1 },
      identities: createSequentialTableIdentityAllocator('edit'),
      topologyRevision: 7,
    })
    expect(delta.forward.length).toBeLessThanOrEqual(102)
    expect(delta.inverse.length).toBe(delta.forward.length)
    expect(delta.affectedModelPaths).not.toContain('/model')
    expect(delta.affectedModelPaths.every(path => path.startsWith('/'))).toBe(true)
    const changed = materializeTableTopologyDelta(source, delta, 7)
    const insertedEdit = delta.forward[0]!
    if (insertedEdit.kind === 'splice')
      (insertedEdit.values[0] as { track: { weight: number } }).track.weight = 99
    expect(changed.columns[1]!.track).toEqual({ kind: 'fr', weight: 1 })
    expect(materializeTableTopologyDelta(changed, invertTableTopologyDelta(delta), 8)).toEqual(source)
  })

  it('canonicalizes reversed cell storage by column id and inverts to the exact source', () => {
    const source = createTableModel({ kind: 'static', columnCount: 3, rowCount: 2 })
    for (const row of source.bands[0]!.rows)
      row.cells.reverse()
    assertValidTableModel(source)
    const original = deepClone(source)
    const insert = TableTopologyEngine.planInsertColumn(source, {
      target: { after: source.columns[0]!.id },
      track: { kind: 'fr', weight: 1 },
      identities: createSequentialTableIdentityAllocator('reversed-insert'),
      topologyRevision: 9,
    })
    expect(insert.forward.filter(edit => edit.path.at(-1) === 'cells')).toHaveLength(2)
    const inserted = materializeTableTopologyDelta(source, insert, 9)
    for (const row of inserted.bands[0]!.rows) {
      expect(row.cells.map(cell => cell.columnId)).toEqual(inserted.columns.map(column => column.id))
      for (const originalCell of original.bands[0]!.rows.find(candidate => candidate.id === row.id)!.cells)
        expect(row.cells.find(cell => cell.id === originalCell.id)).toEqual(originalCell)
    }
    expect(materializeTableTopologyDelta(inserted, invertTableTopologyDelta(insert), 10)).toEqual(original)

    const reorder = TableTopologyEngine.planReorderColumn(source, {
      columnId: source.columns[0]!.id,
      target: { atEnd: true },
      topologyRevision: 14,
    })
    expect(reorder.forward.filter(edit => edit.path.at(-1) === 'cells')).toHaveLength(2)
    const reordered = materializeTableTopologyDelta(source, reorder, 14)
    for (const row of reordered.bands[0]!.rows) {
      expect(row.cells.map(cell => cell.columnId)).toEqual(reordered.columns.map(column => column.id))
      for (const originalCell of original.bands[0]!.rows.find(candidate => candidate.id === row.id)!.cells)
        expect(row.cells.find(cell => cell.id === originalCell.id)).toEqual(originalCell)
    }
    expect(materializeTableTopologyDelta(reordered, invertTableTopologyDelta(reorder), 15)).toEqual(original)

    const noOpReorder = TableTopologyEngine.planReorderColumn(source, {
      columnId: source.columns[0]!.id,
      target: { before: source.columns[0]!.id },
      topologyRevision: 20,
    })
    const canonicalized = materializeTableTopologyDelta(source, noOpReorder, 20)
    for (const row of canonicalized.bands[0]!.rows)
      expect(row.cells.map(cell => cell.columnId)).toEqual(canonicalized.columns.map(column => column.id))
    expect(materializeTableTopologyDelta(canonicalized, invertTableTopologyDelta(noOpReorder), 21)).toEqual(original)
  })

  it('expands merges only across an inserted internal boundary and rejects discontinuous reorders', () => {
    const source = createTableModel({ kind: 'static', columnCount: 3, rowCount: 2 })
    const row = source.bands[0]!.rows[0]!
    source.merges.push({
      id: 'merge:test' as TableMergeId,
      rowIds: [row.id],
      columnIds: source.columns.slice(0, 2).map(column => column.id),
      anchorCellId: row.cells[0]!.id,
      inactiveCellIds: [row.cells[1]!.id],
    })
    assertValidTableModel(source)
    const inserted = TableTopologyEngine.insertColumn(source, {
      target: { after: source.columns[0]!.id },
      track: { kind: 'fr', weight: 1 },
      identities: createSequentialTableIdentityAllocator('merge-edit'),
    })
    expect(inserted.merges[0]!.columnIds).toHaveLength(3)
    expect(() => TableTopologyEngine.reorderColumn(source, source.columns[1]!.id, { atEnd: true })).toThrow(/merge/)
    expect(source.columns.map(column => column.id)).toHaveLength(3)
  })

  it('rejects invalid and duplicate allocated identities before returning a delta', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const invalid: TableIdentityAllocator = { allocate: () => 'contains space' }
    expect(() => TableTopologyEngine.planInsertColumn(source, {
      target: { atEnd: true },
      track: { kind: 'fr', weight: 1 },
      identities: invalid,
      topologyRevision: 0,
    })).toThrow(/stable ID/)
    const duplicate: TableIdentityAllocator = { allocate: () => source.columns[0]!.id }
    expect(() => TableTopologyEngine.planInsertColumn(source, {
      target: { atEnd: true },
      track: { kind: 'fr', weight: 1 },
      identities: duplicate,
      topologyRevision: 0,
    })).toThrow(/Duplicate/)
  })

  it('supports every stable target variant and rejects cross-band row targets', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const identities = createSequentialTableIdentityAllocator('targets')
    const beforeFirst = TableTopologyEngine.insertColumn(source, {
      target: { before: source.columns[0]!.id },
      track: { kind: 'fr', weight: 1 },
      identities,
    })
    const insertedId = beforeFirst.columns[0]!.id
    const afterLast = TableTopologyEngine.reorderColumn(beforeFirst, insertedId, {
      after: beforeFirst.columns.at(-1)!.id,
    })
    expect(afterLast.columns.at(-1)!.id).toBe(insertedId)

    const data = createTableModel({ kind: 'data', columnCount: 1, rowCount: 1 })
    const withHeaders = TableTopologyEngine.insertBand(
      TableTopologyEngine.insertBand(data, {
        role: 'header',
        target: { atEnd: true },
        minHeight: 8,
        identities,
      }),
      { role: 'header', target: { atEnd: true }, minHeight: 8, identities },
    )
    const headers = withHeaders.bands.filter(band => band.role === 'header')
    const reordered = TableTopologyEngine.reorderBand(withHeaders, headers[0]!.id, { after: headers[1]!.id })
    expect(reordered.bands.slice(0, 2).map(band => band.id)).toEqual([headers[1]!.id, headers[0]!.id])

    const withFooter = TableTopologyEngine.insertBand(reordered, {
      role: 'footer',
      target: { atEnd: true },
      minHeight: 8,
      identities,
    })
    expect(withFooter.bands.at(-1)!.role).toBe('footer')
    expect(() => TableTopologyEngine.reorderRow(
      withFooter,
      withFooter.bands[0]!.rows[0]!.id,
      { before: withFooter.bands.at(-1)!.rows[0]!.id },
    )).toThrow(/same band/)
  })

  it('deduplicates removal dispositions in stable encounter order', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    source.bands[0]!.rows[0]!.cells[0]!.content = { kind: 'text', text: '', bindingPort: 'shared' }
    source.bands[0]!.rows[1]!.cells[0]!.content = { kind: 'text', text: '', bindingPort: 'shared' }
    const removed = TableTopologyEngine.removeColumn(source, source.columns[0]!.id)
    expect(removed.effects.releasedBindingPorts).toEqual(['shared'])
    expect(new Set(removed.effects.removedCellIds).size).toBe(removed.effects.removedCellIds.length)
  })

  it('refreshes or removes merges after row removal and rejects discontinuous row moves', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 3 })
    const rows = source.bands[0]!.rows
    source.merges.push({
      id: 'merge:rows' as TableMergeId,
      rowIds: rows.slice(0, 2).map(row => row.id),
      columnIds: [source.columns[0]!.id],
      anchorCellId: rows[0]!.cells[0]!.id,
      inactiveCellIds: [rows[1]!.cells[0]!.id],
    })
    assertValidTableModel(source)
    expect(() => TableTopologyEngine.reorderRow(source, rows[1]!.id, { atEnd: true })).toThrow(/merge/)
    source.merges[0]!.rowIds = rows.map(row => row.id)
    source.merges[0]!.inactiveCellIds = rows.slice(1).map(row => row.cells[0]!.id)
    assertValidTableModel(source)
    const firstRemoved = TableTopologyEngine.removeRow(source, rows[0]!.id).model
    expect(firstRemoved.merges[0]!.anchorCellId).toBe(firstRemoved.bands[0]!.rows[0]!.cells[0]!.id)
    const secondRemoved = TableTopologyEngine.removeRow(firstRemoved, firstRemoved.bands[0]!.rows[0]!.id).model
    expect(secondRemoved.merges).toEqual([])
  })
})
