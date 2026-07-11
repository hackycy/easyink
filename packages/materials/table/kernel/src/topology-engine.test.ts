import type { TableIdentityAllocator, TableMergeId, TableModel } from './model'
import type { TableTopologyDelta } from './topology-engine'
import { deepClone } from '@easyink/shared'
import { describe, expect, it, vi } from 'vitest'
import {
  assertValidTableModel,
  createSequentialTableIdentityAllocator,
  createTableModel,
  TABLE_MODEL_MAX_JSON_NODES,

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

  it('snapshots untrusted delta scripts once before committing the validated edits', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const base = TableTopologyEngine.planReorderColumn(source, {
      columnId: source.columns[0]!.id,
      target: { atEnd: true },
      topologyRevision: 0,
    })
    const first = { kind: 'set', path: ['columns', 0, 'track'], value: { kind: 'fixed', size: 10 } } as const

    let valueReads = 0
    const accessorEdit = {
      kind: 'set' as const,
      path: ['columns', 1, 'track'] as const,
      get value() {
        valueReads += 1
        return { kind: 'fixed', size: 20 }
      },
    }
    const accessorDelta = { ...base, forward: [first, accessorEdit] } as TableTopologyDelta
    const accessorDraft = deepClone(source)
    expect(() => applyTableTopologyDelta(accessorDraft, accessorDelta, 0)).toThrow(/accessor/)
    expect(valueReads).toBe(0)
    expect(accessorDraft).toEqual(source)

    const edits = [first, {
      kind: 'set',
      path: ['columns', 1, 'track'],
      value: { kind: 'fixed', size: 30 },
    }] as const
    let forwardReads = 0
    let secondIndexDescriptorReads = 0
    const proxiedEdits = new Proxy(edits, {
      getOwnPropertyDescriptor(target, property) {
        if (property === '1') {
          secondIndexDescriptorReads += 1
          if (secondIndexDescriptorReads > 1)
            throw new Error('forward array index descriptor read twice')
        }
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })
    const delta = { ...base } as TableTopologyDelta
    let expectedRevisionReads = 0
    Object.defineProperty(delta, 'expectedTopologyRevision', {
      enumerable: true,
      get() {
        expectedRevisionReads += 1
        if (expectedRevisionReads > 1)
          throw new Error('expected revision read twice')
        return 0
      },
    })
    Object.defineProperty(delta, 'forward', {
      enumerable: true,
      get() {
        forwardReads += 1
        if (forwardReads > 1)
          throw new Error('forward read twice')
        return proxiedEdits
      },
    })
    const draft = deepClone(source)
    expect(() => applyTableTopologyDelta(draft, delta, 0)).not.toThrow()
    expect(expectedRevisionReads).toBe(1)
    expect(forwardReads).toBe(1)
    expect(secondIndexDescriptorReads).toBe(1)
    expect(draft.columns[1]!.track).toEqual({ kind: 'fixed', size: 30 })

    const throwingDelta = { ...base } as TableTopologyDelta
    Object.defineProperty(throwingDelta, 'forward', {
      get() {
        throw new Error('snapshot failed')
      },
    })
    const unchanged = deepClone(source)
    expect(() => applyTableTopologyDelta(unchanged, throwingDelta, 0)).toThrow('snapshot failed')
    expect(unchanged).toEqual(source)
  })

  it.each([-1, Infinity, Number.NaN, 1.5])('rejects invalid equal topology revisions: %s', (revision) => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const valid = TableTopologyEngine.planReorderColumn(source, {
      columnId: source.columns[0]!.id,
      target: { atEnd: true },
      topologyRevision: 0,
    })
    const delta = { ...valid, expectedTopologyRevision: revision }
    const draft = deepClone(source)
    expect(() => applyTableTopologyDelta(draft, delta, revision)).toThrow(/revision/)
    expect(draft).toEqual(source)
  })

  it('rejects insert capacity before calling the real allocator and permits adjacent valid models', () => {
    const allocate = vi.fn(() => 'must-not-allocate')
    const identities = { allocate }
    const staticLimit = createTableModel({ kind: 'static', columnCount: 100, rowCount: 164 })
    expect(() => TableTopologyEngine.planInsertColumn(staticLimit, {
      target: { atEnd: true },
      track: { kind: 'fr', weight: 1 },
      identities,
      topologyRevision: 0,
    })).toThrow(/budget|nodes/)
    expect(allocate).not.toHaveBeenCalled()
    expect(() => TableTopologyEngine.planInsertRow(staticLimit, {
      bandId: staticLimit.bands[0]!.id,
      target: { atEnd: true },
      minHeight: 8,
      identities,
      topologyRevision: 0,
    })).toThrow(/budget|nodes/)
    expect(allocate).not.toHaveBeenCalled()

    const dataLimit = createTableModel({ kind: 'data', columnCount: 9_000, rowCount: 1 })
    expect(() => TableTopologyEngine.planInsertBand(dataLimit, {
      role: 'header',
      target: { atEnd: true },
      minHeight: 8,
      identities,
      topologyRevision: 0,
    })).toThrow(/budget|nodes/)
    expect(allocate).not.toHaveBeenCalled()

    const columnNeighbor = createTableModel({ kind: 'static', columnCount: 99, rowCount: 164 })
    const columnDelta = TableTopologyEngine.planInsertColumn(columnNeighbor, {
      target: { atEnd: true },
      track: { kind: 'fr', weight: 1 },
      identities: createSequentialTableIdentityAllocator('capacity-column'),
      topologyRevision: 1,
    })
    expect(materializeTableTopologyDelta(columnNeighbor, columnDelta, 1).columns).toHaveLength(100)

    const rowNeighbor = createTableModel({ kind: 'static', columnCount: 100, rowCount: 163 })
    const rowDelta = TableTopologyEngine.planInsertRow(rowNeighbor, {
      bandId: rowNeighbor.bands[0]!.id,
      target: { atEnd: true },
      minHeight: 8,
      identities: createSequentialTableIdentityAllocator('capacity-row'),
      topologyRevision: 2,
    })
    expect(materializeTableTopologyDelta(rowNeighbor, rowDelta, 2).bands[0]!.rows).toHaveLength(164)

    const bandNeighbor = createTableModel({ kind: 'data', columnCount: 5_800, rowCount: 1 })
    const bandDelta = TableTopologyEngine.planInsertBand(bandNeighbor, {
      role: 'header',
      target: { atEnd: true },
      minHeight: 8,
      identities: createSequentialTableIdentityAllocator('capacity-band'),
      topologyRevision: 3,
    })
    expect(materializeTableTopologyDelta(bandNeighbor, bandDelta, 3).bands).toHaveLength(2)
  })

  it('snapshots every creating-planner input before allocation', () => {
    const columnSource = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const columnAllocator = createSequentialTableIdentityAllocator('snapshot-column')
    const columnReads = { revision: 0, after: 0, track: 0, identities: 0 }
    const columnInput = {
      get topologyRevision() {
        columnReads.revision += 1
        return columnReads.revision === 1 ? 4 : -1
      },
      get after() {
        columnReads.after += 1
        return columnReads.after === 1 ? columnSource.columns[0]!.id : 'missing' as never
      },
      get track() {
        columnReads.track += 1
        return columnReads.track === 1
          ? { kind: 'fr' as const, weight: 1 }
          : { kind: 'fr' as const, weight: -1 }
      },
      get identities() {
        columnReads.identities += 1
        return columnAllocator
      },
    }
    const columnDelta = TableTopologyEngine.planInsertColumn(columnSource, columnInput)
    const insertedColumn = materializeTableTopologyDelta(columnSource, columnDelta, 4)
    expect(columnReads).toEqual({ revision: 1, after: 1, track: 1, identities: 1 })
    expect(insertedColumn.columns[1]!.track).toEqual({ kind: 'fr', weight: 1 })

    const rowAllocator = createSequentialTableIdentityAllocator('snapshot-row')
    const rowReads = { revision: 0, bandId: 0, target: 0, minHeight: 0, identities: 0 }
    const rowInput = {
      get topologyRevision() {
        rowReads.revision += 1
        return rowReads.revision === 1 ? 5 : -1
      },
      get bandId() {
        rowReads.bandId += 1
        return rowReads.bandId === 1 ? columnSource.bands[0]!.id : 'missing' as never
      },
      get target() {
        rowReads.target += 1
        return rowReads.target === 1 ? { atEnd: true as const } : { after: 'missing' as never }
      },
      get minHeight() {
        rowReads.minHeight += 1
        return rowReads.minHeight === 1 ? 8 : -1
      },
      get identities() {
        rowReads.identities += 1
        return rowAllocator
      },
    }
    const rowDelta = TableTopologyEngine.planInsertRow(columnSource, rowInput)
    const insertedRow = materializeTableTopologyDelta(columnSource, rowDelta, 5)
    expect(rowReads).toEqual({ revision: 1, bandId: 1, target: 1, minHeight: 1, identities: 1 })
    expect(insertedRow.bands[0]!.rows.at(-1)!.minHeight).toBe(8)

    const data = createTableModel({ kind: 'data', columnCount: 2, rowCount: 1 })
    const first = TableTopologyEngine.insertBand(data, {
      role: 'header',
      target: { atEnd: true },
      minHeight: 8,
      identities: createSequentialTableIdentityAllocator('snapshot-band-first'),
    })
    const firstHeader = first.bands[0]!
    const bandAllocator = createSequentialTableIdentityAllocator('snapshot-band')
    const bandReads = { revision: 0, role: 0, after: 0, minHeight: 0, identities: 0 }
    const bandInput = {
      get topologyRevision() {
        bandReads.revision += 1
        return bandReads.revision === 1 ? 6 : -1
      },
      get role() {
        bandReads.role += 1
        return bandReads.role === 1 ? 'header' as const : 'detail' as never
      },
      get after() {
        bandReads.after += 1
        return bandReads.after === 1 ? firstHeader.id : 'missing' as never
      },
      get minHeight() {
        bandReads.minHeight += 1
        return bandReads.minHeight === 1 ? 8 : -1
      },
      get identities() {
        bandReads.identities += 1
        return bandAllocator
      },
    }
    const bandDelta = TableTopologyEngine.planInsertBand(first, bandInput)
    const insertedBand = materializeTableTopologyDelta(first, bandDelta, 6)
    expect(bandReads).toEqual({ revision: 1, role: 1, after: 1, minHeight: 1, identities: 1 })
    expect(insertedBand.bands.slice(0, 2).map(band => band.role)).toEqual(['header', 'header'])
    expect(insertedBand.bands[1]!.rows[0]!.minHeight).toBe(8)
  })

  it('counts a detached track proxy with large extra JSON before allocation', () => {
    const source = createTableModel({ kind: 'static', columnCount: 100, rowCount: 160 })
    const allocate = vi.fn(() => 'must-not-allocate')
    let trackReads = 0
    let trackDescriptorReads = 0
    const largeTrack = new Proxy({
      kind: 'fr' as const,
      weight: 1,
      extra: Array.from({ length: 10_000 }).fill(0),
    }, {
      get(target, property, receiver) {
        trackReads += 1
        return Reflect.get(target, property, receiver)
      },
      getOwnPropertyDescriptor(target, property) {
        trackDescriptorReads += 1
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })
    expect(() => TableTopologyEngine.planInsertColumn(source, {
      topologyRevision: 0,
      target: { atEnd: true },
      track: largeTrack,
      identities: { allocate },
    })).toThrow(/budget|nodes/)
    expect(trackReads).toBe(0)
    expect(trackDescriptorReads).toBeGreaterThan(0)
    expect(allocate).not.toHaveBeenCalled()

    let identitiesReads = 0
    const invalidInput = {
      topologyRevision: 0,
      target: { atEnd: true as const },
      track: { kind: 'fr' as const, weight: 1, invalid: () => undefined },
      get identities() {
        identitiesReads += 1
        return { allocate }
      },
    }
    const before = deepClone(source)
    expect(() => TableTopologyEngine.planInsertColumn(source, invalidInput)).toThrow(/JSON|Unsupported/)
    expect(identitiesReads).toBe(0)
    expect(allocate).not.toHaveBeenCalled()
    expect(source).toEqual(before)
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

    const remove = TableTopologyEngine.planRemoveColumn(source, {
      columnId: source.columns[1]!.id,
      topologyRevision: 30,
    })
    expect(remove.forward.filter(edit => edit.path.at(-1) === 'cells')).toHaveLength(2)
    const removed = materializeTableTopologyDelta(source, remove, 30)
    for (const row of removed.bands[0]!.rows)
      expect(row.cells.map(cell => cell.columnId)).toEqual(removed.columns.map(column => column.id))
    expect(materializeTableTopologyDelta(removed, invertTableTopologyDelta(remove), 31)).toEqual(original)
  })

  it('rejects non-string and non-number path segments before property-key coercion', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const draft = Object.assign(deepClone(source), { true: 'owned' })
    const base = TableTopologyEngine.planReorderColumn(source, {
      columnId: source.columns[0]!.id,
      target: { atEnd: true },
      topologyRevision: 0,
    })
    const booleanPath: TableTopologyDelta = {
      ...base,
      forward: [{ kind: 'set', path: [true] as never, value: 'mutated' }],
    }
    expect(() => applyTableTopologyDelta(draft, booleanPath, 0)).toThrow(/path segment/)
    expect(draft).toEqual(Object.assign(deepClone(source), { true: 'owned' }))

    for (const segment of [1n, Symbol('path'), null, undefined]) {
      const invalidPath: TableTopologyDelta = {
        ...base,
        forward: [{ kind: 'set', path: [segment] as never, value: 'mutated' }],
      }
      expect(() => applyTableTopologyDelta(draft, invalidPath, 0)).toThrow(/path segment|JSON|Unsupported/)
      expect(draft).toEqual(Object.assign(deepClone(source), { true: 'owned' }))
    }

    const toString = vi.fn(() => 'kind')
    const objectPath: TableTopologyDelta = {
      ...base,
      forward: [{ kind: 'set', path: [{ toString }] as never, value: 'data' }],
    }
    expect(() => applyTableTopologyDelta(draft, objectPath, 0)).toThrow(/path segment|JSON|Unsupported/)
    expect(toString).not.toHaveBeenCalled()
    expect(draft).toEqual(Object.assign(deepClone(source), { true: 'owned' }))
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

describe('tableTopologyEngine lossless merge regions', () => {
  function cellJson(model: TableModel): unknown[] {
    return model.bands.flatMap(band => band.rows.flatMap(row => row.cells.map(cell => deepClone(cell))))
  }

  function countJsonNodes(value: unknown): number {
    let count = 0
    const stack = [value]
    while (stack.length > 0) {
      const current = stack.pop()
      count += 1
      if (current && typeof current === 'object')
        stack.push(...(Array.isArray(current) ? current : Object.values(current)))
    }
    return count
  }

  it('merges a canonical rectangle without changing cells and restores it by splitting', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const rows = source.bands[0]!.rows
    rows[0]!.cells[0]!.content = { kind: 'text', text: 'anchor' }
    rows[0]!.cells[1]!.content = { kind: 'text', text: 'top-right', bindingPort: 'right' }
    rows[1]!.cells[0]!.content = { kind: 'materials', slotId: `cell:${rows[1]!.cells[0]!.id}` }
    rows[1]!.cells[1]!.content = { kind: 'text', text: 'bottom-right' }
    rows[1]!.cells[1]!.style = { background: '#fff' }
    const before = deepClone(source)
    const cells = cellJson(source)

    const merged = TableTopologyEngine.merge(source, {
      rowIds: [...rows].reverse().map(row => row.id),
      columnIds: [...source.columns].reverse().map(column => column.id),
      anchorCellId: rows[0]!.cells[0]!.id,
      identities: createSequentialTableIdentityAllocator('lossless'),
    })

    expect(source).toEqual(before)
    expect(merged.merges).toEqual([{
      id: 'lossless:merge:1',
      rowIds: rows.map(row => row.id),
      columnIds: source.columns.map(column => column.id),
      anchorCellId: rows[0]!.cells[0]!.id,
      inactiveCellIds: [rows[0]!.cells[1]!.id, rows[1]!.cells[0]!.id, rows[1]!.cells[1]!.id],
    }])
    expect(cellJson(merged)).toEqual(cells)
    const split = TableTopologyEngine.split(merged, merged.merges[0]!.id)
    expect(split.merges).toEqual([])
    expect(cellJson(split)).toEqual(cells)
    expect(merged.merges).toHaveLength(1)
    assertValidTableModel(split)
  })

  it.each([
    ['unknown row', (source: TableModel) => ({ rowIds: ['missing'], columnIds: [source.columns[0]!.id, source.columns[1]!.id] })],
    ['duplicate row', (source: TableModel) => ({ rowIds: [source.bands[0]!.rows[0]!.id, source.bands[0]!.rows[0]!.id], columnIds: [source.columns[0]!.id, source.columns[1]!.id] })],
    ['non-contiguous row', (source: TableModel) => ({ rowIds: [source.bands[0]!.rows[0]!.id, source.bands[0]!.rows[2]!.id], columnIds: [source.columns[0]!.id] })],
    ['unknown column', (source: TableModel) => ({ rowIds: [source.bands[0]!.rows[0]!.id], columnIds: [source.columns[0]!.id, 'missing'] })],
    ['duplicate column', (source: TableModel) => ({ rowIds: [source.bands[0]!.rows[0]!.id], columnIds: [source.columns[0]!.id, source.columns[0]!.id] })],
    ['non-contiguous column', (source: TableModel) => ({ rowIds: [source.bands[0]!.rows[0]!.id], columnIds: [source.columns[0]!.id, source.columns[2]!.id] })],
  ])('rejects an invalid rectangle with a %s', (_label, select) => {
    const source = createTableModel({ kind: 'static', columnCount: 3, rowCount: 3 })
    const before = deepClone(source)
    const allocate = vi.fn(() => 'unused')
    expect(() => TableTopologyEngine.merge(source, {
      ...select(source),
      anchorCellId: source.bands[0]!.rows[0]!.cells[0]!.id,
      identities: { allocate },
    } as never)).toThrow()
    expect(allocate).not.toHaveBeenCalled()
    expect(source).toEqual(before)
  })

  it('rejects cross-band, one-cell, outside-anchor, and overlapping regions before allocation', () => {
    const data = createTableModel({ kind: 'data', columnCount: 2, rowCount: 1 })
    const withHeader = TableTopologyEngine.insertBand(data, {
      role: 'header',
      target: { atEnd: true },
      minHeight: 8,
      identities: createSequentialTableIdentityAllocator('header'),
    })
    const allocate = vi.fn(() => 'unused')
    const common = { identities: { allocate } }
    const headerRow = withHeader.bands[0]!.rows[0]!
    const detailRow = withHeader.bands[1]!.rows[0]!
    expect(() => TableTopologyEngine.merge(withHeader, {
      ...common,
      rowIds: [headerRow.id, detailRow.id],
      columnIds: [withHeader.columns[0]!.id],
      anchorCellId: headerRow.cells[0]!.id,
    })).toThrow(/band/)
    expect(() => TableTopologyEngine.merge(withHeader, {
      ...common,
      rowIds: [headerRow.id],
      columnIds: [withHeader.columns[0]!.id],
      anchorCellId: headerRow.cells[0]!.id,
    })).toThrow(/more than one|at least two/)
    expect(() => TableTopologyEngine.merge(withHeader, {
      ...common,
      rowIds: [headerRow.id],
      columnIds: withHeader.columns.map(column => column.id),
      anchorCellId: detailRow.cells[0]!.id,
    })).toThrow(/anchor/)

    const first = TableTopologyEngine.merge(withHeader, {
      rowIds: [headerRow.id],
      columnIds: withHeader.columns.map(column => column.id),
      anchorCellId: headerRow.cells[0]!.id,
      identities: createSequentialTableIdentityAllocator('first'),
    })
    expect(() => TableTopologyEngine.merge(first, {
      ...common,
      rowIds: [headerRow.id],
      columnIds: withHeader.columns.map(column => column.id),
      anchorCellId: headerRow.cells[1]!.id,
    })).toThrow(/overlap/)
    expect(allocate).not.toHaveBeenCalled()
  })

  it('keeps other regions on split and rejects unknown merge ids without changing source', () => {
    const source = createTableModel({ kind: 'static', columnCount: 4, rowCount: 1 })
    const row = source.bands[0]!.rows[0]!
    const allocator = createSequentialTableIdentityAllocator('multiple')
    const first = TableTopologyEngine.merge(source, {
      rowIds: [row.id],
      columnIds: source.columns.slice(0, 2).map(column => column.id),
      anchorCellId: row.cells[0]!.id,
      identities: allocator,
    })
    const second = TableTopologyEngine.merge(first, {
      rowIds: [row.id],
      columnIds: source.columns.slice(2).map(column => column.id),
      anchorCellId: row.cells[2]!.id,
      identities: allocator,
    })
    const split = TableTopologyEngine.split(second, first.merges[0]!.id)
    expect(split.merges).toEqual([second.merges[1]])
    const before = deepClone(second)
    expect(() => TableTopologyEngine.split(second, 'missing' as TableMergeId)).toThrow(/not found/)
    expect(second).toEqual(before)
  })

  it('captures merge input and allocator capabilities once and resists allocator TOCTOU', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const row = source.bands[0]!.rows[0]!
    const reads = { rows: 0, columns: 0, anchor: 0, identities: 0, allocate: 0 }
    const allocate = vi.fn(() => 'captured:merge:1')
    const allocator = {
      get allocate() {
        reads.allocate += 1
        return reads.allocate === 1 ? allocate : () => source.columns[0]!.id
      },
    }
    const input = {
      get rowIds() {
        reads.rows += 1
        return reads.rows === 1 ? [row.id] : ['missing' as never]
      },
      get columnIds() {
        reads.columns += 1
        return reads.columns === 1 ? source.columns.map(column => column.id) : []
      },
      get anchorCellId() {
        reads.anchor += 1
        return reads.anchor === 1 ? row.cells[0]!.id : 'missing' as never
      },
      get identities() {
        reads.identities += 1
        return allocator
      },
    }
    const merged = TableTopologyEngine.merge(source, input)
    expect(merged.merges[0]!.id).toBe('captured:merge:1')
    expect(reads).toEqual({ rows: 1, columns: 1, anchor: 1, identities: 1, allocate: 1 })
    expect(allocate).toHaveBeenCalledOnce()

    const collision = vi.fn(() => source.columns[0]!.id)
    expect(() => TableTopologyEngine.merge(source, {
      rowIds: [row.id],
      columnIds: source.columns.map(column => column.id),
      anchorCellId: row.cells[0]!.id,
      identities: { allocate: collision },
    })).toThrow(/Duplicate/)
    expect(source.merges).toEqual([])
  })

  it('rejects malformed snapshots, hostile sources, and excess JSON capacity before allocation', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const rows = source.bands[0]!.rows
    const allocate = vi.fn(() => 'must-not-allocate')
    const invalidInput = {
      rowIds: [rows[0]!.id],
      columnIds: [source.columns[0]!.id, source.columns[1]!.id, () => undefined],
      anchorCellId: rows[0]!.cells[0]!.id,
      get identities() { throw new Error('must not read identities') },
    }
    expect(() => TableTopologyEngine.merge(source, invalidInput as never)).toThrow(/JSON|Unsupported/)

    const hostile = new Proxy(source, {
      ownKeys() { throw new Error('hostile source') },
    })
    expect(() => TableTopologyEngine.merge(hostile, {
      rowIds: rows.map(row => row.id),
      columnIds: source.columns.map(column => column.id),
      anchorCellId: rows[0]!.cells[0]!.id,
      identities: { allocate },
    })).toThrow(/hostile source/)
    expect(allocate).not.toHaveBeenCalled()

    const nearBudget = deepClone(source) as TableModel & { style: { extra?: number[] } }
    const mergeNodes = 5 + 2 + 2 + 4
    const baseNodes = countJsonNodes(nearBudget)
    nearBudget.style.extra = Array.from<number>({
      length: TABLE_MODEL_MAX_JSON_NODES - mergeNodes + 1 - baseNodes - 1,
    }).fill(0)
    expect(countJsonNodes(nearBudget)).toBe(TABLE_MODEL_MAX_JSON_NODES - mergeNodes + 1)
    expect(() => TableTopologyEngine.merge(nearBudget, {
      rowIds: nearBudget.bands[0]!.rows.map(row => row.id),
      columnIds: nearBudget.columns.map(column => column.id),
      anchorCellId: nearBudget.bands[0]!.rows[0]!.cells[0]!.id,
      identities: { allocate },
    })).toThrow(/budget|nodes/)
    expect(allocate).not.toHaveBeenCalled()
  })

  it('rejects nested merge accessors without invoking them or allocating', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const row = source.bands[0]!.rows[0]!
    const rowIds: string[] = []
    let getterCalls = 0
    Object.defineProperty(rowIds, '0', {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1
        return row.id
      },
    })
    rowIds.length = 1
    const allocate = vi.fn(() => 'must-not-allocate')

    expect(() => TableTopologyEngine.merge(source, {
      rowIds: rowIds as never,
      columnIds: source.columns.map(column => column.id),
      anchorCellId: row.cells[0]!.id,
      identities: { allocate },
    })).toThrow(/accessor|JSON/i)
    expect(getterCalls).toBe(0)
    expect(allocate).not.toHaveBeenCalled()
    expect(source.merges).toEqual([])
  })

  it('rejects source accessors without invoking them in merge or split', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const row = source.bands[0]!.rows[0]!
    const allocate = vi.fn(() => 'must-not-allocate')
    let textGetterCalls = 0
    Object.defineProperty(row.cells[0]!.content, 'text', {
      configurable: true,
      enumerable: true,
      get() {
        textGetterCalls += 1
        return 'unsafe'
      },
    })
    expect(() => TableTopologyEngine.merge(source, {
      rowIds: [row.id],
      columnIds: source.columns.map(column => column.id),
      anchorCellId: row.cells[0]!.id,
      identities: { allocate },
    })).toThrow(/accessor|JSON/i)
    expect(textGetterCalls).toBe(0)
    expect(allocate).not.toHaveBeenCalled()
    expect(source.merges).toEqual([])

    const splittable = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const splittableRow = splittable.bands[0]!.rows[0]!
    const merged = TableTopologyEngine.merge(splittable, {
      rowIds: [splittableRow.id],
      columnIds: splittable.columns.map(column => column.id),
      anchorCellId: splittableRow.cells[0]!.id,
      identities: createSequentialTableIdentityAllocator('accessor-split'),
    })
    let anchorGetterCalls = 0
    Object.defineProperty(merged.merges[0]!, 'anchorCellId', {
      configurable: true,
      enumerable: true,
      get() {
        anchorGetterCalls += 1
        return splittableRow.cells[0]!.id
      },
    })
    expect(() => TableTopologyEngine.split(merged, merged.merges[0]!.id)).toThrow(/accessor|JSON/i)
    expect(anchorGetterCalls).toBe(0)
    expect(merged.merges).toHaveLength(1)
  })

  it('captures changing nested proxy descriptors exactly once', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const row = source.bands[0]!.rows[0]!
    const descriptorReads = new Map<PropertyKey, number>()
    const rowIds = new Proxy([row.id], {
      getOwnPropertyDescriptor(target, property) {
        const reads = (descriptorReads.get(property) ?? 0) + 1
        descriptorReads.set(property, reads)
        if (property === '0' && reads > 1) {
          return { configurable: true, enumerable: true, writable: true, value: 'missing' }
        }
        return Reflect.getOwnPropertyDescriptor(target, property)
      },
    })
    const merged = TableTopologyEngine.merge(source, {
      rowIds,
      columnIds: source.columns.map(column => column.id),
      anchorCellId: row.cells[0]!.id,
      identities: createSequentialTableIdentityAllocator('descriptor-once'),
    })
    expect(merged.merges).toHaveLength(1)
    expect(descriptorReads.get('0')).toBe(1)
    expect(descriptorReads.get('length')).toBe(1)
  })

  it('rejects non-canonical merge input arrays before allocation', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const row = source.bands[0]!.rows[0]!
    const sparse: string[] = []
    sparse.length = 1
    const extra = Object.assign([row.id], { extra: row.id })
    const cyclic: unknown[] = []
    cyclic.push(cyclic)
    const customPrototype = [row.id]
    Object.setPrototypeOf(customPrototype, {})
    const allocate = vi.fn(() => 'must-not-allocate')

    for (const rowIds of [sparse, extra, cyclic, customPrototype]) {
      expect(() => TableTopologyEngine.merge(source, {
        rowIds: rowIds as never,
        columnIds: source.columns.map(column => column.id),
        anchorCellId: row.cells[0]!.id,
        identities: { allocate },
      })).toThrow(/JSON|snapshot|plain/i)
    }
    expect(allocate).not.toHaveBeenCalled()
    expect(source.merges).toEqual([])
  })
})
