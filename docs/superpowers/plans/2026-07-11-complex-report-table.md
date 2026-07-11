# Complex Report Table Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build deterministic static and data-driven report tables with stable topology, nested material cells, scoped bindings, accessible editing, lazy runtime rows, and bounded performance.

**Architecture:** `@easyink/material-table-kernel` owns the private `TableModel`, `TableTopologyEngine`, layout planning, table selection, and table-specific runtime policies. `table-static` and `table-data` remain separate materials and expose facets through the single versioned manifest defined by the material platform; they consume the shared transaction, slot, measure, layout, and Viewer runtime contracts without reimplementing those cores.

**Tech Stack:** TypeScript, Vue 3, Vitest with happy-dom, `@easyink/core` material/transaction/layout contracts, `@easyink/schema` node envelopes, pnpm workspaces.

---

## Scope And Prerequisites

This is a report-table plan, not a spreadsheet plan. It intentionally excludes formulas, sorting/filtering UI, frozen panes, fill handles, cross-table references, arbitrary JavaScript, and record-level persisted overrides. Input order is authoritative; datasource adapters prepare ordering and filtering before table evaluation.

The [Material Architecture Roadmap](./2026-07-11-material-architecture-roadmap.md) is the decision index, not an executable prerequisite. Do not execute the other three plans to completion before starting this one: foundation manifest conformance needs the table schema bootstrap, while the full table runtime needs the completed foundation, transaction, and Viewer contracts. Use these dependency gates instead:

1. Complete [Material Platform Foundation](./2026-07-11-material-platform-foundation.md) Tasks 1-8.
2. Complete this plan's schema-bootstrap tasks in the order below, ending with Task 19.
3. Resume Material Platform Foundation Tasks 9-15. Its table conformance work consumes `TableModel`, `tableSchemaAdapter`, the node factories, and legacy migration from the bootstrap; it creates the `table-static` and `table-data` manifest shells but does not wait for Task 20.
4. After the foundation is complete, execute [Document Transaction Editing](./2026-07-11-document-transaction-editing.md) and [Viewer Layout Runtime](./2026-07-11-viewer-layout-runtime.md) in parallel.
5. After both plans in gate 4 are complete, execute this plan's full-runtime tasks. Task 23's release gate runs only after every predecessor below has passed.

Schema-bootstrap prerequisites:

| Table task | Required predecessor |
| --- | --- |
| Task 1 | Material Platform Foundation Tasks 1-8 |
| Task 2 | Task 1 |
| Task 3 | Tasks 1-2 |
| Task 4 | Material Platform Foundation Tasks 1-8 and Tasks 1-3 |
| Task 19 | Task 4; it preserves the strict v1 codec and adds only legacy admission/migration |

Full-runtime prerequisites: every task in this group requires completed Material Platform Foundation Tasks 1-15 plus the completed Document Transaction Editing and Viewer Layout Runtime plans. The table-specific predecessors are:

| Table task | Additional table predecessor |
| --- | --- |
| Task 5 | Task 1 |
| Task 6 | Tasks 1, 3, and 5 |
| Task 7 | Task 4 |
| Task 8 | Tasks 4-7 |
| Task 9 | Tasks 4 and 7 |
| Task 10 | Tasks 8-9 |
| Task 11 | Tasks 2-3 |
| Task 12 | Task 11 |
| Task 13 | Tasks 2-3 and 11-12 |
| Task 14 | Tasks 4, 11, and 13 |
| Task 15 | Task 13 |
| Task 16 | Tasks 8 and 11-13 |
| Task 17 | Tasks 3, 8, 10, and 11 |
| Task 18 | Tasks 7-10 and 17 |
| Task 20 | Tasks 4, 8, 13, 15-19 and the foundation-created manifest shells; this task completes those shells and is never a foundation prerequisite |
| Task 21 | Tasks 2-3, 11, and 13 |
| Task 22 | Tasks 5-10 and 16-18 |
| Task 23 | Tasks 14-22 and all cross-plan conformance gates |

This plan consumes, but does not redefine, `CompiledMaterialProfile`, `SchemaAdapter`, `DocumentTransactionEngine`, `DocumentChangeSet`, `PreviewTransaction`, `MaterialLayoutPlan`, `MeasureService`, generic slots/reparenting, `FacetInstance`, and Viewer global pagination. Table code may only add table-domain models and adapters around those contracts.

Locked semantics:

- Rows, columns, cells, bands, merge regions, and runtime records have stable IDs.
- `table-data` has zero or more header bands, exactly one detail template band, and zero or more footer bands.
- A runtime detail instance is atomic for pagination. Header bands render once at the beginning; footer bands render once at the end.
- Empty collections produce zero detail instances.
- Detail height starts at the template minimum and grows per record after measurement.
- A detail instance taller than an empty output page is kept whole and emits an overflow diagnostic.
- Cell content is exactly one of plain text or a generic material slot.
- Merge never deletes covered-cell content. Covered cells become inactive and split restores them.
- Selection payloads support multiple stable-ID regions and are rebased after topology changes.
- `detailKey` is an optional binding port. Missing or duplicate keys fall back to index/occurrence identity scoped to the current `dataRevision` and emit diagnostics.
- Columns support deterministic `fixed` and `fr` tracks with optional minimum and maximum bounds. Content-driven auto tracks are excluded.
- Canonical v1 stores `TableModel` directly in `node.model`; only the legacy v0 admission shape temporarily uses `node.model.table` before the 0-to-1 adapter unwraps it.

## File Map

### Table Kernel

- Create `packages/materials/table/kernel/src/model.ts`: canonical private table model and branded IDs.
- Create `packages/materials/table/kernel/src/model.test.ts`: model construction and invariant tests.
- Create `packages/materials/table/kernel/src/topology-engine.ts`: all row/column/merge structural operations.
- Create `packages/materials/table/kernel/src/topology-engine.test.ts`: deterministic structural and lossless merge tests.
- Create `packages/materials/table/kernel/src/schema-adapter.ts`: table model normalization, validation, migration, and introspection.
- Create `packages/materials/table/kernel/src/schema-adapter.test.ts`: adapter issue paths, idempotence, and introspection tests.
- Create `packages/materials/table/kernel/src/legacy-migration.ts`: deterministic v0 root-table/cell-elements conversion.
- Create `packages/materials/table/kernel/src/legacy-migration.test.ts`: legacy merges, bindings, slots, and lossless compat tests.
- Create `packages/materials/table/kernel/src/tracks.ts`: fixed/fr track resolution.
- Create `packages/materials/table/kernel/src/tracks.test.ts`: min/max and insufficient-width tests.
- Create `packages/materials/table/kernel/src/style.ts`: box model, style cascade, and shared-edge resolution.
- Create `packages/materials/table/kernel/src/style.test.ts`: cascade, padding, RTL, and border conflict tests.
- Create `packages/materials/table/kernel/src/binding-scope.ts`: parent-linked detail-record scope construction.
- Create `packages/materials/table/kernel/src/binding-scope.test.ts`: root/detail scope identity and inheritance tests.
- Create `packages/materials/table/kernel/src/layout-plan.ts`: shared table `MaterialLayoutPlan` builder.
- Create `packages/materials/table/kernel/src/layout-plan.test.ts`: text/material-cell layout tests.
- Create `packages/materials/table/kernel/src/selection.ts`: stable multi-region selection normalization and navigation.
- Create `packages/materials/table/kernel/src/selection.test.ts`: merged-cell, multi-region, and rebase tests.
- Create `packages/materials/table/kernel/src/clipboard.ts`: internal JSON, HTML, and TSV interchange.
- Create `packages/materials/table/kernel/src/clipboard.test.ts`: sanitized external paste and ID rekey tests.
- Create `packages/materials/table/kernel/src/accessibility.ts`: semantic row groups and header associations.
- Create `packages/materials/table/kernel/src/accessibility.test.ts`: accessible naming and span tests.
- Create `packages/materials/table/kernel/src/viewer-tree.ts`: semantic `ViewerRenderTree` generation from accessibility and layout plans.
- Create `packages/materials/table/kernel/src/viewer-tree.test.ts`: static/data semantics, bindings, and hosted-slot tree tests.
- Create `packages/materials/table/kernel/src/editing/designer-window.ts`: shared cell viewport calculation.
- Create `packages/materials/table/kernel/src/editing/designer-window.test.ts`: overscan and focus-retention tests.
- Create `packages/materials/table/kernel/src/testing/arbitraries.ts`: deterministic randomized valid models and operations.
- Create `packages/materials/table/kernel/src/topology.fuzz.test.ts`: invariant sequence and inverse-operation tests.
- Create `packages/materials/table/kernel/src/table.performance.test.ts`: row, tree, cache, virtualization, and cancellation budgets.
- Modify `packages/materials/table/kernel/src/index.ts`: export the new table-domain API and remove superseded index-based helpers.

### Static Table

- Modify `packages/materials/table/static/src/manifest.ts`: complete the foundation-created `table-static` manifest and facets.
- Modify `packages/materials/table/static/src/schema.ts`: create node envelopes containing `TableModel`.
- Modify `packages/materials/table/static/src/designer.ts`: render/edit through the shared plan and transaction adapters.
- Modify `packages/materials/table/static/src/viewer.ts`: emit semantic Viewer render trees.
- Modify `packages/materials/table/static/src/index.ts`: export the manifest and node factory.
- Modify `packages/materials/table/static/src/viewer.test.ts`: semantic table and nested slot tests.

### Data Table

- Create `packages/materials/table/data/src/runtime-rows.ts`: cancellable chunked prepared runtime records and `RuntimeRowId` policy.
- Create `packages/materials/table/data/src/runtime-rows.test.ts`: key, fallback identity, empty input, and laziness tests.
- Create `packages/materials/table/data/src/runtime-layout.ts`: sequential per-record detail measurement and derived instance layout.
- Create `packages/materials/table/data/src/runtime-layout.test.ts`: independent row growth, empty data, scope, and cancellation tests.
- Create `packages/materials/table/data/src/pagination.ts`: table fragment adapter for global Viewer pagination.
- Create `packages/materials/table/data/src/pagination.test.ts`: first/last bands, atomic detail, and overflow tests.
- Modify `packages/materials/table/data/src/manifest.ts`: complete the foundation-created `table-data` manifest and facets.
- Modify `packages/materials/table/data/src/schema.ts`: create banded data-table node envelopes.
- Modify `packages/materials/table/data/src/designer.ts`: edit and preview only the single detail template; never expand runtime records in Designer.
- Modify `packages/materials/table/data/src/viewer.ts`: consume lazy runtime blocks and semantic render trees.
- Modify `packages/materials/table/data/src/index.ts`: export the manifest and node factory.
- Modify `packages/materials/table/data/src/viewer.test.ts`: lazy rendering and semantic output tests.

### Designer Integration And Assembly

- Create `packages/materials/table/kernel/src/editing/focus-controller.ts`: table focus, IME, and keyboard state machine.
- Create `packages/materials/table/kernel/src/editing/focus-controller.test.ts`: composition and navigation tests.
- Create `packages/materials/table/kernel/src/editing/table-editing-adapter.ts`: translate table intents into `DocumentChangeSet` and selection hints.
- Create `packages/materials/table/kernel/src/editing/table-editing-adapter.test.ts`: transaction and preview integration tests.
- Modify `packages/materials/table/kernel/src/editing/cell-decoration.ts`: use stable IDs, shared rects, and controlled editors.
- Modify `packages/builtin/src/types.ts`: keep table manifests in the shared built-in package contribution type.
- Modify `packages/builtin/src/basic.ts`: include both table manifests in the basic package contribution.
- Modify `packages/builtin/src/all.ts`: compose tables only through package contributions.
- Modify `packages/builtin/src/none.ts`: retain the empty contribution without table-specific exceptions.
- Modify `packages/builtin/src/index.ts`: export package contributions, never surface-specific registries.
- Modify `packages/builtin/src/index.test.ts`: assert one manifest source per table type in every compiled profile.
- Modify `packages/schema/src/codec.test.ts`: prove legacy table input is admitted and canonical output contains no legacy root fields.

## Task 1: Canonical Stable-ID Table Model

**Files:**
- Create: `packages/materials/table/kernel/src/model.ts`
- Test: `packages/materials/table/kernel/src/model.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write the failing model invariant tests**

```ts
// packages/materials/table/kernel/src/model.test.ts
import { describe, expect, it } from 'vitest'
import { assertJsonValue } from '@easyink/shared'
import { assertValidTableModel, createTableModel } from './model'

describe('TableModel', () => {
  it('creates stable row, column, cell, and band ids', () => {
    const table = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    expect(new Set(table.columns.map(column => column.id)).size).toBe(2)
    expect(new Set(table.bands.flatMap(band => band.rows.map(row => row.id))).size).toBe(2)
    expect(new Set(table.bands.flatMap(band => band.rows.flatMap(row => row.cells.map(cell => cell.id)))).size).toBe(4)
    expect(() => assertValidTableModel(table)).not.toThrow()
    expect(Object.hasOwn(table, 'data')).toBe(false)
    expect(() => assertJsonValue(table)).not.toThrow()
  })

  it('uses deterministic defaults and rejects an injected material-scope collision', () => {
    expect(createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 }))
      .toEqual(createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 }))
    const duplicate = { allocate: () => 'same-id' }
    expect(() => createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 }, duplicate))
      .toThrow(/duplicate column id/)
  })

  it.each(['', 'bad id', 'x'.repeat(129)])('rejects invalid allocator token %j', (value) => {
    expect(() => createTableModel(
      { kind: 'static', columnCount: 1, rowCount: 1 }, { allocate: () => value },
    )).toThrow(/invalid/)
  })

  it('validates constructor counts before allocation', () => {
    expect(() => createTableModel({ kind: 'static', columnCount: 0, rowCount: 1 })).toThrow(/columnCount/)
    expect(() => createTableModel({ kind: 'data', columnCount: 1, rowCount: 2 })).toThrow(/rowCount/)
  })

  it('rejects duplicate cell ids and missing column coverage', () => {
    const table = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    table.bands[0]!.rows[0]!.cells[1]!.id = table.bands[0]!.rows[0]!.cells[0]!.id
    table.bands[0]!.rows[0]!.cells.pop()
    expect(() => assertValidTableModel(table)).toThrow(/duplicate cell id|cover every column/)
  })

  it('rejects duplicate column coverage and non-rectangular merges', () => {
    const table = createTableModel({ kind: 'static', columnCount: 3, rowCount: 2 })
    table.bands[0]!.rows[0]!.cells[1]!.columnId = table.columns[0]!.id
    expect(() => assertValidTableModel(table)).toThrow(/cover every column exactly once/)
    table.bands[0]!.rows[0]!.cells[1]!.columnId = table.columns[1]!.id
    const rows = table.bands[0]!.rows
    table.merges.push({
      id: 'merge-invalid' as never,
      anchorCellId: rows[0]!.cells[0]!.id,
      rowIds: rows.map(row => row.id),
      columnIds: [table.columns[0]!.id, table.columns[2]!.id],
      inactiveCellIds: [rows[0]!.cells[2]!.id, rows[1]!.cells[0]!.id, rows[1]!.cells[2]!.id],
    })
    expect(() => assertValidTableModel(table)).toThrow(/must be rectangular/)
  })

  it('requires one and only one runtime detail template row', () => {
    const table = createTableModel({ kind: 'data', columnCount: 2, rowCount: 1 })
    const template = table.bands[0]!.rows[0]!
    table.bands[0]!.rows.push({
      ...template,
      id: 'row-second-template' as never,
      cells: template.cells.map((cell, index) => ({ ...cell, id: `cell-second-${index}` as never })),
    })
    expect(() => assertValidTableModel(table)).toThrow(/exactly one template row/)
  })
})
```

- [ ] **Step 2: Run the focused test and confirm the missing module failure**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/model.test.ts`

Expected: FAIL with `Failed to load url ./model`.

- [ ] **Step 3: Add the canonical model and invariant checker**

```ts
// packages/materials/table/kernel/src/model.ts
import { assertJsonValue } from '@easyink/shared'

export type TableId<T extends string> = string & { readonly __tableId: T }
export type TableBandId = TableId<'band'>
export type TableRowId = TableId<'row'>
export type TableColumnId = TableId<'column'>
export type TableCellId = TableId<'cell'>
export type TableMergeId = TableId<'merge'>
export type RuntimeRowId = TableId<'runtime-row'>
export type TableIdentityKind = 'band' | 'row' | 'column' | 'cell' | 'merge'

export interface TableIdentityAllocator {
  allocate(kind: TableIdentityKind, occupied: ReadonlySet<string>): string
}

export function isValidTableStableToken(value: unknown, maxBytes = 128): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]+$/.test(value)
    && new TextEncoder().encode(value).byteLength >= 1
    && new TextEncoder().encode(value).byteLength <= maxBytes
}

export function createSequentialTableIdentityAllocator(namespace = 'default'): TableIdentityAllocator {
  const counters = new Map<TableIdentityKind, number>()
  return {
    allocate(kind, occupied) {
      let counter = counters.get(kind) ?? 0
      let candidate = `${namespace}-${kind}-${counter}`
      while (occupied.has(candidate)) candidate = `${namespace}-${kind}-${++counter}`
      counters.set(kind, counter + 1)
      return candidate
    },
  }
}

export function allocateTableIdentity<T extends TableIdentityKind>(
  allocator: TableIdentityAllocator,
  kind: T,
  occupied: Set<string>,
): TableId<T> {
  const value = allocator.allocate(kind, occupied)
  if (!isValidTableStableToken(value) || occupied.has(value))
    throw new Error(`table identity allocator returned an invalid or duplicate ${kind} id`)
  occupied.add(value)
  return value as TableId<T>
}

export type TableTrack
  = | { kind: 'fixed', size: number, min?: number, max?: number }
    | { kind: 'fr', weight: number, min?: number, max?: number }

export interface TableInsets { top: number, right: number, bottom: number, left: number }
export interface TableBorderStyle { width: number, color: string, style: 'solid' | 'dashed' | 'dotted' | 'double' | 'none' }
export interface TableTypography {
  fontFamily?: string
  fontSize?: number
  color?: string
  fontWeight?: 'normal' | 'bold'
  fontStyle?: 'normal' | 'italic'
  lineHeight?: number
  letterSpacing?: number
  textAlign?: 'start' | 'center' | 'end'
  verticalAlign?: 'top' | 'middle' | 'bottom'
  direction?: 'auto' | 'ltr' | 'rtl'
}
export interface TableStyle {
  padding?: Partial<TableInsets>
  background?: string
  typography?: TableTypography
  border?: Partial<Record<'blockStart' | 'inlineEnd' | 'blockEnd' | 'inlineStart', TableBorderStyle>>
  overflow?: 'clip' | 'visible'
}

export type TableCellContent
  = | { kind: 'text', text: string, bindingPort?: string }
    | { kind: 'materials', slotId: string }

export interface TableCell { id: TableCellId, columnId: TableColumnId, content: TableCellContent, style?: TableStyle }
export interface TableRow { id: TableRowId, minHeight: number, cells: TableCell[], style?: TableStyle }
export type TableBandRole = 'body' | 'header' | 'detail' | 'footer'
export interface TableBand { id: TableBandId, role: TableBandRole, rows: TableRow[], style?: TableStyle }
export interface TableColumn { id: TableColumnId, track: TableTrack, style?: TableStyle }
export interface TableMergeRegion {
  id: TableMergeId
  anchorCellId: TableCellId
  rowIds: TableRowId[]
  columnIds: TableColumnId[]
  inactiveCellIds: TableCellId[]
}
export interface TableDataConfig { collectionPort: string, detailKeyPort?: string }
export interface TableAccessibility { caption?: string, description?: string, decorative?: boolean }
export interface TableModel {
  kind: 'static' | 'data'
  columns: TableColumn[]
  bands: TableBand[]
  merges: TableMergeRegion[]
  style: TableStyle
  data?: TableDataConfig
  accessibility?: TableAccessibility
}

export function encodeTableOpaqueIdPart(value: string): string {
  const bytes = new TextEncoder().encode(value)
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${bytes.length}-${hex}`
}

export function createTableModel(
  input: { kind: 'static' | 'data', columnCount: number, rowCount: number },
  allocator: TableIdentityAllocator = createSequentialTableIdentityAllocator(),
): TableModel {
  if (!Number.isSafeInteger(input.columnCount) || input.columnCount <= 0)
    throw new Error('table columnCount must be a positive safe integer')
  if (!Number.isSafeInteger(input.rowCount) || input.rowCount <= 0
    || input.kind === 'data' && input.rowCount !== 1)
    throw new Error(input.kind === 'data'
      ? 'table-data rowCount must equal one detail template row'
      : 'table-static rowCount must be a positive safe integer')
  const occupied = new Set<string>()
  const columns = Array.from({ length: input.columnCount }, () => ({
    id: allocateTableIdentity(allocator, 'column', occupied), track: { kind: 'fr', weight: 1 } as TableTrack,
  }))
  const rows = Array.from({ length: input.rowCount }, () => ({
    id: allocateTableIdentity(allocator, 'row', occupied),
    minHeight: 8,
    cells: columns.map(column => ({
      id: allocateTableIdentity(allocator, 'cell', occupied),
      columnId: column.id,
      content: { kind: 'text', text: '' } as TableCellContent,
    })),
  }))
  const model: TableModel = {
    kind: input.kind,
    columns,
    bands: [{ id: allocateTableIdentity(allocator, 'band', occupied), role: input.kind === 'data' ? 'detail' : 'body', rows }],
    merges: [],
    style: {},
    ...(input.kind === 'data' ? { data: { collectionPort: 'records' } } : {}),
  }
  assertValidTableModel(model)
  assertJsonValue(model)
  return model
}

export function assertValidTableModel(table: TableModel): void {
  if (!table.columns.length) throw new Error('table requires at least one column')
  const ids = new Set<string>()
  const claim = (value: string, label: string) => {
    if (!isValidTableStableToken(value)) throw new Error(`invalid ${label} id: ${value}`)
    if (ids.has(value)) throw new Error(`duplicate ${label} id: ${value}`)
    ids.add(value)
  }
  table.columns.forEach(column => claim(column.id, 'column'))
  const columnIds = new Set(table.columns.map(column => column.id))
  const rowById = new Map<TableRowId, { bandId: TableBandId, row: TableRow }>()
  const cellById = new Map<TableCellId, TableCell>()
  for (const band of table.bands) {
    claim(band.id, 'band')
    if (!band.rows.length) throw new Error(`band ${band.id} requires at least one row`)
    for (const row of band.rows) {
      claim(row.id, 'row')
      rowById.set(row.id, { bandId: band.id, row })
      const coveredColumns = new Set(row.cells.map(cell => cell.columnId))
      if (row.cells.length !== table.columns.length || coveredColumns.size !== table.columns.length
        || row.cells.some(cell => !columnIds.has(cell.columnId)))
        throw new Error(`row ${row.id} must cover every column exactly once`)
      for (const cell of row.cells) {
        claim(cell.id, 'cell')
        if (cell.content.kind === 'text' && cell.content.bindingPort != null && !cell.content.bindingPort.trim())
          throw new Error(`text cell ${cell.id} has an invalid binding port`)
        if (cell.content.kind === 'materials' && cell.content.slotId !== `cell:${cell.id}`)
          throw new Error(`materials cell ${cell.id} must use its stable cell slot key`)
        cellById.set(cell.id, cell)
      }
    }
  }
  const claimedMergeCells = new Set<TableCellId>()
  for (const merge of table.merges) {
    claim(merge.id, 'merge')
    const rows = merge.rowIds.map(rowId => rowById.get(rowId))
    if (!rows.length || rows.some(row => !row)) throw new Error(`merge ${merge.id} contains an unknown row`)
    if (new Set(rows.map(row => row!.bandId)).size !== 1) throw new Error(`merge ${merge.id} must stay inside one band`)
    if (!merge.columnIds.length || merge.columnIds.some(columnId => !columnIds.has(columnId)))
      throw new Error(`merge ${merge.id} contains an unknown column`)
    const bandRows = table.bands.find(band => band.id === rows[0]!.bandId)!.rows
    const rowIndices = merge.rowIds.map(rowId => bandRows.findIndex(row => row.id === rowId)).sort((a, b) => a - b)
    const columnIndices = merge.columnIds.map(columnId => table.columns.findIndex(column => column.id === columnId)).sort((a, b) => a - b)
    const contiguous = (values: number[]) => values.every((value, index) => index === 0 || value === values[index - 1]! + 1)
    if (new Set(merge.rowIds).size !== merge.rowIds.length || new Set(merge.columnIds).size !== merge.columnIds.length
      || !contiguous(rowIndices) || !contiguous(columnIndices)) throw new Error(`merge ${merge.id} must be rectangular`)
    const regionCells = merge.rowIds.flatMap(rowId => {
      const row = rowById.get(rowId)!.row
      return merge.columnIds.map(columnId => row.cells.find(cell => cell.columnId === columnId)!)
    })
    if (!regionCells.some(cell => cell.id === merge.anchorCellId)) throw new Error(`merge ${merge.id} anchor is outside its region`)
    const expectedInactive = regionCells.filter(cell => cell.id !== merge.anchorCellId).map(cell => cell.id)
    if (new Set(merge.inactiveCellIds).size !== expectedInactive.length
      || expectedInactive.some(cellId => !merge.inactiveCellIds.includes(cellId))
      || merge.inactiveCellIds.some(cellId => !cellById.has(cellId)))
      throw new Error(`merge ${merge.id} inactive cells do not match its rectangle`)
    for (const cell of regionCells) {
      if (claimedMergeCells.has(cell.id)) throw new Error(`merge ${merge.id} overlaps another merge`)
      claimedMergeCells.add(cell.id)
    }
  }
  const details = table.bands.filter(band => band.role === 'detail')
  if (table.kind === 'data' && details.length !== 1) throw new Error('table-data requires exactly one detail band')
  if (table.kind === 'data' && details[0]!.rows.length !== 1) throw new Error('table-data detail band requires exactly one template row')
  if (table.kind === 'data' && table.bands.some(band => band.role === 'body')) throw new Error('table-data cannot contain body bands')
  if (table.kind === 'data') {
    const order = { header: 0, detail: 1, footer: 2 } as const
    if (table.bands.some((band, index) => index > 0
      && order[band.role as keyof typeof order] < order[table.bands[index - 1]!.role as keyof typeof order]))
      throw new Error('table-data bands must be ordered header, detail, footer')
    if (!table.data) throw new Error('table-data requires data configuration')
  }
  if (table.kind === 'static' && details.length > 0) throw new Error('table-static cannot contain a detail band')
  if (table.kind === 'static' && table.data) throw new Error('table-static cannot contain data configuration')
}
```

Add these exports to `packages/materials/table/kernel/src/index.ts`:

```ts
export * from './model'
```

- [ ] **Step 4: Run the focused test and typecheck the package**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/model.test.ts`

Expected: PASS with `4 passed`.

Run: `pnpm --filter @easyink/material-table-kernel build`

Expected: PASS and `packages/materials/table/kernel/dist` is produced.

- [ ] **Step 5: Commit the canonical model**

```bash
git add packages/materials/table/kernel/src/model.ts packages/materials/table/kernel/src/model.test.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): add stable report table model"
```

## Task 2: Structural TableTopologyEngine

**Files:**
- Create: `packages/materials/table/kernel/src/topology-engine.ts`
- Test: `packages/materials/table/kernel/src/topology-engine.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write failing ID-preserving structural tests**

```ts
// packages/materials/table/kernel/src/topology-engine.test.ts
import { describe, expect, it } from 'vitest'
import { deepClone } from '@easyink/shared'
import { createSequentialTableIdentityAllocator, createTableModel } from './model'
import {
  invertTableTopologyDelta, materializeTableTopologyDelta, TableTopologyEngine,
} from './topology-engine'

describe('TableTopologyEngine structural operations', () => {
  it('inserts, removes, and reorders columns without changing surviving ids', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const identities = createSequentialTableIdentityAllocator('edit')
    const original = source.columns.map(column => column.id)
    const inserted = TableTopologyEngine.insertColumn(source, {
      after: original[0]!, track: { kind: 'fr', weight: 1 }, identities,
    })
    const added = inserted.columns.find(column => !original.includes(column.id))!
    const movedBack = TableTopologyEngine.reorderColumn(inserted, added.id, { after: original[1]! })
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
      bandId: band.id, after: original[0]!, minHeight: 12, identities,
    })
    const added = inserted.bands[0]!.rows.find(row => !original.includes(row.id))!
    const movedBack = TableTopologyEngine.reorderRow(inserted, added.id, { after: original[1]! })
    expect(movedBack.bands[0]!.rows.map(row => row.id)).toEqual([...original, added.id])
    const reordered = TableTopologyEngine.reorderRow(movedBack, added.id, { before: original[0]! })
    expect(reordered.bands[0]!.rows.map(row => row.id)).toEqual([added.id, ...original])
    const result = TableTopologyEngine.removeRow(reordered, added.id)
    expect(result.model.bands[0]!.rows.map(row => row.id)).toEqual(original)
    expect(result.rebase.rows).toEqual([{ removedId: added.id, nearestSurvivorId: original[0] }])
  })

  it('inserts, reorders, and removes 0..N header/footer bands without moving the detail band', () => {
    const source = createTableModel({ kind: 'data', columnCount: 2, rowCount: 1 })
    const identities = createSequentialTableIdentityAllocator('band-edit')
    const first = TableTopologyEngine.insertBand(source, { role: 'header', minHeight: 8, identities })
    const firstHeader = first.bands.find(band => band.role === 'header')!
    const second = TableTopologyEngine.insertBand(first, {
      role: 'header', after: firstHeader.id, minHeight: 8, identities,
    })
    const secondHeader = second.bands.filter(band => band.role === 'header')[1]!
    const withFooter = TableTopologyEngine.insertBand(second, { role: 'footer', minHeight: 8, identities })
    const reordered = TableTopologyEngine.reorderBand(withFooter, secondHeader.id, { before: firstHeader.id })
    expect(reordered.bands.map(band => band.role)).toEqual(['header', 'header', 'detail', 'footer'])
    const removedHeader = reordered.bands[0]!
    removedHeader.rows[0]!.cells[0]!.content = { kind: 'materials', slotId: `cell:${removedHeader.rows[0]!.cells[0]!.id}` }
    removedHeader.rows[0]!.cells[1]!.content = { kind: 'text', text: '', bindingPort: 'header-value' }
    const removed = TableTopologyEngine.removeBand(reordered, removedHeader.id)
    expect(removed.model.bands.map(band => band.role)).toEqual(['header', 'detail', 'footer'])
    expect(removed.effects).toMatchObject({
      removedCellIds: removedHeader.rows[0]!.cells.map(cell => cell.id),
      releasedSlotIds: [`cell:${removedHeader.rows[0]!.cells[0]!.id}`],
      releasedBindingPorts: ['header-value'],
    })
  })

  it('fails closed on an unknown stable sibling and leaves the source byte-equivalent', () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const before = deepClone(source)
    expect(() => TableTopologyEngine.planInsertColumn(source, {
      after: 'missing-column' as never, track: { kind: 'fr', weight: 1 },
      identities: createSequentialTableIdentityAllocator('edit'), topologyRevision: 4,
    })).toThrow(/column not found/)
    expect(source).toEqual(before)
  })

  it('emits bounded forward/inverse scripts instead of replacing the full model', () => {
    const source = createTableModel({ kind: 'static', columnCount: 20, rowCount: 100 })
    const delta = TableTopologyEngine.planInsertColumn(source, {
      after: source.columns[0]!.id, track: { kind: 'fr', weight: 1 },
      identities: createSequentialTableIdentityAllocator('edit'), topologyRevision: 7,
    })
    expect(delta.forward.length).toBeLessThanOrEqual(102)
    expect(delta.inverse.length).toBe(delta.forward.length)
    expect(delta.affectedModelPaths).not.toContain('/model')
    const changed = materializeTableTopologyDelta(source, delta, 7)
    expect(materializeTableTopologyDelta(changed, invertTableTopologyDelta(delta), 8)).toEqual(source)
  })
})
```

- [ ] **Step 2: Run the test and confirm the missing engine failure**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/topology-engine.test.ts`

Expected: FAIL with `Failed to load url ./topology-engine`.

- [ ] **Step 3: Implement stable-ID topology deltas and pure materializers**

```ts
// packages/materials/table/kernel/src/topology-engine.ts
import type {
  TableBand, TableBandId, TableCell, TableColumnId, TableIdentityAllocator, TableModel, TableRow, TableRowId,
  TableTrack,
} from './model'
import { deepClone } from '@easyink/shared'
import { allocateTableIdentity, assertValidTableModel } from './model'

export interface RemovedIdFallback<T extends string> { removedId: T, nearestSurvivorId?: T }
export interface TableSelectionRebaseHint {
  rows: RemovedIdFallback<TableRowId>[]
  columns: RemovedIdFallback<TableColumnId>[]
}
export interface TableTopologyEffects {
  removedCellIds: TableCell['id'][]
  releasedSlotIds: string[]
  releasedBindingPorts: string[]
}
export interface TableTopologyResult {
  model: TableModel
  rebase: TableSelectionRebaseHint
  effects: TableTopologyEffects
}
export type TableTopologyPath = readonly (string | number)[]
export type TableTopologyEdit
  = | { kind: 'splice', path: TableTopologyPath, index: number, deleteCount: number, values: unknown[] }
    | { kind: 'set', path: TableTopologyPath, value: unknown }
    | { kind: 'delete', path: TableTopologyPath }
export interface TableTopologyDelta {
  expectedTopologyRevision: number
  forward: readonly TableTopologyEdit[]
  inverse: readonly TableTopologyEdit[]
  affectedModelPaths: readonly `/${string}`[]
  rebase: TableSelectionRebaseHint
  effects: TableTopologyEffects
}
export type StableSiblingTarget<T extends string> = { before: T } | { after: T } | { atEnd: true }

export function applyTableTopologyDelta(
  draft: TableModel,
  delta: TableTopologyDelta,
  currentTopologyRevision: number,
): void {
  if (currentTopologyRevision !== delta.expectedTopologyRevision)
    throw new Error('TABLE_TOPOLOGY_REVISION_STALE')
  for (const edit of delta.forward) applyTableTopologyEdit(draft, edit)
}

export function materializeTableTopologyDelta(
  source: TableModel,
  delta: TableTopologyDelta,
  currentTopologyRevision: number,
): TableModel {
  const model = deepClone(source)
  applyTableTopologyDelta(model, delta, currentTopologyRevision)
  assertValidTableModel(model)
  return model
}

export function invertTableTopologyDelta(delta: TableTopologyDelta): TableTopologyDelta {
  return {
    ...delta, expectedTopologyRevision: delta.expectedTopologyRevision + 1,
    forward: delta.inverse, inverse: delta.forward,
  }
}

function applyTableTopologyEdit(root: TableModel, edit: TableTopologyEdit): void {
  const valueAt = (path: TableTopologyPath): unknown => path.reduce<unknown>((value, segment) =>
    (value as Record<string | number, unknown>)[segment], root)
  if (edit.kind === 'splice') {
    const target = valueAt(edit.path)
    if (!Array.isArray(target)) throw new Error('table topology splice path is not an array')
    target.splice(edit.index, edit.deleteCount, ...deepClone(edit.values))
    return
  }
  const parent = valueAt(edit.path.slice(0, -1)) as Record<string | number, unknown>
  const key = edit.path.at(-1)
  if (key === undefined) throw new Error('table topology edit path is empty')
  if (edit.kind === 'delete') delete parent[key]
  else parent[key] = deepClone(edit.value)
}

function finish(
  model: TableModel,
  rebase: TableSelectionRebaseHint = { rows: [], columns: [] },
  effects: TableTopologyEffects = { removedCellIds: [], releasedSlotIds: [], releasedBindingPorts: [] },
): TableTopologyResult {
  assertValidTableModel(model)
  return { model, rebase, effects }
}

function removalEffects(cells: readonly TableCell[]): TableTopologyEffects {
  return {
    removedCellIds: cells.map(cell => cell.id),
    releasedSlotIds: cells.flatMap(cell => cell.content.kind === 'materials' ? [cell.content.slotId] : []),
    releasedBindingPorts: cells.flatMap(cell => cell.content.kind === 'text' && cell.content.bindingPort
      ? [cell.content.bindingPort]
      : []),
  }
}

function occupiedIdentities(model: TableModel): Set<string> {
  return new Set([
    ...model.columns.map(column => column.id),
    ...model.bands.flatMap(band => [band.id, ...band.rows.flatMap(row => [row.id, ...row.cells.map(cell => cell.id)])]),
    ...model.merges.map(merge => merge.id),
  ])
}

function emptyCell(columnId: TableColumnId, allocator: TableIdentityAllocator, occupied: Set<string>): TableCell {
  return { id: allocateTableIdentity(allocator, 'cell', occupied), columnId, content: { kind: 'text', text: '' } }
}

function emptyRow(
  columns: readonly TableModel['columns'][number][],
  minHeight: number,
  allocator: TableIdentityAllocator,
  occupied: Set<string>,
): TableRow {
  return {
    id: allocateTableIdentity(allocator, 'row', occupied), minHeight,
    cells: columns.map(column => emptyCell(column.id, allocator, occupied)),
  }
}

function nearest<T>(values: readonly T[], removedIndex: number): T | undefined {
  return values[removedIndex] ?? values[removedIndex - 1]
}

function moveByStableSibling<T, TId extends string>(
  items: T[],
  movedId: TId,
  target: StableSiblingTarget<TId>,
  readId: (item: T) => TId,
): void {
  const from = items.findIndex(item => readId(item) === movedId)
  if (from < 0) throw new Error(`item not found: ${movedId}`)
  if (('before' in target && target.before === movedId) || ('after' in target && target.after === movedId)) return
  const [item] = items.splice(from, 1)
  if ('atEnd' in target) {
    items.push(item!)
    return
  }
  const siblingId = 'before' in target ? target.before : target.after
  const siblingIndex = items.findIndex(candidate => readId(candidate) === siblingId)
  if (siblingIndex < 0) throw new Error(`sibling not found: ${siblingId}`)
  items.splice(siblingIndex + ('after' in target ? 1 : 0), 0, item!)
}

function refreshMerge(model: TableModel, merge: TableModel['merges'][number]): boolean {
  const rows = model.bands.flatMap(band => band.rows).filter(row => merge.rowIds.includes(row.id))
  const cells = rows.flatMap(row => row.cells.filter(cell => merge.columnIds.includes(cell.columnId)))
  if (cells.length <= 1) return false
  if (!cells.some(cell => cell.id === merge.anchorCellId)) merge.anchorCellId = cells[0]!.id
  merge.inactiveCellIds = cells.filter(cell => cell.id !== merge.anchorCellId).map(cell => cell.id)
  return true
}

export class TableTopologyEngine {
  static insertColumn(source: TableModel, input: {
    after?: TableColumnId
    track: TableTrack
    identities: TableIdentityAllocator
  }): TableModel {
    const model = deepClone(source)
    const occupied = occupiedIdentities(model)
    const siblingIndex = input.after ? model.columns.findIndex(column => column.id === input.after) : -1
    if (input.after && siblingIndex < 0) throw new Error(`column not found: ${input.after}`)
    const index = input.after ? siblingIndex + 1 : 0
    const columnId = allocateTableIdentity(input.identities, 'column', occupied)
    model.columns.splice(Math.max(0, index), 0, { id: columnId, track: input.track })
    for (const band of model.bands) for (const row of band.rows)
      row.cells.splice(Math.max(0, index), 0, emptyCell(columnId, input.identities, occupied))
    for (const merge of model.merges) {
      const indices = merge.columnIds.map(id => model.columns.findIndex(column => column.id === id))
      if (index > Math.min(...indices) && index < Math.max(...indices)) {
        merge.columnIds.splice(indices.filter(value => value < index).length, 0, columnId)
        refreshMerge(model, merge)
      }
    }
    return finish(model).model
  }

  static removeColumn(source: TableModel, columnId: TableColumnId): TableTopologyResult {
    const model = deepClone(source)
    const index = model.columns.findIndex(column => column.id === columnId)
    if (index < 0) throw new Error(`column not found: ${columnId}`)
    if (model.columns.length === 1) throw new Error('a table must retain at least one column')
    const removedCells = model.bands.flatMap(band => band.rows.flatMap(row =>
      row.cells.filter(cell => cell.columnId === columnId)))
    model.columns.splice(index, 1)
    for (const band of model.bands) for (const row of band.rows)
      row.cells = row.cells.filter(cell => cell.columnId !== columnId)
    for (const merge of model.merges) merge.columnIds = merge.columnIds.filter(id => id !== columnId)
    model.merges = model.merges.filter(merge => refreshMerge(model, merge))
    return finish(model, {
      rows: [],
      columns: [{ removedId: columnId, nearestSurvivorId: nearest(model.columns.map(column => column.id), index) }],
    }, removalEffects(removedCells))
  }

  static reorderColumn(source: TableModel, columnId: TableColumnId, target: StableSiblingTarget<TableColumnId>): TableModel {
    const model = deepClone(source)
    moveByStableSibling(model.columns, columnId, target, column => column.id)
    const order = new Map(model.columns.map((column, index) => [column.id, index]))
    for (const band of model.bands) for (const row of band.rows)
      row.cells.sort((a, b) => order.get(a.columnId)! - order.get(b.columnId)!)
    return finish(model).model
  }

  static insertRow(source: TableModel, input: {
    bandId: TableBandId
    after?: TableRowId
    minHeight: number
    identities: TableIdentityAllocator
  }): TableModel {
    const model = deepClone(source)
    const occupied = occupiedIdentities(model)
    const band = model.bands.find(candidate => candidate.id === input.bandId)
    if (!band) throw new Error(`band not found: ${input.bandId}`)
    const index = input.after ? band.rows.findIndex(row => row.id === input.after) + 1 : 0
    if (input.after && index === 0) throw new Error(`row not found in band: ${input.after}`)
    const row = emptyRow(model.columns, input.minHeight, input.identities, occupied)
    band.rows.splice(index, 0, row)
    for (const merge of model.merges) {
      const indices = merge.rowIds.map(id => band.rows.findIndex(candidate => candidate.id === id)).filter(value => value >= 0)
      if (indices.length && index > Math.min(...indices) && index < Math.max(...indices)) {
        merge.rowIds.splice(indices.filter(value => value < index).length, 0, row.id)
        refreshMerge(model, merge)
      }
    }
    return finish(model).model
  }

  static removeRow(source: TableModel, rowId: TableRowId): TableTopologyResult {
    const model = deepClone(source)
    const band = model.bands.find(candidate => candidate.rows.some(row => row.id === rowId))
    if (!band) throw new Error(`row not found: ${rowId}`)
    const index = band.rows.findIndex(row => row.id === rowId)
    if (band.rows.length === 1) throw new Error('a table band must retain at least one row')
    const removedCells = [...band.rows[index]!.cells]
    band.rows.splice(index, 1)
    for (const merge of model.merges) merge.rowIds = merge.rowIds.filter(id => id !== rowId)
    model.merges = model.merges.filter(merge => refreshMerge(model, merge))
    return finish(model, {
      rows: [{ removedId: rowId, nearestSurvivorId: nearest(band.rows.map(row => row.id), index) }],
      columns: [],
    }, removalEffects(removedCells))
  }

  static reorderRow(source: TableModel, rowId: TableRowId, target: StableSiblingTarget<TableRowId>): TableModel {
    const model = deepClone(source)
    const band = model.bands.find(candidate => candidate.rows.some(row => row.id === rowId))
    if (!band) throw new Error(`row not found: ${rowId}`)
    moveByStableSibling(band.rows, rowId, target, row => row.id)
    return finish(model).model
  }

  static insertBand(source: TableModel, input: {
    role: 'header' | 'footer'
    after?: TableBandId
    minHeight: number
    identities: TableIdentityAllocator
  }): TableModel {
    if (source.kind !== 'data') throw new Error('band insertion is defined only for table-data in v1')
    const model = deepClone(source)
    const occupied = occupiedIdentities(model)
    let index: number
    if (input.after) {
      index = model.bands.findIndex(band => band.id === input.after)
      if (index < 0 || model.bands[index]!.role !== input.role)
        throw new Error(`new ${input.role} band requires a same-role sibling`)
      index += 1
    }
    else if (input.role === 'header') index = model.bands.findIndex(band => band.role !== 'header')
    else index = model.bands.length
    const band: TableBand = {
      id: allocateTableIdentity(input.identities, 'band', occupied), role: input.role,
      rows: [emptyRow(model.columns, input.minHeight, input.identities, occupied)],
    }
    model.bands.splice(index < 0 ? model.bands.length : index, 0, band)
    return finish(model).model
  }

  static removeBand(source: TableModel, bandId: TableBandId): TableTopologyResult {
    const model = deepClone(source)
    const index = model.bands.findIndex(band => band.id === bandId)
    if (index < 0) throw new Error(`band not found: ${bandId}`)
    const band = model.bands[index]!
    if (band.role !== 'header' && band.role !== 'footer')
      throw new Error('the required data detail band cannot be removed')
    const removedRows = band.rows.map(row => row.id)
    const removedCells = band.rows.flatMap(row => row.cells)
    model.bands.splice(index, 1)
    const survivingRows = model.bands.flatMap(candidate => candidate.rows.map(row => row.id))
    model.merges = model.merges.filter(merge => !merge.rowIds.some(rowId => removedRows.includes(rowId)))
    return finish(model, {
      rows: removedRows.map(removedId => ({ removedId, nearestSurvivorId: survivingRows[0] })), columns: [],
    }, removalEffects(removedCells))
  }

  static reorderBand(
    source: TableModel,
    bandId: TableBandId,
    target: StableSiblingTarget<TableBandId>,
  ): TableModel {
    const model = deepClone(source)
    const from = model.bands.findIndex(band => band.id === bandId)
    if (from < 0) throw new Error(`band not found: ${bandId}`)
    const role = model.bands[from]!.role
    if (role !== 'header' && role !== 'footer') throw new Error('the detail band is immovable')
    if (!('atEnd' in target)) {
      const siblingId = 'before' in target ? target.before : target.after
      const sibling = model.bands.find(band => band.id === siblingId)
      if (!sibling || sibling.role !== role) throw new Error('band reorder target must have the same role')
      moveByStableSibling(model.bands, bandId, target, band => band.id)
    }
    else {
      const [moved] = model.bands.splice(from, 1)
      const nextRoleIndex = role === 'header' ? model.bands.findIndex(band => band.role !== 'header') : -1
      model.bands.splice(nextRoleIndex < 0 ? model.bands.length : nextRoleIndex, 0, moved!)
    }
    return finish(model).model
  }
}
```

Factor each structural algorithm above into `planInsertColumn`, `planRemoveColumn`, `planReorderColumn`, `planInsertRow`, `planRemoveRow`, `planReorderRow`, `planInsertBand`, `planRemoveBand`, and `planReorderBand`. A planner reads the immutable source and host-owned `topologyRevision`, validates every stable sibling before allocating, and emits forward/inverse `TableTopologyEdit` values plus exact RFC 6901 `affectedModelPaths`; it never clones or mutates `source`. The convenience model-returning methods used by pure tests and fuzz call the same planner and then `materializeTableTopologyDelta()`. Production transaction recipes call `applyTableTopologyDelta()` directly against the mutative draft, so an inserted column produces one column splice plus one cell splice per row, not a `/model` replacement, and untouched bands/rows/cells retain structural sharing.

The injected `TableIdentityAllocator` is mandatory for every planner that creates a band, row, column, cell, or merge. Validate its output with the same exported stable-token predicate used by the v1 codec and `assertValidTableModel`: UTF-8 length and character rules are identical, and empty, whitespace-containing, over-128-byte, or already occupied values fail before a delta is returned. Default factories use `createSequentialTableIdentityAllocator`; Designer transactions inject a host allocator; migration uses its path/content allocator; fuzz injects a seed-replay allocator.

Add the export:

```ts
export * from './topology-engine'
```

- [ ] **Step 4: Run the structural tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/topology-engine.test.ts`

Expected: PASS with `3 passed`; each operation preserves all surviving IDs, data bands remain `header* -> detail -> footer*`, and removals report every released cell/slot/port for one atomic transaction disposition. Any reorder that would make a merge non-rectangular is rejected by `assertValidTableModel` without mutating the source.

- [ ] **Step 5: Commit the topology engine**

```bash
git add packages/materials/table/kernel/src/topology-engine.ts packages/materials/table/kernel/src/topology-engine.test.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): add stable topology operations"
```

## Task 3: Lossless Merge Regions

**Files:**
- Modify: `packages/materials/table/kernel/src/topology-engine.ts`
- Modify: `packages/materials/table/kernel/src/topology-engine.test.ts`

- [ ] **Step 1: Add failing lossless merge tests**

```ts
it('preserves covered cell content and restores it after split', () => {
  const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
  const cells = source.bands[0]!.rows.flatMap(row => row.cells)
  cells.forEach((cell, index) => { cell.content = { kind: 'text', text: `cell-${index}` } })
  const rowIds = source.bands[0]!.rows.map(row => row.id)
  const columnIds = source.columns.map(column => column.id)
  const merged = TableTopologyEngine.merge(source, {
    rowIds, columnIds, anchorCellId: cells[0]!.id,
    identities: createSequentialTableIdentityAllocator('merge'),
  })
  expect(merged.merges[0]!.inactiveCellIds).toEqual(cells.slice(1).map(cell => cell.id))
  expect(merged.bands[0]!.rows.flatMap(row => row.cells).map(cell => cell.content)).toEqual(cells.map(cell => cell.content))
  const split = TableTopologyEngine.split(merged, merged.merges[0]!.id)
  expect(split.merges).toEqual([])
  expect(split.bands[0]!.rows.flatMap(row => row.cells).map(cell => cell.content)).toEqual(cells.map(cell => cell.content))
})

it('rejects overlapping and cross-band merge regions', () => {
  const source = createTableModel({ kind: 'data', columnCount: 2, rowCount: 1 })
  source.bands.unshift({ id: 'header' as never, role: 'header', rows: [{ ...deepClone(source.bands[0]!.rows[0]!), id: 'header-row' as never }] })
  const detail = source.bands[1]!.rows[0]!
  const header = source.bands[0]!.rows[0]!
  expect(() => TableTopologyEngine.merge(source, {
    rowIds: [header.id, detail.id], columnIds: [source.columns[0]!.id], anchorCellId: header.cells[0]!.id,
    identities: createSequentialTableIdentityAllocator('merge'),
  })).toThrow(/same band/)

  const staticTable = createTableModel({ kind: 'static', columnCount: 3, rowCount: 2 })
  const rows = staticTable.bands[0]!.rows
  const first = TableTopologyEngine.merge(staticTable, {
    rowIds: rows.map(row => row.id), columnIds: staticTable.columns.slice(0, 2).map(column => column.id),
    anchorCellId: rows[0]!.cells[0]!.id, identities: createSequentialTableIdentityAllocator('merge-a'),
  })
  const before = deepClone(first)
  expect(() => TableTopologyEngine.merge(first, {
    rowIds: rows.map(row => row.id), columnIds: staticTable.columns.slice(1).map(column => column.id),
    anchorCellId: rows[0]!.cells[1]!.id, identities: createSequentialTableIdentityAllocator('merge-b'),
  })).toThrow(/overlap/)
  expect(first).toEqual(before)
})
```

- [ ] **Step 2: Run the focused tests and verify `merge` is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/topology-engine.test.ts`

Expected: FAIL with `TableTopologyEngine.merge is not a function`.

- [ ] **Step 3: Implement lossless merge and split**

Add these methods to `TableTopologyEngine`:

```ts
static merge(source: TableModel, input: {
  rowIds: TableRowId[]
  columnIds: TableColumnId[]
  anchorCellId: import('./model').TableCellId
  identities: import('./model').TableIdentityAllocator
}): TableModel {
  const model = deepClone(source)
  const occupied = occupiedIdentities(model)
  const rowBands = new Set(model.bands.filter(band => band.rows.some(row => input.rowIds.includes(row.id))).map(band => band.id))
  if (rowBands.size !== 1) throw new Error('merged rows must belong to the same band')
  const selected = model.bands.flatMap(band => band.rows)
    .filter(row => input.rowIds.includes(row.id))
    .flatMap(row => row.cells.filter(cell => input.columnIds.includes(cell.columnId)))
  if (!selected.some(cell => cell.id === input.anchorCellId)) throw new Error('merge anchor must belong to region')
  const selectedIds = new Set(selected.map(cell => cell.id))
  if (model.merges.some(region => [region.anchorCellId, ...region.inactiveCellIds].some(id => selectedIds.has(id))))
    throw new Error('merge regions cannot overlap')
  model.merges.push({
    id: allocateTableIdentity(input.identities, 'merge', occupied),
    anchorCellId: input.anchorCellId,
    rowIds: [...input.rowIds],
    columnIds: [...input.columnIds],
    inactiveCellIds: selected.filter(cell => cell.id !== input.anchorCellId).map(cell => cell.id),
  })
  return finish(model).model
}

static split(source: TableModel, mergeId: import('./model').TableMergeId): TableModel {
  const model = deepClone(source)
  const index = model.merges.findIndex(region => region.id === mergeId)
  if (index < 0) throw new Error(`merge not found: ${mergeId}`)
  model.merges.splice(index, 1)
  return finish(model).model
}
```

- [ ] **Step 4: Run the tests and verify all table content survives**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/topology-engine.test.ts`

Expected: PASS with `4 passed`.

- [ ] **Step 5: Commit lossless merge support**

```bash
git add packages/materials/table/kernel/src/topology-engine.ts packages/materials/table/kernel/src/topology-engine.test.ts
git commit -m "feat(table): preserve cells across merge and split"
```

## Task 4: Table SchemaAdapter And Banded Node Factories

**Files:**
- Create: `packages/materials/table/kernel/src/model-codec.ts`
- Test: `packages/materials/table/kernel/src/model-codec.test.ts`
- Create: `packages/materials/table/kernel/src/schema-adapter.ts`
- Test: `packages/materials/table/kernel/src/schema-adapter.test.ts`
- Modify: `packages/materials/table/static/src/schema.ts`
- Create: `packages/materials/table/static/src/schema.test.ts`
- Modify: `packages/materials/table/data/src/schema.ts`
- Create: `packages/materials/table/data/src/schema.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write failing adapter and factory tests**

```ts
// packages/materials/table/kernel/src/schema-adapter.test.ts
import { describe, expect, it } from 'vitest'
import type { AdaptableMaterialNode, SchemaAdapterContext } from '@easyink/core'
import { assertJsonValue } from '@easyink/shared'
import { createTableModel } from './model'
import { tableSchemaAdapter } from './schema-adapter'

const context: SchemaAdapterContext = { documentVersion: '1.0.0', documentUnit: 'mm', materialType: 'table-static' }

describe('tableSchemaAdapter', () => {
  it('normalizes idempotently without leaking table fields onto the envelope', () => {
    const node = tableNode(createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 }))
    const once = tableSchemaAdapter.normalize(node, context)
    expect(tableSchemaAdapter.normalize(once, context)).toEqual(once)
    expect(once).not.toHaveProperty('table')
    expect(once.model).not.toHaveProperty('table')
    expect(tableSchemaAdapter.validate(once, context)).toEqual([])
    expect(tableSchemaAdapter.validate({ ...once, model: { table: once.model } }, context))
      .toContainEqual(expect.objectContaining({ code: 'TABLE_MODEL_INVALID', path: '/model' }))
  })

  it('reports a stable JSON Pointer for an invalid detail template', () => {
    const model = createTableModel({ kind: 'data', columnCount: 2, rowCount: 1 })
    const template = model.bands[0]!.rows[0]!
    model.bands[0]!.rows.push({
      ...template,
      id: 'second-template-row' as never,
      cells: template.cells.map((cell, index) => ({ ...cell, id: `second-template-cell-${index}` as never })),
    })
    expect(tableSchemaAdapter.validate(tableNode(model, 'table-data'), { ...context, materialType: 'table-data' }))
      .toContainEqual(expect.objectContaining({ code: 'TABLE_MODEL_INVALID', path: '/model/bands', severity: 'error' }))
  })

  it.each([
    ['unknown model key', model => Object.assign(model, { surprise: true }), '/model/surprise'],
    ['track discriminant', model => Object.assign(model.columns[0]!.track, { kind: 'auto' }), '/model/columns/0/track/kind'],
    ['track bounds', model => Object.assign(model.columns[0]!.track, { min: 20, max: 10 }), '/model/columns/0/track/max'],
    ['row height', model => { model.bands[0]!.rows[0]!.minHeight = Number.NaN }, '/model/bands/0/rows/0/minHeight'],
    ['padding', model => { model.style.padding = { left: -1 } }, '/model/style/padding/left'],
    ['typography', model => { model.style.typography = { fontSize: 0 } }, '/model/style/typography/fontSize'],
    ['border', model => { model.style.border = { blockStart: { width: -1, color: '#000', style: 'solid' } } }, '/model/style/border/blockStart/width'],
    ['content union', model => { model.bands[0]!.rows[0]!.cells[0]!.content = { kind: 'html' } as never }, '/model/bands/0/rows/0/cells/0/content/kind'],
    ['id characters', model => { model.columns[0]!.id = 'bad id' as never }, '/model/columns/0/id'],
    ['accessibility', model => { model.accessibility = { decorative: 'yes' } as never }, '/model/accessibility/decorative'],
    ['data config', model => Object.assign(model, { data: { collectionPort: '' } }), '/model/data/collectionPort'],
  ])('rejects malformed v1 %s before topology code', (_name, mutate, path) => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    mutate(model as any)
    expect(tableSchemaAdapter.validateInput(tableNode(model), context))
      .toContainEqual(expect.objectContaining({ code: 'TABLE_MODEL_STRUCTURE_INVALID', path }))
  })

  it('rejects orphan slots/bindings and non-scalar table bindings', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const node = tableNode(model)
    node.slots = { 'cell:missing': [] }
    node.bindings = { orphan: [{ sourceId: 'data', fieldPath: 'a' }] as never }
    expect(tableSchemaAdapter.validate(node, context)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'TABLE_SLOT_ORPHAN', path: '/slots/cell:missing' }),
      expect.objectContaining({ code: 'TABLE_BINDING_ORPHAN', path: '/bindings/orphan' }),
      expect.objectContaining({ code: 'TABLE_BINDING_SCALAR_REQUIRED', path: '/bindings/orphan' }),
    ]))
  })

  it('introspects dynamic slots and named binding ports', () => {
    const model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    model.style.typography = { fontFamily: 'Inter' }
    model.bands[0]!.rows[0]!.cells[0]!.content = { kind: 'text', text: '', bindingPort: 'total' }
    const hosted = model.bands[0]!.rows[0]!.cells[1]!
    hosted.content = { kind: 'materials', slotId: `cell:${hosted.id}` }
    const node = tableNode(model)
    node.bindings = { total: { sourceId: 'orders', fieldPath: 'total' } as never }
    node.slots = { [`cell:${hosted.id}`]: [tableNode(createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })) as never] }
    const introspection = tableSchemaAdapter.introspect(node as never, context)
    expect(introspection.structures).toEqual([expect.objectContaining({ slot: `cell:${hosted.id}`, policyId: 'table-cell-free' })])
    expect(introspection.identities).toContainEqual(expect.objectContaining({ value: hosted.id, target: { scope: 'material', kind: 'table.cell' } }))
    expect(introspection.references).toContainEqual(expect.objectContaining({
      path: `/slots/cell:${hosted.id}`, location: 'key', encoding: { prefix: 'cell:' }, value: hosted.id,
    }))
    expect(introspection.bindings).toEqual([expect.objectContaining({ port: 'total', path: '/bindings/total' })])
    expect(introspection.resources).toEqual([expect.objectContaining({ path: '/model/style/typography/fontFamily', value: 'Inter', kind: 'font' })])
  })

  it('converts every physical model length while preserving IDs, ratios, enums, and unitless line height', () => {
    const model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    model.columns[0]!.track = { kind: 'fixed', size: 25.4, min: 12.7, max: 50.8 }
    model.columns[1]!.track = { kind: 'fr', weight: 3, min: 6.35, max: 76.2 }
    model.bands[0]!.rows[0]!.minHeight = 12.7
    model.style = {
      padding: { top: 2.54, right: 2.54, bottom: 2.54, left: 2.54 },
      typography: { fontSize: 2.54, letterSpacing: 0.254, lineHeight: 1.4, direction: 'rtl' },
      border: { blockStart: { width: 0.254, color: '#000', style: 'solid' } },
    }
    const px = tableSchemaAdapter.convertModelUnits!(model, 'mm', 'px') as typeof model
    expect(px.columns[0]!.track).toMatchObject({ size: 96, min: 48, max: 192 })
    expect(px.columns[1]!.track).toMatchObject({ weight: 3, min: 24, max: 288 })
    expect(px.style.typography).toMatchObject({ fontSize: 9.6, letterSpacing: 0.96, lineHeight: 1.4, direction: 'rtl' })
    const roundTrip = tableSchemaAdapter.convertModelUnits!(px, 'px', 'inch') as typeof model
    expect(roundTrip.columns[0]!.track.kind === 'fixed' && roundTrip.columns[0]!.track.size).toBeCloseTo(1)
    expect(roundTrip.columns.map(column => column.id)).toEqual(model.columns.map(column => column.id))
    expect(roundTrip.columns[1]!.track.kind === 'fr' && roundTrip.columns[1]!.track.weight).toBe(3)
    expect(roundTrip.style.typography?.lineHeight).toBe(1.4)
  })
})

function tableNode(model: ReturnType<typeof createTableModel>, type = 'table-static'): AdaptableMaterialNode {
  return {
    id: 'table-1', type, x: 0, y: 0, width: 100, height: 20, modelVersion: 1, model,
    slots: {}, bindings: {}, output: { visibility: 'include' },
  }
}
```

Add direct codec boundary tests so non-JSON programmatic inputs cannot bypass admission:

```ts
// packages/materials/table/kernel/src/model-codec.test.ts
import { describe, expect, it } from 'vitest'
import { createTableModel } from './model'
import { decodeTableModelV1 } from './model-codec'

describe('decodeTableModelV1', () => {
  it('returns an independent strict-JSON model for valid input', () => {
    const source = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const decoded = decodeTableModelV1(source, '/model')
    expect(decoded.issues).toEqual([])
    expect(decoded.value).toEqual(source)
    expect(decoded.value).not.toBe(source)
  })

  it.each([
    ['undefined', (model: any) => { model.style.background = undefined }],
    ['sparse array', (model: any) => { delete model.columns[0] }],
    ['non-plain object', (model: any) => { model.style = new Date() }],
    ['oversized port', (model: any) => { model.bands[0].rows[0].cells[0].content.bindingPort = 'p'.repeat(129) }],
  ])('rejects %s recursively', (_name, mutate) => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    mutate(model)
    expect(decodeTableModelV1(model, '/model').issues)
      .toContainEqual(expect.objectContaining({ code: 'TABLE_MODEL_STRUCTURE_INVALID' }))
  })
})
```

Add the static factory test:

```ts
// packages/materials/table/static/src/schema.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { CompiledMaterialProfile } from '@easyink/core'
import { createDefaultStaticTableModel, createTableStaticNode, TABLE_STATIC_TYPE } from './schema'

describe('table-static schema', () => {
  it('keeps node envelope construction inside CompiledMaterialProfile', () => {
    const sentinel = { id: 'table-1' }
    const profile = { createNode: vi.fn(() => sentinel) } as unknown as CompiledMaterialProfile
    expect(createTableStaticNode(profile, { id: 'table-1' })).toBe(sentinel)
    expect(profile.createNode).toHaveBeenCalledWith(TABLE_STATIC_TYPE, { id: 'table-1' }, undefined)
  })

  it('builds only body rows', () => {
    expect(createDefaultStaticTableModel().bands.map(band => band.role)).toEqual(['body'])
  })
})
```

Add the data factory test:

```ts
// packages/materials/table/data/src/schema.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { CompiledMaterialProfile } from '@easyink/core'
import { createDefaultDataTableModel, createTableDataNode, TABLE_DATA_TYPE } from './schema'

describe('table-data schema', () => {
  it('delegates envelope construction and unit conversion to the profile', () => {
    const sentinel = { id: 'table-2' }
    const profile = { createNode: vi.fn(() => sentinel) } as unknown as CompiledMaterialProfile
    expect(createTableDataNode(profile, { id: 'table-2' }, 'px')).toBe(sentinel)
    expect(profile.createNode).toHaveBeenCalledWith(TABLE_DATA_TYPE, { id: 'table-2' }, 'px')
  })

  it('builds one data detail band containing exactly one template row', () => {
    const data = createDefaultDataTableModel()
    expect(data.bands.map(band => band.role)).toEqual(['header', 'detail', 'footer'])
    expect(data.bands.find(band => band.role === 'detail')!.rows).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run the adapter test and confirm the new adapter is absent**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/model-codec.test.ts packages/materials/table/kernel/src/schema-adapter.test.ts`

Expected: FAIL with `Failed to load url ./schema-adapter`.

- [ ] **Step 3: Implement the node-level adapter and profile-owned node factories**

Implement a strict structural decoder before the adapter. It returns a value only after every recursive shape check succeeds, then clones and verifies the rebuilt value with `assertJsonValue`:

```ts
// packages/materials/table/kernel/src/model-codec.ts
import type { MaterialSchemaIssue } from '@easyink/core'
import type { TableCellContent, TableModel, TableStyle } from './model'
import { isValidTableStableToken } from './model'
import { assertJsonValue, deepClone, isObject } from '@easyink/shared'

export interface TableModelDecodeResult {
  value?: TableModel
  issues: MaterialSchemaIssue[]
}

export function decodeTableModelV1(raw: unknown, root: `/${string}`): TableModelDecodeResult {
  const issues: MaterialSchemaIssue[] = []
  validateTableModelRecord(raw, root, issues)
  if (issues.length) return { issues }
  const value = deepClone(raw) as TableModel
  try { assertJsonValue(value) }
  catch {
    return { issues: [structureIssue(root, 'table model must be strict JSON')] }
  }
  return { value, issues: [] }
}

export function decodeTableStyleV1(raw: unknown, root: `/${string}`): { value?: TableStyle, issues: MaterialSchemaIssue[] } {
  const issues: MaterialSchemaIssue[] = []
  validateStyle(raw, root, issues)
  return issues.length ? { issues } : { value: deepClone(raw) as TableStyle, issues }
}

export function decodeTableCellContentV1(
  raw: unknown,
  root: `/${string}`,
): { value?: TableCellContent, issues: MaterialSchemaIssue[] } {
  const issues: MaterialSchemaIssue[] = []
  validateContent(raw, root, issues, undefined)
  return issues.length ? { issues } : { value: deepClone(raw) as TableCellContent, issues }
}

function structureIssue(path: string, message: string): MaterialSchemaIssue {
  return { code: 'TABLE_MODEL_STRUCTURE_INVALID', severity: 'error', path: path as `/${string}`, message }
}

function exactRecord(
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[],
  issues: MaterialSchemaIssue[],
): value is Record<string, unknown> {
  if (!isObject(value) || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    issues.push(structureIssue(path, 'expected an object'))
    return false
  }
  const allowed = new Set([...required, ...optional])
  for (const key of Object.keys(value))
    if (!allowed.has(key)) issues.push(structureIssue(`${path}/${pointerSegment(key)}`, 'unknown key'))
  for (const key of required)
    if (!Object.hasOwn(value, key)) issues.push(structureIssue(`${path}/${pointerSegment(key)}`, 'required key is missing'))
  return true
}

function finite(value: unknown, path: string, issues: MaterialSchemaIssue[], minimum?: number): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value) || minimum !== undefined && value < minimum) {
    issues.push(structureIssue(path, `expected a finite number${minimum !== undefined ? ` >= ${minimum}` : ''}`))
    return false
  }
  return true
}

function boundedToken(value: unknown, path: string, issues: MaterialSchemaIssue[], max = 128): value is string {
  if (!isValidTableStableToken(value, max)) {
    issues.push(structureIssue(path, `expected a 1..${max} UTF-8 byte stable token`))
    return false
  }
  return true
}

function pointerSegment(value: string): string { return value.replace(/~/g, '~0').replace(/\//g, '~1') }

function validateTableModelRecord(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  if (!exactRecord(value, path, ['kind', 'columns', 'bands', 'merges', 'style'], ['data', 'accessibility'], issues)) return
  enumValue(value.kind, `${path}/kind`, ['static', 'data'], issues)
  arrayItems(value.columns, `${path}/columns`, issues, true, validateColumn)
  arrayItems(value.bands, `${path}/bands`, issues, true, validateBand)
  arrayItems(value.merges, `${path}/merges`, issues, false, validateMerge)
  validateStyle(value.style, `${path}/style`, issues)
  if (Object.hasOwn(value, 'data')) validateData(value.data, `${path}/data`, issues)
  if (Object.hasOwn(value, 'accessibility')) validateAccessibility(value.accessibility, `${path}/accessibility`, issues)
  if (value.kind === 'static' && Object.hasOwn(value, 'data'))
    issues.push(structureIssue(`${path}/data`, 'static tables cannot declare data configuration'))
  if (value.kind === 'data' && !Object.hasOwn(value, 'data'))
    issues.push(structureIssue(`${path}/data`, 'data tables require data configuration'))
}

function validateColumn(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  if (!exactRecord(value, path, ['id', 'track'], ['style'], issues)) return
  boundedToken(value.id, `${path}/id`, issues)
  validateTrack(value.track, `${path}/track`, issues)
  if (Object.hasOwn(value, 'style')) validateStyle(value.style, `${path}/style`, issues)
}

function validateTrack(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  if (!isObject(value) || Array.isArray(value)) {
    issues.push(structureIssue(path, 'expected a track object'))
    return
  }
  if (value.kind === 'fixed') {
    if (!exactRecord(value, path, ['kind', 'size'], ['min', 'max'], issues)) return
    finite(value.size, `${path}/size`, issues, 0)
  }
  else if (value.kind === 'fr') {
    if (!exactRecord(value, path, ['kind', 'weight'], ['min', 'max'], issues)) return
    if (finite(value.weight, `${path}/weight`, issues, 0) && value.weight === 0)
      issues.push(structureIssue(`${path}/weight`, 'fraction weight must be greater than zero'))
  }
  else {
    issues.push(structureIssue(`${path}/kind`, 'expected fixed or fr track'))
    return
  }
  const minimum = Object.hasOwn(value, 'min') && finite(value.min, `${path}/min`, issues, 0) ? value.min : undefined
  const maximum = Object.hasOwn(value, 'max') && finite(value.max, `${path}/max`, issues, 0) ? value.max : undefined
  if (minimum !== undefined && maximum !== undefined && minimum > maximum)
    issues.push(structureIssue(`${path}/max`, 'track max must be greater than or equal to min'))
}

function validateBand(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  if (!exactRecord(value, path, ['id', 'role', 'rows'], ['style'], issues)) return
  boundedToken(value.id, `${path}/id`, issues)
  enumValue(value.role, `${path}/role`, ['body', 'header', 'detail', 'footer'], issues)
  arrayItems(value.rows, `${path}/rows`, issues, true, validateRow)
  if (Object.hasOwn(value, 'style')) validateStyle(value.style, `${path}/style`, issues)
}

function validateRow(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  if (!exactRecord(value, path, ['id', 'minHeight', 'cells'], ['style'], issues)) return
  boundedToken(value.id, `${path}/id`, issues)
  finite(value.minHeight, `${path}/minHeight`, issues, 0)
  arrayItems(value.cells, `${path}/cells`, issues, true, validateCell)
  if (Object.hasOwn(value, 'style')) validateStyle(value.style, `${path}/style`, issues)
}

function validateCell(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  if (!exactRecord(value, path, ['id', 'columnId', 'content'], ['style'], issues)) return
  const validId = boundedToken(value.id, `${path}/id`, issues)
  boundedToken(value.columnId, `${path}/columnId`, issues)
  validateContent(value.content, `${path}/content`, issues, validId ? value.id as string : undefined)
  if (Object.hasOwn(value, 'style')) validateStyle(value.style, `${path}/style`, issues)
}

function validateContent(
  value: unknown,
  path: string,
  issues: MaterialSchemaIssue[],
  cellId: string | undefined,
): void {
  if (!isObject(value) || Array.isArray(value)) {
    issues.push(structureIssue(path, 'expected a content object'))
    return
  }
  if (value.kind === 'text') {
    if (!exactRecord(value, path, ['kind', 'text'], ['bindingPort'], issues)) return
    boundedString(value.text, `${path}/text`, issues, 1_000_000, true)
    if (Object.hasOwn(value, 'bindingPort')) boundedToken(value.bindingPort, `${path}/bindingPort`, issues)
  }
  else if (value.kind === 'materials') {
    if (!exactRecord(value, path, ['kind', 'slotId'], [], issues)) return
    if (boundedToken(value.slotId, `${path}/slotId`, issues, 256) && cellId && value.slotId !== `cell:${cellId}`)
      issues.push(structureIssue(`${path}/slotId`, 'materials slot must equal cell:<cellId>'))
  }
  else issues.push(structureIssue(`${path}/kind`, 'expected text or materials content'))
}

function validateMerge(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  if (!exactRecord(value, path, ['id', 'anchorCellId', 'rowIds', 'columnIds', 'inactiveCellIds'], [], issues)) return
  boundedToken(value.id, `${path}/id`, issues)
  boundedToken(value.anchorCellId, `${path}/anchorCellId`, issues)
  for (const key of ['rowIds', 'columnIds', 'inactiveCellIds'] as const)
    arrayItems(value[key], `${path}/${key}`, issues, key !== 'inactiveCellIds', boundedTokenItem)
}

function validateStyle(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  if (!exactRecord(value, path, [], ['padding', 'background', 'typography', 'border', 'overflow'], issues)) return
  if (Object.hasOwn(value, 'padding')) {
    const padding = value.padding
    if (exactRecord(padding, `${path}/padding`, [], ['top', 'right', 'bottom', 'left'], issues))
      for (const edge of ['top', 'right', 'bottom', 'left'] as const)
        if (Object.hasOwn(padding, edge)) finite(padding[edge], `${path}/padding/${edge}`, issues, 0)
  }
  if (Object.hasOwn(value, 'background')) boundedString(value.background, `${path}/background`, issues, 256)
  if (Object.hasOwn(value, 'overflow')) enumValue(value.overflow, `${path}/overflow`, ['clip', 'visible'], issues)
  if (Object.hasOwn(value, 'typography')) validateTypography(value.typography, `${path}/typography`, issues)
  if (Object.hasOwn(value, 'border')) validateBorders(value.border, `${path}/border`, issues)
}

function validateTypography(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  const keys = ['fontFamily', 'fontSize', 'color', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing',
    'textAlign', 'verticalAlign', 'direction'] as const
  if (!exactRecord(value, path, [], keys, issues)) return
  if (Object.hasOwn(value, 'fontFamily')) boundedString(value.fontFamily, `${path}/fontFamily`, issues, 256)
  if (Object.hasOwn(value, 'color')) boundedString(value.color, `${path}/color`, issues, 256)
  for (const key of ['fontSize', 'lineHeight'] as const)
    if (Object.hasOwn(value, key) && finite(value[key], `${path}/${key}`, issues, 0) && value[key] === 0)
      issues.push(structureIssue(`${path}/${key}`, `${key} must be greater than zero`))
  if (Object.hasOwn(value, 'letterSpacing')) finite(value.letterSpacing, `${path}/letterSpacing`, issues)
  if (Object.hasOwn(value, 'fontWeight')) enumValue(value.fontWeight, `${path}/fontWeight`, ['normal', 'bold'], issues)
  if (Object.hasOwn(value, 'fontStyle')) enumValue(value.fontStyle, `${path}/fontStyle`, ['normal', 'italic'], issues)
  if (Object.hasOwn(value, 'textAlign')) enumValue(value.textAlign, `${path}/textAlign`, ['start', 'center', 'end'], issues)
  if (Object.hasOwn(value, 'verticalAlign')) enumValue(value.verticalAlign, `${path}/verticalAlign`, ['top', 'middle', 'bottom'], issues)
  if (Object.hasOwn(value, 'direction')) enumValue(value.direction, `${path}/direction`, ['auto', 'ltr', 'rtl'], issues)
}

function validateBorders(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  const edges = ['blockStart', 'inlineEnd', 'blockEnd', 'inlineStart'] as const
  if (!exactRecord(value, path, [], edges, issues)) return
  for (const edge of edges) {
    if (!Object.hasOwn(value, edge)) continue
    const borderPath = `${path}/${edge}`
    const border = value[edge]
    if (!exactRecord(border, borderPath, ['width', 'color', 'style'], [], issues)) continue
    finite(border.width, `${borderPath}/width`, issues, 0)
    boundedString(border.color, `${borderPath}/color`, issues, 256)
    enumValue(border.style, `${borderPath}/style`, ['solid', 'dashed', 'dotted', 'double', 'none'], issues)
  }
}

function validateData(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  if (!exactRecord(value, path, ['collectionPort'], ['detailKeyPort'], issues)) return
  boundedToken(value.collectionPort, `${path}/collectionPort`, issues)
  if (Object.hasOwn(value, 'detailKeyPort')) boundedToken(value.detailKeyPort, `${path}/detailKeyPort`, issues)
}

function validateAccessibility(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  if (!exactRecord(value, path, [], ['caption', 'description', 'decorative'], issues)) return
  if (Object.hasOwn(value, 'caption')) boundedString(value.caption, `${path}/caption`, issues, 4_096, true)
  if (Object.hasOwn(value, 'description')) boundedString(value.description, `${path}/description`, issues, 16_384, true)
  if (Object.hasOwn(value, 'decorative') && typeof value.decorative !== 'boolean')
    issues.push(structureIssue(`${path}/decorative`, 'expected a boolean'))
}

function arrayItems(
  value: unknown,
  path: string,
  issues: MaterialSchemaIssue[],
  nonempty: boolean,
  validate: (value: unknown, path: string, issues: MaterialSchemaIssue[]) => void,
): void {
  if (!Array.isArray(value)) {
    issues.push(structureIssue(path, 'expected an array'))
    return
  }
  if (nonempty && value.length === 0) issues.push(structureIssue(path, 'array must not be empty'))
  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index)) issues.push(structureIssue(`${path}/${index}`, 'sparse arrays are not allowed'))
    else validate(value[index], `${path}/${index}`, issues)
  }
}

function boundedTokenItem(value: unknown, path: string, issues: MaterialSchemaIssue[]): void {
  boundedToken(value, path, issues)
}

function boundedString(
  value: unknown,
  path: string,
  issues: MaterialSchemaIssue[],
  max: number,
  allowEmpty = false,
): value is string {
  if (typeof value !== 'string' || value.length > max || !allowEmpty && value.length === 0) {
    issues.push(structureIssue(path, `expected a ${allowEmpty ? '0' : '1'}..${max} character string`))
    return false
  }
  return true
}

function enumValue(value: unknown, path: string, allowed: readonly string[], issues: MaterialSchemaIssue[]): void {
  if (typeof value !== 'string' || !allowed.includes(value))
    issues.push(structureIssue(path, `expected one of ${allowed.join(', ')}`))
}
```

`validateTableModelRecord()` is implemented in the same file as a recursive allowlist, using the helpers above. Its complete contract is:

| Object | Required keys and validation | Optional keys and validation |
|---|---|---|
| model | `kind` enum, nonempty `columns`, nonempty `bands`, `merges` array, `style` | `data`, `accessibility`; no other keys |
| column | bounded `id`, `track` | `style` |
| fixed track | `kind:'fixed'`, finite `size >= 0` | finite `min/max >= 0`, `min <= max` |
| fr track | `kind:'fr'`, finite `weight > 0` | finite `min/max >= 0`, `min <= max` |
| band | bounded `id`, role enum, nonempty `rows` | `style` |
| row | bounded `id`, finite `minHeight >= 0`, nonempty `cells` | `style` |
| cell | bounded `id/columnId`, exact `content` union | `style` |
| text content | `kind:'text'`, string `text` | bounded scalar `bindingPort`; no slot key |
| materials content | `kind:'materials'`, bounded `slotId` equal to `cell:<cellId>` | no text/binding keys |
| merge | bounded `id/anchorCellId`, nonempty bounded `rowIds/columnIds`, bounded `inactiveCellIds` | none |
| style | exact optional padding/background/typography/border/overflow fields | padding values finite `>= 0`; bounded strings; typography numeric values finite with `fontSize/lineHeight > 0`; every enum exact; each logical border has exact finite nonnegative width/color/style |
| data | bounded `collectionPort` | bounded `detailKeyPort`; only valid for `kind:'data'` |
| accessibility | none | bounded caption/description strings and boolean decorative |

The decoder accumulates all stable JSON Pointer issues without indexing into an unvalidated value. It also rejects `undefined`, sparse arrays, symbols, functions, non-plain objects, IDs longer than 128 characters, ports longer than 128 characters, and slot keys longer than 256 characters. `assertValidTableModel()` then owns cross-record topology invariants; the structural decoder never tries to repair an invalid discriminant or unknown key.

```ts
// packages/materials/table/kernel/src/schema-adapter.ts
import type { AdaptableMaterialNode, MaterialIntrospection, MaterialSchemaIssue, SchemaAdapter } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableModel } from './model'
import { encodeTableOpaqueIdPart } from './model'
import { convertUnit, deepClone } from '@easyink/shared'
import { assertValidTableModel } from './model'
import { decodeTableModelV1 } from './model-codec'

function issue(message: string): MaterialSchemaIssue {
  const path = /detail band|detail template/.test(message) ? '/model/bands' as const : '/model' as const
  return { code: 'TABLE_MODEL_INVALID', severity: 'error', path, message }
}

function pointerSegment(value: string): string { return value.replace(/~/g, '~0').replace(/\//g, '~1') }
function pointer(value: string): `/${string}` { return value as `/${string}` }

function tableIntrospection(node: MaterialNode<TableModel>): MaterialIntrospection {
  const structures: MaterialIntrospection['structures'][number][] = []
  const bindings: MaterialIntrospection['bindings'][number][] = []
  const identities: MaterialIntrospection['identities'][number][] = []
  const references: MaterialIntrospection['references'][number][] = []
  const resources: MaterialIntrospection['resources'][number][] = []
  const ports = new Set<string>()
  const target = (kind: string) => ({ scope: 'material' as const, kind: `table.${kind}` })
  const identity = (path: string, value: string, kind: string) =>
    identities.push({ path: pointer(path), location: 'value', value, target: target(kind) })
  const reference = (path: string, value: string, kind: string, required = true) =>
    references.push({ path: pointer(path), location: 'value', value, target: target(kind), required })
  const font = (path: string, style: import('./model').TableStyle | undefined) => {
    const value = style?.typography?.fontFamily
    if (value) resources.push({ path: pointer(`${path}/typography/fontFamily`), value, kind: 'font' })
  }

  font('/model/style', node.model.style)
  node.model.columns.forEach((column, columnIndex) => {
    identity(`/model/columns/${columnIndex}/id`, column.id, 'column')
    font(`/model/columns/${columnIndex}/style`, column.style)
  })
  node.model.bands.forEach((band, bandIndex) => {
    identity(`/model/bands/${bandIndex}/id`, band.id, 'band')
    font(`/model/bands/${bandIndex}/style`, band.style)
    band.rows.forEach((row, rowIndex) => {
      identity(`/model/bands/${bandIndex}/rows/${rowIndex}/id`, row.id, 'row')
      font(`/model/bands/${bandIndex}/rows/${rowIndex}/style`, row.style)
      row.cells.forEach((cell, cellIndex) => {
        const cellPath = `/model/bands/${bandIndex}/rows/${rowIndex}/cells/${cellIndex}`
        identity(`${cellPath}/id`, cell.id, 'cell')
        reference(`${cellPath}/columnId`, cell.columnId, 'column')
        font(`${cellPath}/style`, cell.style)
        if (cell.content.kind === 'materials') {
          const slot = cell.content.slotId
          reference(`${cellPath}/content/slotId`, cell.id, 'cell')
          references.at(-1)!.encoding = { prefix: 'cell:' }
          structures.push({
            path: pointer(`/slots/${pointerSegment(slot)}`),
            slot,
            children: node.slots[slot] ?? [],
            policyId: 'table-cell-free',
            coordinateSpace: 'slot',
            layoutParticipation: 'owner',
            reparent: 'allowed',
          })
          references.push({
            path: pointer(`/slots/${pointerSegment(slot)}`),
            location: 'key', encoding: { prefix: 'cell:' }, value: cell.id,
            target: target('cell'), required: true,
          })
        }
        else if (cell.content.bindingPort) ports.add(cell.content.bindingPort)
      })
    })
  })
  node.model.merges.forEach((merge, mergeIndex) => {
    const mergePath = `/model/merges/${mergeIndex}`
    identity(`${mergePath}/id`, merge.id, 'merge')
    reference(`${mergePath}/anchorCellId`, merge.anchorCellId, 'cell')
    merge.rowIds.forEach((rowId, index) => reference(`${mergePath}/rowIds/${index}`, rowId, 'row'))
    merge.columnIds.forEach((columnId, index) => reference(`${mergePath}/columnIds/${index}`, columnId, 'column'))
    merge.inactiveCellIds.forEach((cellId, index) => reference(`${mergePath}/inactiveCellIds/${index}`, cellId, 'cell'))
  })
  if (node.model.data) {
    ports.add(node.model.data.collectionPort)
    if (node.model.data.detailKeyPort) ports.add(node.model.data.detailKeyPort)
  }
  for (const port of [...ports].sort()) {
    const value = node.bindings?.[port]
    if (value) bindings.push({ path: `/bindings/${pointerSegment(port)}`, value, port })
  }
  return { identities, structures, references, resources, bindings }
}

function validateTableEnvelopeReferences(
  node: AdaptableMaterialNode,
  model: TableModel,
): MaterialSchemaIssue[] {
  const issues: MaterialSchemaIssue[] = []
  const expectedSlots = new Set<string>()
  const referencedPorts = new Set<string>()
  for (const band of model.bands) {
    for (const row of band.rows) {
      for (const cell of row.cells) {
        if (cell.content.kind === 'materials') expectedSlots.add(cell.content.slotId)
        else if (cell.content.bindingPort) referencedPorts.add(cell.content.bindingPort)
      }
    }
  }
  if (model.data) {
    referencedPorts.add(model.data.collectionPort)
    if (model.data.detailKeyPort) referencedPorts.add(model.data.detailKeyPort)
  }

  const slots = node.slots ?? {}
  for (const slot of expectedSlots) {
    if (!Object.hasOwn(slots, slot)) issues.push(referenceIssue(
      'TABLE_SLOT_MISSING', `/slots/${pointerSegment(slot)}`, 'materials cell requires its canonical empty-or-populated slot',
    ))
  }
  for (const slot of Object.keys(slots)) {
    if (slot.length > 256 || !expectedSlots.has(slot)) issues.push(referenceIssue(
      'TABLE_SLOT_ORPHAN', `/slots/${pointerSegment(slot)}`, 'slot is not referenced by a materials cell',
    ))
  }

  for (const [port, binding] of Object.entries(node.bindings ?? {})) {
    const path = `/bindings/${pointerSegment(port)}`
    if (port.length === 0 || port.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(port))
      issues.push(referenceIssue('TABLE_BINDING_PORT_INVALID', path, 'binding port is not a bounded stable token'))
    if (Array.isArray(binding))
      issues.push(referenceIssue('TABLE_BINDING_SCALAR_REQUIRED', path, 'each table port accepts one scalar binding'))
    if (!referencedPorts.has(port))
      issues.push(referenceIssue('TABLE_BINDING_ORPHAN', path, 'binding port is not referenced by the table model'))
  }
  return issues
}

function referenceIssue(code: string, path: string, message: string): MaterialSchemaIssue {
  return { code, severity: 'error', path: path as `/${string}`, message }
}

export function convertTableModelUnits(
  source: TableModel,
  from: import('@easyink/schema').UnitType,
  to: import('@easyink/schema').UnitType,
): TableModel {
  const model = deepClone(source)
  const length = (value: number) => convertUnit(value, from, to)
  const convertStyle = (style: import('./model').TableStyle | undefined) => {
    if (!style) return
    if (style.padding) for (const key of ['top', 'right', 'bottom', 'left'] as const)
      if (style.padding[key] !== undefined) style.padding[key] = length(style.padding[key]!)
    if (style.typography?.fontSize !== undefined) style.typography.fontSize = length(style.typography.fontSize)
    if (style.typography?.letterSpacing !== undefined) style.typography.letterSpacing = length(style.typography.letterSpacing)
    // `lineHeight` is a unitless multiplier in v1 and is deliberately unchanged.
    if (style.border) for (const border of Object.values(style.border))
      if (border) border.width = length(border.width)
  }
  for (const column of model.columns) {
    if (column.track.kind === 'fixed') column.track.size = length(column.track.size)
    if (column.track.min !== undefined) column.track.min = length(column.track.min)
    if (column.track.max !== undefined) column.track.max = length(column.track.max)
    convertStyle(column.style)
  }
  for (const band of model.bands) {
    convertStyle(band.style)
    for (const row of band.rows) {
      row.minHeight = length(row.minHeight)
      convertStyle(row.style)
      for (const cell of row.cells) convertStyle(cell.style)
    }
  }
  convertStyle(model.style)
  return model
}

export const tableSchemaAdapter: SchemaAdapter = {
  currentModelVersion: 1,
  modelUnitPolicy: 'convertible',
  migrations: [],
  validateInput(node) {
    if (node.modelVersion !== 1) return []
    return decodeTableModelV1(node.model, '/model').issues
  },
  normalize(node) {
    const cloned = deepClone(node)
    if (cloned.modelVersion !== 1) return cloned
    const decoded = decodeTableModelV1(cloned.model, '/model')
    return decoded.value ? { ...cloned, model: decoded.value } : cloned
  },
  validate(node) {
    const decoded = decodeTableModelV1(node.model, '/model')
    if (decoded.issues.length) return decoded.issues
    try {
      const model = decoded.value!
      assertValidTableModel(model)
      if ((node.type === 'table-static') !== (model.kind === 'static'))
        return [issue(`material type ${node.type} does not match table kind ${model.kind}`)]
      return validateTableEnvelopeReferences(node, model)
    }
    catch (error) {
      return [issue(error instanceof Error ? error.message : String(error))]
    }
  },
  convertModelUnits(model, from, to) {
    return convertTableModelUnits(model as unknown as TableModel, from, to) as unknown as Record<string, unknown>
  },
  introspect(node) { return tableIntrospection(node as MaterialNode<TableModel>) },
}
```

Replace the static schema factory with a default-model builder and a thin wrapper over the prerequisite profile:

```ts
// packages/materials/table/static/src/schema.ts
import type { CompiledMaterialProfile } from '@easyink/core'
import type { MaterialNode, UnitType } from '@easyink/schema'
import type { TableModel } from '@easyink/material-table-kernel'
import { createTableModel } from '@easyink/material-table-kernel'

export const TABLE_STATIC_TYPE = 'table-static'

export function createDefaultStaticTableModel(): TableModel {
  return createTableModel({ kind: 'static', columnCount: 3, rowCount: 3 })
}

export function createTableStaticNode(
  profile: CompiledMaterialProfile,
  input?: Partial<MaterialNode>,
  unit?: UnitType,
): MaterialNode<TableModel> {
  return profile.createNode(TABLE_STATIC_TYPE, input, unit) as MaterialNode<TableModel>
}
```

Replace the data schema factory with explicit band construction and the same profile wrapper:

```ts
// packages/materials/table/data/src/schema.ts
import type { CompiledMaterialProfile } from '@easyink/core'
import type { MaterialNode, UnitType } from '@easyink/schema'
import type {
  TableBand, TableBandRole, TableColumn, TableIdentityAllocator, TableModel,
} from '@easyink/material-table-kernel'
import {
  allocateTableIdentity, createSequentialTableIdentityAllocator, createTableModel,
} from '@easyink/material-table-kernel'

export const TABLE_DATA_TYPE = 'table-data'

function createBand(
  role: TableBandRole,
  columns: TableColumn[],
  minHeight: number,
  allocator: TableIdentityAllocator,
  occupied: Set<string>,
): TableBand {
  return {
    id: allocateTableIdentity(allocator, 'band', occupied),
    role,
    rows: [{
      id: allocateTableIdentity(allocator, 'row', occupied),
      minHeight,
      cells: columns.map(column => ({
        id: allocateTableIdentity(allocator, 'cell', occupied),
        columnId: column.id,
        content: { kind: 'text', text: '' },
      })),
    }],
  }
}

export function createDefaultDataTableModel(): TableModel {
  const allocator = createSequentialTableIdentityAllocator('table-data-default')
  const model = createTableModel({ kind: 'data', columnCount: 3, rowCount: 1 }, allocator)
  const detail = model.bands[0]!
  const occupied = new Set([
    ...model.columns.map(column => column.id), detail.id,
    ...detail.rows.flatMap(row => [row.id, ...row.cells.map(cell => cell.id)]),
  ])
  model.bands = [
    createBand('header', model.columns, 8, allocator, occupied), detail,
    createBand('footer', model.columns, 8, allocator, occupied),
  ]
  model.data = { collectionPort: 'records' }
  return model
}

export function createTableDataNode(
  profile: CompiledMaterialProfile,
  input?: Partial<MaterialNode>,
  unit?: UnitType,
): MaterialNode<TableModel> {
  return profile.createNode(TABLE_DATA_TYPE, input, unit) as MaterialNode<TableModel>
}
```

The manifests added by the foundation own `common.defaultNode`; Task 20 wires these two model builders into those defaults. Neither table package may allocate or merge the public envelope itself.

Add the export:

```ts
export * from './schema-adapter'
```

- [ ] **Step 4: Run adapter and factory tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/model-codec.test.ts packages/materials/table/kernel/src/schema-adapter.test.ts packages/materials/table/static/src/schema.test.ts packages/materials/table/data/src/schema.test.ts`

Expected: PASS with adapter idempotence, strict one-row detail-template validation, dynamic slot/binding introspection, and profile-owned envelope construction.

- [ ] **Step 5: Commit the private model boundary**

```bash
git add packages/materials/table/kernel/src/model-codec.ts packages/materials/table/kernel/src/model-codec.test.ts packages/materials/table/kernel/src/schema-adapter.ts packages/materials/table/kernel/src/schema-adapter.test.ts packages/materials/table/kernel/src/index.ts packages/materials/table/static/src/schema.ts packages/materials/table/static/src/schema.test.ts packages/materials/table/data/src/schema.ts packages/materials/table/data/src/schema.test.ts
git commit -m "refactor(table): move table state behind schema adapter"
```

## Task 5: Deterministic Fixed/Fr Column Tracks

**Files:**
- Create: `packages/materials/table/kernel/src/tracks.ts`
- Test: `packages/materials/table/kernel/src/tracks.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write failing fixed/fr resolution tests**

```ts
// packages/materials/table/kernel/src/tracks.test.ts
import { describe, expect, it } from 'vitest'
import { resolveColumnTracks } from './tracks'
import type { JsonValue } from '@easyink/shared'
import { cloneJsonValue } from '@easyink/shared'

describe('resolveColumnTracks', () => {
  it('allocates fixed tracks before weighted fractions', () => {
    const result = resolveColumnTracks(200, [
      { kind: 'fixed', size: 50 },
      { kind: 'fr', weight: 1 },
      { kind: 'fr', weight: 3 },
    ])
    expect(result.widths).toEqual([50, 37.5, 112.5])
    expect(result.overflow).toBe(0)
  })

  it('honors min/max and reports insufficient width', () => {
    const result = resolveColumnTracks(80, [
      { kind: 'fixed', size: 60, min: 50 },
      { kind: 'fr', weight: 1, min: 40, max: 45 },
    ])
    expect(result.widths).toEqual([60, 40])
    expect(result.overflow).toBe(20)
  })
})
```

- [ ] **Step 2: Run the test and verify the resolver is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/tracks.test.ts`

Expected: FAIL with `Failed to load url ./tracks`.

- [ ] **Step 3: Implement deterministic track allocation**

```ts
// packages/materials/table/kernel/src/tracks.ts
import type { TableTrack } from './model'

export interface ResolvedTracks { widths: number[], overflow: number }

function clamp(value: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  return Math.min(Math.max(value, min), max)
}

export function resolveColumnTracks(availableWidth: number, tracks: TableTrack[]): ResolvedTracks {
  const widths = tracks.map(track => track.kind === 'fixed' ? clamp(track.size, track.min, track.max) : clamp(0, track.min))
  let remaining = availableWidth - widths.reduce((sum, width) => sum + width, 0)
  const pending = new Set(tracks.map((track, index) => track.kind === 'fr' ? index : -1).filter(index => index >= 0))

  while (remaining > 0 && pending.size > 0) {
    const totalWeight = [...pending].reduce((sum, index) => sum + Math.max(0, (tracks[index] as Extract<TableTrack, { kind: 'fr' }>).weight), 0) || 1
    let consumed = 0
    for (const index of [...pending]) {
      const track = tracks[index] as Extract<TableTrack, { kind: 'fr' }>
      const share = remaining * Math.max(0, track.weight) / totalWeight
      const next = clamp(widths[index]! + share, track.min, track.max)
      consumed += next - widths[index]!
      widths[index] = next
      if (next === track.max) pending.delete(index)
    }
    if (consumed <= Number.EPSILON) break
    remaining -= consumed
  }

  const used = widths.reduce((sum, width) => sum + width, 0)
  return { widths, overflow: Math.max(0, used - availableWidth) }
}
```

Add the export:

```ts
export * from './tracks'
```

- [ ] **Step 4: Run the resolver tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/tracks.test.ts`

Expected: PASS with `2 passed`.

- [ ] **Step 5: Commit track resolution**

```bash
git add packages/materials/table/kernel/src/tracks.ts packages/materials/table/kernel/src/tracks.test.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): resolve fixed and fraction tracks"
```

## Task 6: Box Model, Style Cascade, RTL, And Shared Borders

**Files:**
- Create: `packages/materials/table/kernel/src/style.ts`
- Test: `packages/materials/table/kernel/src/style.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write failing cascade and border tests**

```ts
// packages/materials/table/kernel/src/style.test.ts
import { describe, expect, it } from 'vitest'
import { resolveCellStyle, resolveSharedEdge } from './style'

describe('table style resolution', () => {
  it('uses table < band < column < row < cell precedence and expands padding', () => {
    const style = resolveCellStyle([
      { padding: { top: 1, right: 1, bottom: 1, left: 1 }, typography: { color: '#111' } },
      { typography: { fontWeight: 'bold' } },
      { background: '#fafafa' },
      { typography: { color: '#222' } },
      { padding: { left: 4 } },
    ], 'ltr')
    expect(style.padding).toEqual({ top: 1, right: 1, bottom: 1, left: 4 })
    expect(style.typography).toMatchObject({ color: '#222', fontWeight: 'bold' })
    expect(style.borderSpecificity).toEqual({})
  })

  it('resolves one physical edge and gives top/left owner the tie', () => {
    const first = { width: 1, color: '#111', style: 'solid' as const }
    const second = { width: 2, color: '#222', style: 'dashed' as const }
    expect(resolveSharedEdge({ declaration: first, specificity: 5, owner: 'top-left' }, { declaration: second, specificity: 5, owner: 'bottom-right' })).toEqual(first)
  })

  it('maps logical inline edges in rtl', () => {
    const style = resolveCellStyle([{ padding: { left: 1, right: 5 } }], 'rtl')
    expect(style.logicalPadding.inlineStart).toBe(5)
    expect(style.logicalPadding.inlineEnd).toBe(1)
  })
})
```

- [ ] **Step 2: Run the style test and verify the module is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/style.test.ts`

Expected: FAIL with `Failed to load url ./style`.

- [ ] **Step 3: Implement cascade, box expansion, and border ownership**

```ts
// packages/materials/table/kernel/src/style.ts
import type { TableBorderStyle, TableInsets, TableStyle, TableTypography } from './model'

export interface ResolvedTableStyle {
  padding: TableInsets
  logicalPadding: { blockStart: number, inlineEnd: number, blockEnd: number, inlineStart: number }
  background?: string
  typography: TableTypography
  border: NonNullable<TableStyle['border']>
  borderSpecificity: Partial<Record<keyof NonNullable<TableStyle['border']>, number>>
  overflow: 'clip' | 'visible'
}

export interface EdgeCandidate {
  declaration?: TableBorderStyle
  specificity: number
  owner: 'top-left' | 'bottom-right'
}

export function resolveCellStyle(cascade: Array<TableStyle | undefined>, direction: 'ltr' | 'rtl'): ResolvedTableStyle {
  const result: ResolvedTableStyle = {
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    logicalPadding: { blockStart: 0, inlineEnd: 0, blockEnd: 0, inlineStart: 0 },
    typography: { direction },
    border: {},
    borderSpecificity: {},
    overflow: 'clip',
  }
  for (const [specificity, style] of cascade.entries()) {
    if (!style) continue
    result.padding = { ...result.padding, ...style.padding }
    result.typography = { ...result.typography, ...style.typography }
    for (const [edge, declaration] of Object.entries(style.border ?? {})) {
      if (!declaration) continue
      const logicalEdge = edge as keyof NonNullable<TableStyle['border']>
      result.border[logicalEdge] = declaration
      result.borderSpecificity[logicalEdge] = specificity
    }
    if (style.background !== undefined) result.background = style.background
    if (style.overflow !== undefined) result.overflow = style.overflow
  }
  result.logicalPadding = {
    blockStart: result.padding.top,
    inlineEnd: direction === 'rtl' ? result.padding.left : result.padding.right,
    blockEnd: result.padding.bottom,
    inlineStart: direction === 'rtl' ? result.padding.right : result.padding.left,
  }
  return result
}

export function resolveSharedEdge(first: EdgeCandidate, second: EdgeCandidate): TableBorderStyle | undefined {
  if (!first.declaration) return second.declaration
  if (!second.declaration) return first.declaration
  if (first.specificity !== second.specificity)
    return first.specificity > second.specificity ? first.declaration : second.declaration
  return first.owner === 'top-left' ? first.declaration : second.declaration
}
```

Add the export:

```ts
export * from './style'
```

- [ ] **Step 4: Run style and existing render tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/style.test.ts packages/materials/table/kernel/src/render.test.ts`

Expected: PASS. Update the existing renderer in this commit to consume `ResolvedTableStyle.padding` rather than table-global padding; its existing render tests remain green.

- [ ] **Step 5: Commit deterministic styling**

```bash
git add packages/materials/table/kernel/src/style.ts packages/materials/table/kernel/src/style.test.ts packages/materials/table/kernel/src/render.ts packages/materials/table/kernel/src/render.test.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): add deterministic cell style cascade"
```

## Task 7: Parent-Linked Runtime Binding Scopes

**Files:**
- Create: `packages/materials/table/kernel/src/binding-scope.ts`
- Test: `packages/materials/table/kernel/src/binding-scope.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write the failing immutable scope test**

```ts
// packages/materials/table/kernel/src/binding-scope.test.ts
import { describe, expect, it } from 'vitest'
import type { MaterialRuntimeScope } from '@easyink/core'
import { createTableRecordScope } from './binding-scope'

describe('createTableRecordScope', () => {
  it('keeps record data local and links to the immutable root scope', () => {
    const root: MaterialRuntimeScope = Object.freeze({
      key: 'document', data: Object.freeze({ invoiceTotal: 30 }),
    })
    const record = Object.freeze({ id: 7, amount: 10 })
    const detail = createTableRecordScope(root, 'key:7', record)
    expect(detail).toEqual({ key: 'document:record:key:7', data: record, parent: root })
    expect(detail.parent).toBe(root)
    expect(detail.data).toBe(record)
  })
})
```

- [ ] **Step 2: Run the test and verify the scope module is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/binding-scope.test.ts`

Expected: FAIL with missing `binding-scope`.

- [ ] **Step 3: Implement explicit read-only scope layering**

```ts
// packages/materials/table/kernel/src/binding-scope.ts
import type { MaterialRuntimeScope } from '@easyink/core'

export function createTableRecordScope(
  parent: MaterialRuntimeScope,
  recordKey: string,
  record: Readonly<Record<string, unknown>>,
): MaterialRuntimeScope {
  return Object.freeze({
    key: `${parent.key}:record:${recordKey}`,
    data: record,
    parent,
  })
}
```

Export `binding-scope.ts` from `index.ts`. Core's raw resolver evaluates against the current immutable scope and follows `parent` only while the binding result is `missing`; `unbound` and `invalid` remain distinct. Header/footer and collection ports use the root request scope; detail-key and detail-cell ports use `createTableRecordScope`. Collection/detail-key consume raw resolved JSON and never prefix/suffix/preset formatting; visible cell text uses the display resolver and falls back to persisted text. The host/datasource adapter prepares sorting, filtering, and aggregate values before Viewer layout. Table runtime never guesses private aggregate field names and never executes sum/count/min/max/avg functions.

- [ ] **Step 4: Run the scope test**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/binding-scope.test.ts`

Expected: PASS with `1 passed`; input scope objects remain unchanged.

- [ ] **Step 5: Commit binding semantics**

```bash
git add packages/materials/table/kernel/src/binding-scope.ts packages/materials/table/kernel/src/binding-scope.test.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): add host-prepared binding scopes"
```

## Task 8: Shared Table MaterialLayoutPlan

**Files:**
- Create: `packages/materials/table/kernel/src/layout-plan.ts`
- Test: `packages/materials/table/kernel/src/layout-plan.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write failing layout tests for text and material cells**

```ts
// packages/materials/table/kernel/src/layout-plan.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createTableModel } from './model'
import { buildTableLayoutPlan, createTableMaterialLayoutPlan } from './layout-plan'
import { TableTopologyEngine } from './topology-engine'

describe('buildTableLayoutPlan', () => {
  const build = (input: Omit<import('./layout-plan').BuildTableLayoutInput, 'budget' | 'schedule'>) =>
    buildTableLayoutPlan({ ...input, budget: testBudget(), schedule: testSchedule() })

  it('uses resolved cell padding during text measurement', async () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    model.style.padding = { top: 2, right: 3, bottom: 2, left: 3 }
    model.bands[0]!.rows[0]!.cells[0]!.content = { kind: 'text', text: 'wrapped text' }
    const measureText = vi.fn(async () => ({ width: 20, height: 10 }))
    const plan = await build({
      model, constraints: constraints(40), direction: 'ltr', scope: { key: 'static', data: {} },
      instanceKey: 'table-1', measureText, measureSlot: vi.fn(),
    })
    expect(measureText).toHaveBeenCalledWith({
      text: 'wrapped text', availableWidth: 34, unit: 'mm',
      style: expect.objectContaining({
        fontFamily: 'sans-serif', fontSize: 4, lineHeight: 1.2,
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
      }),
    })
    expect(plan.cells[0]!.rect.height).toBeGreaterThanOrEqual(14)
  })

  it('measures a materials slot and keeps child overflow clipped', async () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    model.style.padding = { top: 2, right: 3, bottom: 2, left: 3 }
    const cell = model.bands[0]!.rows[0]!.cells[0]!
    cell.content = { kind: 'materials', slotId: `cell:${cell.id}` }
    const plan = await build({
      model, constraints: constraints(40), direction: 'ltr', scope: { key: 'static', data: {} }, instanceKey: 'table-1', measureText: vi.fn(),
      measureSlot: vi.fn(async ({ constraints }) => {
        expect(constraints.availableWidth).toBe(34)
        return {
        instanceKey: 'slot-instance', contentBounds: { x: 0, y: 0, width: 30, height: 25 }, childPlans: [],
        }
      }),
    })
    expect(plan.cells[0]).toMatchObject({
      content: { kind: 'materials', slotId: `cell:${cell.id}` }, clip: true, slotInstanceKey: 'slot-instance',
    })
    expect(plan.cells[0]).toMatchObject({
      rect: { x: 0, y: 0, width: 40, height: 29 },
      contentRect: { x: 3, y: 2, width: 34, height: 25 },
    })
    expect(createTableMaterialLayoutPlan({ nodeId: 'table-1', instanceKey: 'table-1', nodeRevision: 1, constraintKey: 'k', layout: plan }).slotBoxes)
      .toEqual([expect.objectContaining({
        slotId: `cell:${cell.id}`, slotInstanceKey: 'slot-instance', ownership: 'free', clip: true,
        box: { x: 3, y: 2, width: 34, height: 25 },
      })])
  })

  it('clamps an over-padded hosted content rect without negative geometry', async () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const cell = model.bands[0]!.rows[0]!.cells[0]!
    model.style.padding = { top: 1, right: 30, bottom: 1, left: 30 }
    cell.content = { kind: 'materials', slotId: `cell:${cell.id}` }
    const plan = await build({
      model, constraints: constraints(40), direction: 'ltr', scope: { key: 'static', data: {} },
      instanceKey: 'table-clamped', measureText: vi.fn(),
      measureSlot: async ({ constraints }) => {
        expect(constraints.availableWidth).toBe(0)
        return { instanceKey: 'clamped-slot', contentBounds: { x: 0, y: 0, width: 0, height: 4 }, childPlans: [] }
      },
    })
    expect(plan.cells[0]!.contentRect).toEqual({ x: 30, y: 1, width: 0, height: 6 })
  })

  it('measures only a merge anchor and allocates row-span deficit deterministically', async () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const rows = source.bands[0]!.rows
    const anchor = rows[0]!.cells[0]!
    rows[0]!.cells[1]!.content = { kind: 'materials', slotId: `cell:${rows[0]!.cells[1]!.id}` }
    const model = TableTopologyEngine.merge(source, {
      rowIds: rows.map(row => row.id),
      columnIds: source.columns.map(column => column.id),
      anchorCellId: anchor.id,
    })
    const measureText = vi.fn(async () => ({ width: 40, height: 30 }))
    const measureSlot = vi.fn(async () => ({
      instanceKey: 'covered', contentBounds: { x: 0, y: 0, width: 100, height: 100 }, childPlans: [],
    }))
    const plan = await build({
      model, constraints: constraints(40), direction: 'ltr', scope: { key: 'static', data: {} }, instanceKey: 'table-1', measureText, measureSlot,
    })
    expect(measureText).toHaveBeenCalledTimes(1)
    expect(measureSlot).not.toHaveBeenCalled()
    expect(plan.cells).toEqual([expect.objectContaining({
      cellId: anchor.id, rowSpan: 2, columnSpan: 2,
      rect: { x: 0, y: 0, width: 40, height: 30 },
    })])
    expect(plan.rowHeights).toEqual([8, 22])
  })

  it('commits shared-edge specificity and top-left tie breaks into paint facts', async () => {
    const model = createTableModel({ kind: 'static', columnCount: 3, rowCount: 1 })
    const [left, middle, right] = model.bands[0]!.rows[0]!.cells
    model.bands[0]!.rows[0]!.style = {
      border: { inlineEnd: { width: 1, color: '#0a0', style: 'solid' } },
    }
    left!.style = { border: { inlineEnd: { width: 1, color: '#f00', style: 'solid' } } }
    middle!.style = { border: { inlineStart: { width: 2, color: '#00f', style: 'dashed' } } }
    right!.style = { border: { inlineStart: { width: 2, color: '#00f', style: 'dashed' } } }
    const plan = await build({
      model, constraints: constraints(90), direction: 'ltr', scope: { key: 'static', data: {} },
      instanceKey: 'table-edges', measureText: async () => ({ width: 0, height: 0 }), measureSlot: vi.fn(),
    })
    const edge = (cellId: string) => plan.cells.find(cell => cell.cellId === cellId)!
      .paintStyle.edges.find(candidate => candidate.side === 'right')!.declaration
    expect(edge(left!.id)).toEqual({ width: 1, color: '#f00', style: 'solid' })
    expect(edge(middle!.id)).toEqual({ width: 2, color: '#00f', style: 'dashed' })
    const published = createTableMaterialLayoutPlan({
      nodeId: 'table-edges', instanceKey: 'table-edges', nodeRevision: 1, constraintKey: 'edges', layout: plan,
    })
    expect(Object.isFrozen((published.payload as typeof plan).cells[0]!.paintStyle.edges)).toBe(true)
    expect(Object.isFrozen(model.bands[0]!.rows[0]!.cells[0]!.content)).toBe(false)
    expect((published.payload as typeof plan).cells[0]!.content).not.toBe(model.bands[0]!.rows[0]!.cells[0]!.content)
  })
})

function constraints(availableWidth: number): import('@easyink/core').LayoutConstraints {
  return { availableWidth, availableHeight: 100, unit: 'mm', writingMode: 'horizontal-tb' }
}

function testBudget(): import('@easyink/core').MaterialLayoutBudgetToken {
  let rows = 0
  let facts = 0
  return {
    maxRuntimeRows: 10_000, maxLayoutFacts: 100_000,
    get runtimeRowsUsed() { return rows }, get layoutFactsUsed() { return facts },
    reserveRuntimeRows: count => { rows += count },
    reserveLayoutFacts: (_kind, count) => { facts += count },
  }
}

function testSchedule(): import('@easyink/core').MaterialMeasureScheduler {
  return {
    maxInFlight: 1,
    mapOrdered: async (items, worker, signal) => {
      const output = []
      for (let index = 0; index < items.length; index++) output.push(await worker(items[index]!, index, signal))
      return output
    },
  }
}
```

- [ ] **Step 2: Run the test and verify the plan builder is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/layout-plan.test.ts`

Expected: FAIL with `Failed to load url ./layout-plan`.

- [ ] **Step 3: Implement the table-specific plan builder over MeasureService adapters**

```ts
// packages/materials/table/kernel/src/layout-plan.ts
import type {
  RuntimeRowId, TableBand, TableBandId, TableBandRole, TableBorderStyle, TableCell, TableCellId, TableColumnId,
  TableInsets, TableModel, TableRowId,
} from './model'
import type {
  LayoutConstraints, LayoutPlanDiagnostic, MaterialLayoutPlan, MaterialMeasureRequest, MaterialRuntimeScope,
  MaterialTextMeasureInput, Rect,
} from '@easyink/core'
import { resolveColumnTracks } from './tracks'
import type { ResolvedTableStyle } from './style'
import { resolveCellStyle, resolveSharedEdge } from './style'

export type TablePhysicalEdge = 'top' | 'right' | 'bottom' | 'left'
export interface TablePaintEdge {
  side: TablePhysicalEdge
  offset: number
  length: number
  declaration: TableBorderStyle
}
export interface TablePaintEdgeCandidate {
  declaration: TableBorderStyle
  specificity: number
}
export interface TableCellPaintStyle {
  padding: TableInsets
  backgroundColor?: string
  color?: string
  fontFamily: string
  fontSize: number
  fontWeight: 'normal' | 'bold'
  fontStyle: 'normal' | 'italic'
  lineHeight: number
  letterSpacing: number
  textAlign: 'start' | 'center' | 'end'
  verticalAlign: 'top' | 'middle' | 'bottom'
  direction: 'auto' | 'ltr' | 'rtl'
  whiteSpace: 'pre-wrap'
  overflowWrap: 'anywhere'
  overflow: 'hidden' | 'visible'
  edgeCandidates: Partial<Record<TablePhysicalEdge, TablePaintEdgeCandidate>>
  edges: TablePaintEdge[]
}

export interface TableCellLayout {
  instanceId: string
  rowInstanceId: string
  cellId: TableCellId
  bandId: TableBandId
  bandRole: TableBandRole
  rowId: TableRowId
  columnId: TableColumnId
  coveredRowIds: TableRowId[]
  coveredRowInstanceIds: string[]
  coveredColumnIds: TableColumnId[]
  rowSpan: number
  columnSpan: number
  rect: Rect
  contentRect: Rect
  content: TableCell['content']
  resolvedText?: string
  slotInstanceKey?: string
  paintStyle: TableCellPaintStyle
  clip: boolean
  runtimeRowId?: RuntimeRowId
}
export interface TableRowLayout {
  instanceId: string
  rowId: TableRowId
  bandId: TableBandId
  bandRole: TableBandRole
  rect: Rect
  runtimeRowId?: RuntimeRowId
}
export interface TableLayoutPlanData {
  width: number
  viewportWidth?: number
  contentWidth?: number
  height: number
  unit: LayoutConstraints['unit']
  direction: 'ltr' | 'rtl'
  cells: TableCellLayout[]
  columnIds: TableColumnId[]
  columnWidths: number[]
  rowHeights: number[]
  rows: TableRowLayout[]
  headerLabelsByColumn?: Record<string, string[]>
  fragmentFacts?: Record<string, { rowStart: number, rowCount: number, cellStart: number, cellCount: number }>
  boundaryEdgesByOffset?: Record<string, TablePaintEdge[]>
}
export interface BuildTableLayoutInput {
  model: TableModel
  constraints: LayoutConstraints
  columnWidths?: readonly number[]
  direction: 'ltr' | 'rtl'
  scope: MaterialRuntimeScope
  instanceKey: string
  fragmentId?: string
  bandIds?: readonly TableBandId[]
  runtimeRowId?: RuntimeRowId
  resolveText?: (cell: TableCell) => string
  deferPaintEdges?: boolean
  signal?: AbortSignal
  measureText: MaterialMeasureRequest['measureText']
  measureSlot: MaterialMeasureRequest['measureSlot']
  budget: MaterialMeasureRequest['budget']
  schedule: MaterialMeasureRequest['schedule']
  layoutFactsReserved?: boolean
}

export async function buildTableLayoutPlan(input: BuildTableLayoutInput): Promise<TableLayoutPlanData> {
  const viewportWidth = input.constraints.availableWidth
  const signal = input.signal ?? new AbortController().signal
  const resolvedTracks = input.columnWidths ? undefined : resolveColumnTracks(viewportWidth, input.model.columns.map(column => column.track))
  const columnWidths = input.columnWidths
    ? [...input.columnWidths]
    : resolvedTracks!.widths
  const contentWidth = columnWidths.reduce((sum, value) => sum + value, 0)
  const width = contentWidth
  if (columnWidths.length !== input.model.columns.length)
    throw new Error('resolved column width count does not match table columns')
  const columnOffsets = prefixOffsets(columnWidths)
  const logicalX = columnWidths.map((columnWidth, index) => input.direction === 'ltr'
    ? columnOffsets[index]!
    : contentWidth - columnOffsets[index]! - columnWidth)
  const includedBands = input.bandIds
    ? input.model.bands.filter(band => input.bandIds!.includes(band.id))
    : input.model.bands
  const rowEntries = includedBands.flatMap(band => band.rows.map(row => ({ band, row })))
  if (!input.layoutFactsReserved) {
    input.budget.reserveLayoutFacts('row', rowEntries.length)
    input.budget.reserveLayoutFacts('cell', rowEntries.length * input.model.columns.length)
  }
  const rowIndexById = new Map(rowEntries.map((entry, index) => [entry.row.id, index]))
  const columnIndexById = new Map(input.model.columns.map((column, index) => [column.id, index]))
  const cellsByRow = new Map(rowEntries.map(entry => [
    entry.row.id,
    new Map(entry.row.cells.map(cell => [cell.columnId, cell])),
  ]))
  const inactive = new Set(input.model.merges.flatMap(merge => merge.inactiveCellIds))
  const mergeByAnchor = new Map(input.model.merges.map(merge => [merge.anchorCellId, merge]))
  const rowHeights = rowEntries.map(entry => entry.row.minHeight)
  const pending: Array<{
    cell: TableCell
    band: TableBand
    rowId: TableRowId
    rowIndices: number[]
    columnIndices: number[]
    requiredHeight: number
    clip: boolean
    resolvedText?: string
    slotInstanceKey?: string
    paintStyle: TableCellPaintStyle
  }> = []

  for (const { band, row } of rowEntries) {
    for (const column of input.model.columns) {
      if (input.signal?.aborted) throw input.signal.reason
      const cell = cellsByRow.get(row.id)!.get(column.id)!
      if (inactive.has(cell.id)) continue
      const merge = mergeByAnchor.get(cell.id)
      const rowIndices = (merge?.rowIds ?? [row.id]).map(rowId => rowIndexById.get(rowId)!).sort((a, b) => a - b)
      const columnIndices = (merge?.columnIds ?? [column.id]).map(columnId => columnIndexById.get(columnId)!).sort((a, b) => a - b)
      const style = resolveCellStyle([input.model.style, band.style, column.style, row.style, cell.style], input.direction)
      const paintStyle = createTableCellPaintStyle(style, input.direction)
      const width = columnIndices.reduce((sum, index) => sum + columnWidths[index]!, 0)
      const availableWidth = Math.max(0, width - style.padding.left - style.padding.right)
      const resolvedText = cell.content.kind === 'text' ? input.resolveText?.(cell) ?? cell.content.text : undefined
      const slotPlan = cell.content.kind === 'materials'
        ? await input.measureSlot({
            slot: cell.content.slotId,
            scope: input.scope,
            constraints: { ...input.constraints, availableWidth },
          }, signal)
        : undefined
      const measured = cell.content.kind === 'text'
        ? await input.measureText({
            text: resolvedText!, availableWidth, unit: input.constraints.unit,
            style: toMaterialTextStyle(paintStyle),
          })
        : slotPlan!.contentBounds
      if (input.signal?.aborted) throw input.signal.reason
      const requiredHeight = measured.height + style.padding.top + style.padding.bottom
      if (rowIndices.length === 1) rowHeights[rowIndices[0]!] = Math.max(rowHeights[rowIndices[0]!]!, requiredHeight)
      pending.push({
        cell, band, rowId: row.id, rowIndices, columnIndices, requiredHeight,
        clip: style.overflow !== 'visible', resolvedText, slotInstanceKey: slotPlan?.instanceKey,
        paintStyle,
      })
    }
  }

  const spanning = pending.filter(item => item.rowIndices.length > 1).sort((first, second) =>
    first.rowIndices.at(-1)! - second.rowIndices.at(-1)! || first.rowIndices[0]! - second.rowIndices[0]!
      || first.cell.id.localeCompare(second.cell.id))
  for (const item of spanning) {
    const allocated = item.rowIndices.reduce((sum, index) => sum + rowHeights[index]!, 0)
    const deficit = Math.max(0, item.requiredHeight - allocated)
    const lastRowIndex = item.rowIndices.at(-1)!
    rowHeights[lastRowIndex] = rowHeights[lastRowIndex]! + deficit
  }

  const rowOffsets = prefixOffsets(rowHeights)
  const rows: TableRowLayout[] = rowEntries.map((entry, index) => ({
    instanceId: `${input.instanceKey}:${input.runtimeRowId ?? 'static'}:row:${entry.row.id}`,
    rowId: entry.row.id,
    bandId: entry.band.id,
    bandRole: entry.band.role,
    rect: { x: 0, y: rowOffsets[index]!, width, height: rowHeights[index]! },
    ...(input.runtimeRowId ? { runtimeRowId: input.runtimeRowId } : {}),
  }))
  const cells = pending.map((item): TableCellLayout => {
    const x = Math.min(...item.columnIndices.map(index => logicalX[index]!))
    const rect = {
      x,
      y: rowOffsets[item.rowIndices[0]!]!,
      width: item.columnIndices.reduce((sum, index) => sum + columnWidths[index]!, 0),
      height: item.rowIndices.reduce((sum, index) => sum + rowHeights[index]!, 0),
    }
    return {
      instanceId: `${input.instanceKey}:${input.runtimeRowId ?? 'static'}:cell:${item.cell.id}`,
      rowInstanceId: `${input.instanceKey}:${input.runtimeRowId ?? 'static'}:row:${item.rowId}`,
      cellId: item.cell.id,
      bandId: item.band.id,
      bandRole: item.band.role,
      rowId: item.rowId,
      columnId: item.cell.columnId,
      coveredRowIds: item.rowIndices.map(index => rowEntries[index]!.row.id),
      coveredRowInstanceIds: item.rowIndices.map(index =>
        `${input.instanceKey}:${input.runtimeRowId ?? 'static'}:row:${rowEntries[index]!.row.id}`),
      coveredColumnIds: item.columnIndices.map(index => input.model.columns[index]!.id),
      rowSpan: item.rowIndices.length,
      columnSpan: item.columnIndices.length,
      rect,
      contentRect: {
        x: rect.x + item.paintStyle.padding.left,
        y: rect.y + item.paintStyle.padding.top,
        width: Math.max(0, rect.width - item.paintStyle.padding.left - item.paintStyle.padding.right),
        height: Math.max(0, rect.height - item.paintStyle.padding.top - item.paintStyle.padding.bottom),
      },
      content: cloneJsonValue(item.cell.content),
      ...(item.resolvedText !== undefined ? { resolvedText: item.resolvedText } : {}),
      ...(item.slotInstanceKey ? { slotInstanceKey: item.slotInstanceKey } : {}),
      paintStyle: item.paintStyle,
      clip: item.clip,
      ...(input.runtimeRowId ? { runtimeRowId: input.runtimeRowId } : {}),
    }
  })
  const layout: TableLayoutPlanData = {
    width: contentWidth, viewportWidth, contentWidth,
    height: rowHeights.reduce((sum, height) => sum + height, 0), unit: input.constraints.unit,
    direction: input.direction,
    cells, columnIds: input.model.columns.map(column => column.id), columnWidths, rowHeights, rows,
    headerLabelsByColumn: Object.fromEntries(input.model.columns.map(column => [column.id, cells
      .filter(cell => cell.bandRole === 'header' && cell.coveredColumnIds.includes(column.id))
      .map(cell => cell.resolvedText ?? '')
      .filter(Boolean)])),
  }
  return input.deferPaintEdges ? layout : resolveTablePaintEdges(layout, input.direction)
}

function prefixOffsets(values: readonly number[]): number[] {
  const offsets: number[] = []
  let offset = 0
  for (const value of values) {
    offsets.push(offset)
    offset += value
  }
  return offsets
}

function createTableCellPaintStyle(style: ResolvedTableStyle, direction: 'ltr' | 'rtl'): TableCellPaintStyle {
  const typography = style.typography
  return {
    padding: { ...style.padding },
    ...(style.background !== undefined ? { backgroundColor: style.background } : {}),
    ...(typography.color !== undefined ? { color: typography.color } : {}),
    fontFamily: typography.fontFamily ?? 'sans-serif',
    fontSize: typography.fontSize ?? 4,
    fontWeight: typography.fontWeight ?? 'normal',
    fontStyle: typography.fontStyle ?? 'normal',
    lineHeight: typography.lineHeight ?? 1.2,
    letterSpacing: typography.letterSpacing ?? 0,
    textAlign: typography.textAlign ?? 'start',
    verticalAlign: typography.verticalAlign ?? 'top',
    direction: typography.direction ?? direction,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    overflow: style.overflow === 'visible' ? 'visible' : 'hidden',
    edgeCandidates: physicalEdgeCandidates(style, direction),
    edges: [],
  }
}

function physicalEdgeCandidates(
  style: ResolvedTableStyle,
  direction: 'ltr' | 'rtl',
): Partial<Record<TablePhysicalEdge, TablePaintEdgeCandidate>> {
  const logicalByPhysical = {
    top: 'blockStart',
    right: direction === 'ltr' ? 'inlineEnd' : 'inlineStart',
    bottom: 'blockEnd',
    left: direction === 'ltr' ? 'inlineStart' : 'inlineEnd',
  } as const
  return Object.fromEntries(Object.entries(logicalByPhysical).flatMap(([physical, logical]) => {
    const declaration = style.border[logical]
    return declaration ? [[physical, {
      declaration: { ...declaration }, specificity: style.borderSpecificity[logical] ?? -1,
    }]] : []
  }))
}

function toMaterialTextStyle(style: TableCellPaintStyle): MaterialTextMeasureInput['style'] {
  return {
    fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
    fontStyle: style.fontStyle, lineHeight: style.lineHeight, letterSpacing: style.letterSpacing,
    whiteSpace: style.whiteSpace, overflowWrap: style.overflowWrap,
  }
}

export function resolveTablePaintEdges(
  layout: TableLayoutPlanData,
  direction: 'ltr' | 'rtl',
): TableLayoutPlanData {
  if (layout.cells.length === 0) return layout
  const rowIndex = new Map(layout.rows.map((row, index) => [row.instanceId, index]))
  const columnIndex = new Map(layout.columnIds.map((id, index) => [id, index]))
  const owners = layout.rows.map(() => layout.columnIds.map(() => -1))
  layout.cells.forEach((cell, owner) => {
    for (const rowId of cell.coveredRowInstanceIds) {
      for (const columnId of cell.coveredColumnIds)
        owners[rowIndex.get(rowId)!]![columnIndex.get(columnId)!] = owner
    }
  })
  if (owners.some(row => row.some(owner => owner < 0)))
    throw new Error('active table layout does not cover the complete grid')

  const edges = layout.cells.map((): TablePaintEdge[] => [])
  const candidate = (owner: number, side: TablePhysicalEdge) => layout.cells[owner]!.paintStyle.edgeCandidates[side]
  const winner = (firstOwner: number, firstSide: TablePhysicalEdge, secondOwner: number, secondSide: TablePhysicalEdge) =>
    resolveSharedEdge(
      { declaration: candidate(firstOwner, firstSide)?.declaration,
        specificity: candidate(firstOwner, firstSide)?.specificity ?? -1, owner: 'top-left' },
      { declaration: candidate(secondOwner, secondSide)?.declaration,
        specificity: candidate(secondOwner, secondSide)?.specificity ?? -1, owner: 'bottom-right' },
    )
  const sameBorder = (first: TableBorderStyle, second: TableBorderStyle) =>
    first.width === second.width && first.color === second.color && first.style === second.style
  const add = (owner: number, side: TablePhysicalEdge, offset: number, length: number, declaration?: TableBorderStyle) => {
    if (!declaration || declaration.width <= 0 || declaration.style === 'none' || length <= 0) return
    const list = edges[owner]!
    const previous = list.at(-1)
    if (previous?.side === side && sameBorder(previous.declaration, declaration)
      && Math.abs(previous.offset + previous.length - offset) <= Number.EPSILON * 16) {
      previous.length += length
      return
    }
    list.push({ side, offset, length, declaration: { ...declaration } })
  }

  const logicalOffsets = prefixOffsets(layout.columnWidths)
  const columnOffsets = layout.columnWidths.map((width, index) => direction === 'ltr'
    ? logicalOffsets[index]!
    : layout.width - logicalOffsets[index]! - width)
  const physicalColumns = layout.columnIds.map((_, index) => index)
    .sort((first, second) => columnOffsets[first]! - columnOffsets[second]!)
  for (const column of physicalColumns) {
    const owner = owners[0]![column]!
    add(owner, 'top', columnOffsets[column]! - layout.cells[owner]!.rect.x,
      layout.columnWidths[column]!, candidate(owner, 'top')?.declaration)
  }
  for (let row = 1; row < owners.length; row++) {
    for (const column of physicalColumns) {
      const top = owners[row - 1]![column]!
      const bottom = owners[row]![column]!
      if (top === bottom) continue
      add(top, 'bottom', columnOffsets[column]! - layout.cells[top]!.rect.x,
        layout.columnWidths[column]!, winner(top, 'bottom', bottom, 'top'))
    }
  }
  const lastRow = owners.length - 1
  for (const column of physicalColumns) {
    const owner = owners[lastRow]![column]!
    add(owner, 'bottom', columnOffsets[column]! - layout.cells[owner]!.rect.x,
      layout.columnWidths[column]!, candidate(owner, 'bottom')?.declaration)
  }

  for (let row = 0; row < owners.length; row++) {
    const leftColumn = physicalColumns[0]!
    const leftOwner = owners[row]![leftColumn]!
    add(leftOwner, 'left', layout.rows[row]!.rect.y - layout.cells[leftOwner]!.rect.y,
      layout.rows[row]!.rect.height, candidate(leftOwner, 'left')?.declaration)
    for (let physical = 1; physical < physicalColumns.length; physical++) {
      const left = owners[row]![physicalColumns[physical - 1]!]!
      const right = owners[row]![physicalColumns[physical]!]!
      if (left === right) continue
      add(left, 'right', layout.rows[row]!.rect.y - layout.cells[left]!.rect.y,
        layout.rows[row]!.rect.height, winner(left, 'right', right, 'left'))
    }
    const rightColumn = physicalColumns.at(-1)!
    const rightOwner = owners[row]![rightColumn]!
    add(rightOwner, 'right', layout.rows[row]!.rect.y - layout.cells[rightOwner]!.rect.y,
      layout.rows[row]!.rect.height, candidate(rightOwner, 'right')?.declaration)
  }

  return {
    ...layout,
    cells: layout.cells.map((cell, index) => ({
      ...cell,
      paintStyle: { ...cell.paintStyle, edges: edges[index]! },
    })),
  }
}

export function freezeTableLayoutPlan<T extends JsonValue>(value: T): T {
  const isolated = cloneJsonValue(value)
  return freezeJsonCopy(isolated)
}

function freezeJsonCopy<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(freezeJsonCopy)
    return Object.freeze(value) as T
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeJsonCopy)
    return Object.freeze(value) as T
  }
  return value
}

export function createTableMaterialLayoutPlan(input: {
  nodeId: string
  instanceKey: string
  nodeRevision: number
  constraintKey: string
  layout: TableLayoutPlanData
  diagnostics?: readonly LayoutPlanDiagnostic[]
}): MaterialLayoutPlan<TableLayoutPlanData> {
  const viewportWidth = input.layout.viewportWidth ?? input.layout.width
  const contentWidth = input.layout.contentWidth ?? input.layout.width
  const overflowDiagnostics = contentWidth > viewportWidth ? [{
    code: 'TABLE_TRACK_INLINE_OVERFLOW', severity: 'warning' as const,
    message: 'Resolved fixed/minimum tracks exceed the available inline viewport.',
    instanceKey: input.instanceKey, nodeId: input.nodeId,
    detail: { viewportWidth, contentWidth },
  }] : []
  return freezeTableLayoutPlan({
    instanceKey: input.instanceKey,
    nodeId: input.nodeId,
    nodeRevision: input.nodeRevision,
    constraintKey: input.constraintKey,
    borderBox: { x: 0, y: 0, width: input.layout.width, height: input.layout.height },
    contentBox: { x: 0, y: 0, width: input.layout.width, height: input.layout.height },
    slotBoxes: input.layout.cells.flatMap(cell => {
      if (cell.content.kind !== 'materials') return []
      if (!cell.slotInstanceKey) throw new Error(`missing measured slot instance for cell ${cell.instanceId}`)
      return [{
        slotId: cell.content.slotId, slotInstanceKey: cell.slotInstanceKey,
        box: cell.contentRect, ownership: 'free' as const, clip: cell.clip,
      }]
    }),
    breakOpportunities: [],
    diagnostics: [...(input.diagnostics ?? []), ...overflowDiagnostics],
    payload: input.layout,
  })
}
```

The Viewer emits an outer clipped viewport at `viewportWidth` and an inner semantic table/`colgroup` at explicit `contentWidth`; RTL aligns the content inline-end without negative measured cell coordinates. `colgroup` uses every resolved `columnWidth`, so first-row merges never infer equal widths. DOM and layout therefore agree under fixed/min overflow, non-equal tracks, merges, and RTL.

Implement cell measurement as two passes even though the compact listing above is linear: first build lightweight active-cell jobs in stable band/row/column order after reserving row/cell/slot/edge facts; then call `input.schedule.mapOrdered(jobs, measureJob, signal)` and reduce ordered results into `rowHeights`/`pending`. Do not `await` inside discovery and do not create an unbounded `Promise.all`. Tests prove max in-flight, abort prevents new jobs, and first failure discards partial arrays.

The static/data layout facets publish through `createTableMaterialLayoutPlan` and pass through `MaterialMeasureRequest.instanceKey`; a root instance happens to equal its node ID, while nested or repeated instances must never be collapsed back to `nodeId`. They do not inspect DOM geometry. Freeze the plan and every nested payload array/object before returning it to `MeasureService`, and omit optional keys instead of storing `undefined` so the payload remains a recursive JSON value. Core mints distinct instance keys for repeated hosted slot children. Accessibility and semantic Viewer rendering consume `TableCellLayout` rather than recomputing merges, spans, or active cells from DOM state.

Add the export:

```ts
export * from './layout-plan'
```

- [ ] **Step 4: Run layout, track, and style tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/layout-plan.test.ts packages/materials/table/kernel/src/tracks.test.ts packages/materials/table/kernel/src/style.test.ts`

Expected: PASS; covered cells produce no measurement or render-layout entry, the anchor owns the full span rect, and row-span deficit allocation is reproducible.

- [ ] **Step 5: Commit the shared layout plan**

```bash
git add packages/materials/table/kernel/src/layout-plan.ts packages/materials/table/kernel/src/layout-plan.test.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): build shared report table layout plans"
```

## Task 9: Cancellable Prepared Runtime Detail Blocks And RuntimeRowId

**Files:**
- Create: `packages/materials/table/data/src/runtime-rows.ts`
- Test: `packages/materials/table/data/src/runtime-rows.test.ts`
- Modify: `packages/materials/table/data/src/index.ts`

- [ ] **Step 1: Write failing chunked identity and disposal tests**

```ts
// packages/materials/table/data/src/runtime-rows.test.ts
import { describe, expect, it, vi } from 'vitest'
import { encodeTableOpaqueIdPart } from '@easyink/material-table-kernel'
import { createArrayRuntimeRecordSource, createRuntimeRows } from './runtime-rows'

describe('createRuntimeRows', () => {
  it('opens lazily and reads only the requested sequential record chunk', async () => {
    const readNext = vi.fn(async () => ({ records: [{ id: 'a' }], done: false }))
    const active = cursor(readNext, new Map([['a', 1], ['b', 1]]), 2)
    const source = { open: vi.fn(async () => active) }
    const rows = createRuntimeRows({ dataRevision: 7, source, readDetailKey: record => record.id })
    expect(source.open).not.toHaveBeenCalled()
    expect((await rows.next(1)).items[0]!.id).toBe(`key-${encodeTableOpaqueIdPart('a')}`)
    expect(readNext).toHaveBeenCalledTimes(1)
    expect(readNext).toHaveBeenCalledWith(1, undefined)
    await rows.dispose()
    expect(active.close).toHaveBeenCalledTimes(1)
  })

  it('falls back every colliding record, including the first duplicate occurrence', async () => {
    const readNext = vi.fn()
      .mockResolvedValueOnce({ records: [{ id: 'x' }], done: false })
      .mockResolvedValueOnce({ records: [{ id: 'x' }, {}], done: true })
    const rows = createRuntimeRows({
      dataRevision: 9,
      source: { open: async () => cursor(readNext, new Map([['x', 2]]), 3) },
      readDetailKey: record => record.id,
    })
    const first = await rows.next(1)
    const second = await rows.next(2)
    expect([...first.items, ...second.items].map(item => item.id)).toEqual([
      'fallback-revision-9-index-0-occurrence-1', 'fallback-revision-9-index-1-occurrence-2',
      'fallback-revision-9-index-2-occurrence-1',
    ])
    expect([...first.diagnostics, ...second.diagnostics].map(item => item.code)).toEqual([
      'TABLE_DETAIL_KEY_DUPLICATE', 'TABLE_DETAIL_KEY_DUPLICATE', 'TABLE_DETAIL_KEY_MISSING',
    ])
  })

  it('maps invalid collections to zero details and rejects a declared limit before record reads', async () => {
    const invalid = createRuntimeRows({ dataRevision: 2, source: { open: async () => undefined }, readDetailKey: () => undefined })
    expect(await invalid.next(50)).toEqual({
      items: [], done: true,
      diagnostics: [{ code: 'TABLE_COLLECTION_INVALID', recordIndex: 0 }],
    })
    const readNext = vi.fn()
    const limitedCursor = cursor(readNext, new Map(), 100_001)
    const limited = createRuntimeRows({
      dataRevision: 3, maxRows: 100_000,
      source: { open: async () => limitedCursor },
      readDetailKey: () => undefined,
    })
    await expect(limited.next(1)).rejects.toMatchObject({ code: 'TABLE_RUNTIME_ROW_LIMIT', limit: 100_000, observed: 100_001 })
    expect(readNext).not.toHaveBeenCalled()
    expect(limitedCursor.close).toHaveBeenCalledTimes(1)
  })

  it('uses quiet revision-local identity when detailKey is not configured', async () => {
    const rows = createRuntimeRows({
      dataRevision: 5,
      source: createArrayRuntimeRecordSource([{ value: 'a' }, { value: 'b' }]),
    })
    const chunk = await rows.next(2)
    expect(chunk.items.map(item => item.id)).toEqual([
      'fallback-revision-5-index-0-occurrence-1', 'fallback-revision-5-index-1-occurrence-1',
    ])
    expect(chunk.diagnostics).toEqual([])
  })

  it('cancels an in-flight cursor read and publishes no partial chunk', async () => {
    const controller = new AbortController()
    const readNext = vi.fn((_limit: number, signal?: AbortSignal) => new Promise<never>((_resolve, reject) => {
      signal!.addEventListener('abort', () => reject(signal!.reason), { once: true })
    }))
    const active = cursor(readNext, new Map(), undefined)
    const rows = createRuntimeRows({
      dataRevision: 4,
      source: { open: async () => active },
      readDetailKey: () => undefined,
    })
    const pending = rows.next(1, controller.signal)
    controller.abort(new Error('cancelled'))
    await expect(pending).rejects.toThrow('cancelled')
    expect(readNext).toHaveBeenCalledTimes(1)
    expect(active.close).toHaveBeenCalledTimes(1)
    await rows.dispose()
    expect(active.close).toHaveBeenCalledTimes(1)
  })

  it('does not open a source when the request is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('cancelled-before-open'))
    const open = vi.fn()
    const rows = createRuntimeRows({ dataRevision: 6, source: { open } })
    await expect(rows.next(1, controller.signal)).rejects.toThrow('cancelled-before-open')
    expect(open).not.toHaveBeenCalled()
  })

  it('closes once and publishes nothing when dispose races an in-flight read', async () => {
    let resolveRead!: (value: unknown) => void
    const readNext = vi.fn(() => new Promise<unknown>((resolve) => { resolveRead = resolve }))
    const active = cursor(readNext, new Map(), undefined)
    const rows = createRuntimeRows({ dataRevision: 7, source: { open: async () => active } })
    const pending = rows.next(1)
    await Promise.resolve()
    await rows.dispose()
    resolveRead({ records: [{ id: 1 }], done: true })
    await expect(pending).rejects.toThrow('disposed')
    await rows.dispose()
    expect(active.close).toHaveBeenCalledTimes(1)
  })

  it('encodes punctuation and Unicode keys as opaque DOM-safe runtime IDs', async () => {
    const rows = createRuntimeRows({
      dataRevision: 8,
      source: createArrayRuntimeRecordSource([{ id: '  ' }, { id: 'a:b' }, { id: '"雪' }, { id: '雪'.repeat(100) }]),
      readDetailKey: record => record.id,
    })
    const chunk = await rows.next(4)
    expect(chunk.items.map(item => item.id)).toEqual([
      'fallback-revision-8-index-0-occurrence-1',
      `key-${encodeTableOpaqueIdPart('a:b')}`,
      `key-${encodeTableOpaqueIdPart('"雪')}`,
      'fallback-revision-8-index-3-occurrence-1',
    ])
    expect(chunk.items.every(item => /^[a-z0-9-]+$/i.test(item.id))).toBe(true)
    expect(chunk.diagnostics.at(-1)).toEqual({ code: 'TABLE_DETAIL_KEY_INVALID', recordIndex: 3 })
  })
})

function cursor(
  readNext: (limit: number, signal?: AbortSignal) => Promise<unknown>,
  multiplicity: ReadonlyMap<string, number>,
  declaredRowCount: number | undefined,
) {
  return { declaredRowCount, keyIndex: { completeness: 'complete' as const, multiplicity }, readNext, close: vi.fn() }
}
```

- [ ] **Step 2: Run the test and confirm the runtime row source is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/data/src/runtime-rows.test.ts`

Expected: FAIL with `Failed to load url ./runtime-rows`.

- [ ] **Step 3: Implement cancellable lazy chunks and identity fallback**

```ts
// packages/materials/table/data/src/runtime-rows.ts
import type { RuntimeRowId } from '@easyink/material-table-kernel'
import { encodeTableOpaqueIdPart } from '@easyink/material-table-kernel'
import { isObject } from '@easyink/shared'

export interface RuntimeDetailBlock { id: RuntimeRowId, record: Record<string, unknown>, recordIndex: number }
export interface RuntimeRowDiagnostic {
  code: 'TABLE_COLLECTION_INVALID' | 'TABLE_DETAIL_KEY_MISSING' | 'TABLE_DETAIL_KEY_INVALID'
    | 'TABLE_DETAIL_KEY_DUPLICATE' | 'TABLE_DETAIL_KEY_UNPROVEN'
  recordIndex: number
}
export interface RuntimeRowChunk { items: RuntimeDetailBlock[], done: boolean, diagnostics: RuntimeRowDiagnostic[] }
export interface RuntimeRows {
  next: (limit: number, signal?: AbortSignal) => Promise<RuntimeRowChunk>
  dispose: () => Promise<void>
}
export interface RuntimeRecordChunk { records: readonly Record<string, unknown>[], done: boolean }
export interface RuntimeDetailKeyIndex {
  completeness: 'complete' | 'unknown'
  multiplicity: ReadonlyMap<string, number>
}
export interface RuntimeRecordCursor {
  declaredRowCount?: number
  keyIndex: RuntimeDetailKeyIndex
  readNext: (limit: number, signal?: AbortSignal) => Promise<unknown>
  close: () => void | Promise<void>
}
export interface RuntimeRecordSource {
  open: (input: {
    readDetailKey?: (record: Record<string, unknown>, recordIndex: number) => unknown
    maxRows: number
  }, signal?: AbortSignal) => Promise<RuntimeRecordCursor | undefined>
}

export function createOpenedRuntimeRecordSource(
  result: Awaited<ReturnType<import('@easyink/core').MaterialCollectionOpener>>,
): RuntimeRecordSource {
  return {
    async open() {
      if (result.status === 'unbound') return emptyRuntimeRecordCursor()
      if (result.status !== 'opened') return undefined
      return adaptCoreCollectionCursor(result.cursor)
    },
  }
}

function emptyRuntimeRecordCursor(): RuntimeRecordCursor {
  return {
    declaredRowCount: 0, keyIndex: { completeness: 'complete', multiplicity: new Map() },
    readNext: async () => ({ records: [], done: true }), close: () => {},
  }
}

function adaptCoreCollectionCursor(cursor: import('@easyink/core').MaterialCollectionCursor): RuntimeRecordCursor {
  return {
    ...(cursor.declaredRowCount == null ? {} : { declaredRowCount: cursor.declaredRowCount }),
    keyIndex: cursor.keyMultiplicity === 'unknown'
      ? { completeness: 'unknown', multiplicity: new Map() }
      : { completeness: 'complete', multiplicity: cursor.keyMultiplicity },
    readNext: cursor.readNext,
    close: () => cursor.close(),
  }
}

export class TableRuntimeRowLimitError extends Error {
  readonly code = 'TABLE_RUNTIME_ROW_LIMIT'
  constructor(readonly limit: number, readonly observed: number) {
    super(`TABLE_RUNTIME_ROW_LIMIT: observed ${observed}, limit ${limit}`)
  }
}

function decodeChunk(value: unknown): RuntimeRecordChunk | undefined {
  if (!isObject(value) || !Array.isArray(value.records) || typeof value.done !== 'boolean') return undefined
  if (value.records.some(record => !isObject(record))) return undefined
  return { records: value.records as Record<string, unknown>[], done: value.done }
}

function normalizeKey(value: unknown): { kind: 'valid', value: string } | { kind: 'missing' | 'invalid' } {
  if (value == null || value === '') return { kind: 'missing' }
  if (typeof value === 'string') {
    if (!value.trim()) return { kind: 'missing' }
    return new TextEncoder().encode(value).length <= 512 ? { kind: 'valid', value } : { kind: 'invalid' }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const normalized = String(value)
    return new TextEncoder().encode(normalized).length <= 512 ? { kind: 'valid', value: normalized } : { kind: 'invalid' }
  }
  return { kind: 'invalid' }
}

function keyedRuntimeRowId(key: string): RuntimeRowId {
  return `key-${encodeTableOpaqueIdPart(key)}` as RuntimeRowId
}

function fallbackRuntimeRowId(dataRevision: number, recordIndex: number, occurrence: number): RuntimeRowId {
  return `fallback-revision-${dataRevision}-index-${recordIndex}-occurrence-${occurrence}` as RuntimeRowId
}

export function createArrayRuntimeRecordSource(value: unknown): RuntimeRecordSource {
  return {
    async open({ readDetailKey, maxRows }, signal) {
      if (signal?.aborted) throw signal.reason
      if (!Array.isArray(value) || value.some(record => !isObject(record))) return undefined
      const records = value as Record<string, unknown>[]
      const multiplicity = new Map<string, number>()
      if (records.length <= maxRows && readDetailKey) {
        for (const [recordIndex, record] of records.entries()) {
          const key = normalizeKey(readDetailKey(record, recordIndex))
          if (key.kind === 'valid') multiplicity.set(key.value, (multiplicity.get(key.value) ?? 0) + 1)
        }
      }
      let offset = 0
      return {
        declaredRowCount: records.length,
        keyIndex: { completeness: records.length <= maxRows ? 'complete' : 'unknown', multiplicity },
        async readNext(limit, readSignal) {
          if (readSignal?.aborted) throw readSignal.reason
          const chunk = records.slice(offset, offset + limit)
          offset += chunk.length
          return { records: chunk, done: offset >= records.length }
        },
        close() { offset = records.length },
      }
    },
  }
}

export function createRuntimeRows(input: {
  dataRevision: number
  source: RuntimeRecordSource
  readDetailKey?: (record: Record<string, unknown>, recordIndex: number) => unknown
  maxRows?: number
}): RuntimeRows {
  const maxRows = input.maxRows ?? 100_000
  const occurrences = new Map<string, number>()
  let cursorPromise: Promise<RuntimeRecordCursor | undefined> | undefined
  let activeCursor: RuntimeRecordCursor | undefined
  let recordIndex = 0
  let completed = false
  let disposed = false
  let cursorClosed = false

  function closeCursor(cursor = activeCursor): void {
    if (!cursor || cursorClosed) return
    cursorClosed = true
    cursor.close()
  }

  async function open(signal?: AbortSignal): Promise<RuntimeRecordCursor | undefined> {
    if (disposed) throw new Error('runtime rows are disposed')
    const cursor = await (cursorPromise ??= input.source.open({ readDetailKey: input.readDetailKey, maxRows }, signal))
    activeCursor = cursor
    if (disposed) {
      closeCursor(cursor)
      throw new Error('runtime rows are disposed')
    }
    return cursor
  }

  return {
    async next(limit: number, signal?: AbortSignal): Promise<RuntimeRowChunk> {
      if (signal?.aborted) throw signal.reason
      if (!Number.isInteger(limit) || limit <= 0) throw new RangeError('runtime row limit must be a positive integer')
      if (completed) return { items: [], done: true, diagnostics: [] }
      try {
        const cursor = await open(signal)
        if (!cursor) {
          completed = true
          return { items: [], done: true, diagnostics: [{ code: 'TABLE_COLLECTION_INVALID', recordIndex: 0 }] }
        }
        if (cursor.declaredRowCount != null && cursor.declaredRowCount > maxRows)
          throw new TableRuntimeRowLimitError(maxRows, cursor.declaredRowCount)
        const rawChunk = await cursor.readNext(Math.min(limit, maxRows - recordIndex + 1), signal)
        if (signal?.aborted) throw signal.reason
        if (disposed) throw new Error('runtime rows are disposed')
        const chunk = decodeChunk(rawChunk)
        if (!chunk || chunk.records.length > limit || (!chunk.done && chunk.records.length === 0)) {
          completed = true
          closeCursor(cursor)
          return { items: [], done: true, diagnostics: [{ code: 'TABLE_COLLECTION_INVALID', recordIndex }] }
        }
        if (recordIndex + chunk.records.length > maxRows)
          throw new TableRuntimeRowLimitError(maxRows, recordIndex + chunk.records.length)
        const diagnostics: RuntimeRowDiagnostic[] = []
        const items = chunk.records.map((record): RuntimeDetailBlock => {
          const currentIndex = recordIndex++
          if (!input.readDetailKey)
            return { id: fallbackRuntimeRowId(input.dataRevision, currentIndex, 1), record, recordIndex: currentIndex }
          const key = normalizeKey(input.readDetailKey(record, currentIndex))
          if (key.kind !== 'valid') {
            diagnostics.push({ code: key.kind === 'missing' ? 'TABLE_DETAIL_KEY_MISSING' : 'TABLE_DETAIL_KEY_INVALID', recordIndex: currentIndex })
            return { id: fallbackRuntimeRowId(input.dataRevision, currentIndex, 1), record, recordIndex: currentIndex }
          }
          const occurrence = (occurrences.get(key.value) ?? 0) + 1
          occurrences.set(key.value, occurrence)
          const multiplicity = cursor.keyIndex.multiplicity.get(key.value)
          if (cursor.keyIndex.completeness === 'complete' && multiplicity === 1)
            return { id: keyedRuntimeRowId(key.value), record, recordIndex: currentIndex }
          diagnostics.push({
            code: multiplicity != null && multiplicity > 1 ? 'TABLE_DETAIL_KEY_DUPLICATE' : 'TABLE_DETAIL_KEY_UNPROVEN',
            recordIndex: currentIndex,
          })
          return {
            id: fallbackRuntimeRowId(input.dataRevision, currentIndex, occurrence),
            record,
            recordIndex: currentIndex,
          }
        })
        if (disposed) throw new Error('runtime rows are disposed')
        if (chunk.done) {
          completed = true
          closeCursor(cursor)
        }
        return {
          items,
          done: chunk.done,
          diagnostics,
        }
      }
      catch (cause) {
        completed = true
        closeCursor()
        throw cause
      }
    },
    async dispose(): Promise<void> {
      if (disposed) return
      disposed = true
      completed = true
      const cursor = activeCursor ?? await cursorPromise?.catch(() => undefined)
      closeCursor(cursor)
    },
  }
}
```

The datasource adapter that opens `RuntimeRecordCursor` must provide the lightweight key multiplicity index before `readNext` exposes the first record. Its array implementation makes a key-only pass over the already prepared host array and does not clone, measure, or retain a second record array. A streaming adapter that cannot prove uniqueness returns `completeness: 'unknown'`; affected rows use revision-local IDs with `TABLE_DETAIL_KEY_UNPROVEN`, never provisional IDs that later change. Store one `closePromise`; every done/abort/error/dispose path calls the same `closeOnce()` and awaits it, so async host cleanup runs exactly once even when dispose races an in-flight read.

Add to `packages/materials/table/data/src/index.ts`:

```ts
export * from './runtime-rows'
```

- [ ] **Step 4: Run lazy runtime row tests**

Run: `pnpm exec vitest run --dom packages/materials/table/data/src/runtime-rows.test.ts`

Expected: PASS with `6 passed`; the first call performs one bounded `readNext`, the declared 100,000-row limit is checked before reading records, unconfigured `detailKey` is quiet, abort publishes no partial chunk, and every duplicate occurrence uses a revision-scoped ID from first exposure.

- [ ] **Step 5: Commit runtime row identity**

```bash
git add packages/materials/table/data/src/runtime-rows.ts packages/materials/table/data/src/runtime-rows.test.ts packages/materials/table/data/src/index.ts
git commit -m "feat(table-data): add lazy runtime detail identities"
```

## Task 10: Table Pagination Fragment Semantics

**Files:**
- Create: `packages/materials/table/data/src/pagination.ts`
- Test: `packages/materials/table/data/src/pagination.test.ts`
- Modify: `packages/materials/table/data/src/index.ts`

- [ ] **Step 1: Write failing table fragment tests**

```ts
// packages/materials/table/data/src/pagination.test.ts
import { describe, expect, it } from 'vitest'
import type { MaterialLayoutPlan } from '@easyink/core'
import type { TableLayoutPlanData } from '@easyink/material-table-kernel'
import {
  buildTablePaginationContract, createTableFragmentAdapter, selectTableFragmentUnits,
  tablePaginationUnitKey, withTablePagination,
} from './pagination'

describe('table pagination contract', () => {
  it('emits legal breaks only between atomic units and never repeats header/footer units', () => {
    const contract = buildTablePaginationContract({
      sourceNodeId: 'table-1', sourceInstanceKey: 'table-1', pageContentHeight: 100,
      headers: [{ id: 'header-1', height: 5 }, { id: 'header-2', height: 5 }],
      details: [{ id: 'detail-a' as never, height: 30 }, { id: 'detail-b' as never, height: 35 }],
      footers: [{ id: 'footer-1', height: 6 }, { id: 'footer-2', height: 6 }],
    })
    expect(contract.breakOpportunities.map(item => [item.blockOffset, item.penalty])).toEqual([[40, 0]])
    expect(selectTableFragmentUnits(contract, 0, 40).map(unit => unit.kind)).toEqual(['header', 'header', 'detail'])
    expect(selectTableFragmentUnits(contract, 40, 87).map(unit => unit.kind)).toEqual(['detail', 'footer', 'footer'])
    expect(contract.units.filter(unit => unit.kind === 'header')).toHaveLength(2)
    expect(contract.units.filter(unit => unit.kind === 'footer')).toHaveLength(2)
  })

  it('keeps an oversized detail whole and emits a layout diagnostic', () => {
    const contract = buildTablePaginationContract({
      sourceNodeId: 'table-1', sourceInstanceKey: 'table-1', pageContentHeight: 100, headers: [], footers: [],
      details: [{ id: 'detail-a' as never, height: 140 }],
    })
    expect(contract.units[0]).toMatchObject({ kind: 'detail', height: 140 })
    expect(contract.breakOpportunities).toEqual([])
    expect(contract.diagnostics).toEqual([expect.objectContaining({
      code: 'TABLE_DETAIL_PAGE_OVERFLOW', detail: expect.objectContaining({ runtimeRowId: 'detail-a' }),
    })])
  })

  it('diagnoses oversized hard-atomic header/detail and detail/footer groups', () => {
    const contract = buildTablePaginationContract({
      sourceNodeId: 'table-1', sourceInstanceKey: 'table-1', pageContentHeight: 100,
      headers: [{ id: 'header-1', height: 60 }],
      details: [{ id: 'detail-a' as never, height: 50 }, { id: 'detail-b' as never, height: 45 }],
      footers: [{ id: 'footer-1', height: 60 }],
    })
    expect(contract.diagnostics.map(item => item.code)).toEqual([
      'TABLE_HEADER_FIRST_DETAIL_PAGE_OVERFLOW', 'TABLE_LAST_DETAIL_FOOTER_PAGE_OVERFLOW',
    ])
    expect(contract.breakOpportunities.map(item => item.blockOffset)).toEqual([110])
  })

  it('implements MaterialFragmentAdapter without creating pages', () => {
    const contract = buildTablePaginationContract({
      sourceNodeId: 'table-1', sourceInstanceKey: 'table-1', pageContentHeight: 50,
      headers: [{ id: 'header-1', height: 10 }],
      details: [{ id: 'detail-a' as never, height: 30 }, { id: 'detail-b' as never, height: 35 }],
      footers: [{ id: 'footer-1', height: 12 }],
    })
    const base = layoutPlan()
    const plan = withTablePagination(base, contract)
    const fragment = createTableFragmentAdapter().createFragment({
      plan, startBlockOffset: 0, endBlockOffset: 40, availableHeight: 50, pageIndex: 0,
    })
    expect(fragment).toMatchObject({
      consumedRange: { startBlockOffset: 0, endBlockOffset: 40 },
      inlineSize: 100, blockSize: 40,
      renderPayload: { unitKeys: [
        tablePaginationUnitKey('header', 'header-1'),
        tablePaginationUnitKey('detail', 'detail-a'),
      ] },
    })
  })

  it('keeps band IDs and runtime detail IDs in disjoint encoded key spaces', () => {
    expect(tablePaginationUnitKey('header', 'same:id')).not.toBe(tablePaginationUnitKey('detail', 'same:id'))
    expect(tablePaginationUnitKey('detail', '"雪')).toMatch(/^[a-z0-9-]+$/i)
  })
})

function layoutPlan(): MaterialLayoutPlan<TableLayoutPlanData> {
  return {
    nodeId: 'table-1', instanceKey: 'table-1', nodeRevision: 1, constraintKey: '100:50:mm:horizontal-tb',
    borderBox: { x: 0, y: 0, width: 100, height: 87 },
    contentBox: { x: 0, y: 0, width: 100, height: 87 },
    slotBoxes: [], breakOpportunities: [], diagnostics: [],
    payload: {
      width: 100, height: 87, unit: 'mm', direction: 'ltr', cells: [], columnIds: ['column-1' as never],
      columnWidths: [100], rowHeights: [87], rows: [],
    },
  }
}
```

- [ ] **Step 2: Run the test and verify the adapter is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/data/src/pagination.test.ts`

Expected: FAIL with `Failed to load url ./pagination`.

- [ ] **Step 3: Emit core break opportunities and implement the core fragment adapter**

```ts
// packages/materials/table/data/src/pagination.ts
import type {
  LayoutPlanDiagnostic, MaterialBreakOpportunity, MaterialFragmentAdapter, MaterialLayoutPlan,
} from '@easyink/core'
import type { RuntimeRowId, TableLayoutPlanData } from '@easyink/material-table-kernel'
import { encodeTableOpaqueIdPart, freezeTableLayoutPlan } from '@easyink/material-table-kernel'

export interface TableBandMeasure { id: string, height: number }
export interface TableDetailMeasure { id: RuntimeRowId, height: number }
export interface TablePaginationUnit {
  key: string
  kind: 'header' | 'detail' | 'footer'
  blockOffset: number
  height: number
  bandId?: string
  runtimeRowId?: RuntimeRowId
}
export interface TablePaginationContract {
  units: TablePaginationUnit[]
  breakOpportunities: MaterialBreakOpportunity[]
  diagnostics: LayoutPlanDiagnostic[]
  height: number
  unitOffsets: number[]
}
export interface PaginatedTablePayload { layout: TableLayoutPlanData, pagination: TablePaginationContract }

export function tablePaginationUnitKey(kind: TablePaginationUnit['kind'], sourceId: string): string {
  return `unit-${encodeTableOpaqueIdPart(kind)}-${encodeTableOpaqueIdPart(sourceId)}`
}

export function buildTablePaginationContract(input: {
  sourceNodeId: string
  sourceInstanceKey: string
  pageContentHeight: number
  headers: TableBandMeasure[]
  details: TableDetailMeasure[]
  footers: TableBandMeasure[]
}): TablePaginationContract {
  const source = [
    ...input.headers.map(band => ({
      key: tablePaginationUnitKey('header', band.id), kind: 'header' as const, height: band.height, bandId: band.id,
    })),
    ...input.details.map(detail => ({
      key: tablePaginationUnitKey('detail', String(detail.id)), kind: 'detail' as const,
      height: detail.height, runtimeRowId: detail.id,
    })),
    ...input.footers.map(band => ({
      key: tablePaginationUnitKey('footer', band.id), kind: 'footer' as const, height: band.height, bandId: band.id,
    })),
  ]
  let blockOffset = 0
  const units = source.map(unit => {
    const result = { ...unit, blockOffset }
    blockOffset += unit.height
    return result
  })
  const breakOpportunities = units.slice(0, -1).flatMap((unit, index): MaterialBreakOpportunity[] => {
    const next = units[index + 1]!
    if (unit.kind !== 'detail' || next.kind !== 'detail') return []
    return [{
      id: `table-break:${unit.key}`,
      blockOffset: unit.blockOffset + unit.height,
      penalty: 0,
    }]
  })
  const detailDiagnostics: LayoutPlanDiagnostic[] = input.details
    .filter(detail => detail.height > input.pageContentHeight)
    .map(detail => ({
      code: 'TABLE_DETAIL_PAGE_OVERFLOW' as const,
      severity: 'warning' as const,
      message: `Detail row ${detail.id} exceeds an empty output page and remains atomic.`,
      instanceKey: input.sourceInstanceKey,
      nodeId: input.sourceNodeId,
      detail: { runtimeRowId: detail.id, height: detail.height, pageContentHeight: input.pageContentHeight },
    }))
  const firstDetail = input.details[0]
  const lastDetail = input.details.at(-1)
  const headerHeight = input.headers.reduce((sum, band) => sum + band.height, 0)
  const footerHeight = input.footers.reduce((sum, band) => sum + band.height, 0)
  const atomicDiagnostics: LayoutPlanDiagnostic[] = [
    ...(firstDetail && headerHeight > 0 && headerHeight + firstDetail.height > input.pageContentHeight ? [{
      code: 'TABLE_HEADER_FIRST_DETAIL_PAGE_OVERFLOW', severity: 'warning' as const,
      message: 'The header group and first detail row exceed an empty output page and remain atomic.',
      instanceKey: input.sourceInstanceKey, nodeId: input.sourceNodeId,
      detail: { runtimeRowId: firstDetail.id, height: headerHeight + firstDetail.height, pageContentHeight: input.pageContentHeight },
    }] : []),
    ...(lastDetail && footerHeight > 0 && lastDetail.height + footerHeight > input.pageContentHeight ? [{
      code: 'TABLE_LAST_DETAIL_FOOTER_PAGE_OVERFLOW', severity: 'warning' as const,
      message: 'The last detail row and footer group exceed an empty output page and remain atomic.',
      instanceKey: input.sourceInstanceKey, nodeId: input.sourceNodeId,
      detail: { runtimeRowId: lastDetail.id, height: lastDetail.height + footerHeight, pageContentHeight: input.pageContentHeight },
    }] : []),
  ]
  return {
    units, breakOpportunities, diagnostics: [...detailDiagnostics, ...atomicDiagnostics], height: blockOffset,
    unitOffsets: units.map(unit => unit.blockOffset),
  }
}

export function selectTableFragmentUnits(
  contract: TablePaginationContract,
  startBlockOffset: number,
  endBlockOffset: number,
): TablePaginationUnit[] {
  if (startBlockOffset < 0 || endBlockOffset <= startBlockOffset || endBlockOffset > contract.height)
    throw new Error('table fragment range is outside the measured table')
  const start = binarySearchExact(contract.unitOffsets, startBlockOffset)
  if (start < 0) throw new Error('table fragment start is not an atomic boundary')
  const units: TablePaginationUnit[] = []
  for (let index = start; index < contract.units.length; index++) {
    const unit = contract.units[index]!
    if (unit.blockOffset + unit.height > endBlockOffset) break
    units.push(unit)
  }
  const consumed = units.reduce((sum, unit) => sum + unit.height, 0)
  if (!units.length || units[0]!.blockOffset !== startBlockOffset || consumed !== endBlockOffset - startBlockOffset)
    throw new Error('table fragment range cuts through an atomic band or detail row')
  return units
}

function binarySearchExact(values: readonly number[], target: number): number {
  let low = 0
  let high = values.length - 1
  while (low <= high) {
    const mid = (low + high) >>> 1
    const value = values[mid]!
    if (value === target) return mid
    if (value < target) low = mid + 1
    else high = mid - 1
  }
  return -1
}

export function withTablePagination(
  plan: MaterialLayoutPlan<TableLayoutPlanData>,
  pagination: TablePaginationContract,
): MaterialLayoutPlan<PaginatedTablePayload> {
  if (!plan.payload) throw new Error('table layout payload is required')
  return freezeTableLayoutPlan({
    ...plan,
    breakOpportunities: pagination.breakOpportunities,
    diagnostics: [...plan.diagnostics, ...pagination.diagnostics],
    payload: { layout: plan.payload, pagination },
  })
}

export function createTableFragmentAdapter(): MaterialFragmentAdapter {
  return {
    createFragment(request) {
      const payload = request.plan.payload as PaginatedTablePayload | undefined
      if (!payload?.pagination) throw new Error('paginated table payload is required')
      const units = selectTableFragmentUnits(payload.pagination, request.startBlockOffset, request.endBlockOffset)
      return {
        inlineSize: request.plan.borderBox.width,
        blockSize: request.endBlockOffset - request.startBlockOffset,
        consumedRange: {
          startBlockOffset: request.startBlockOffset,
          endBlockOffset: request.endBlockOffset,
        },
        renderPayload: { unitKeys: units.map(unit => unit.key) },
        diagnostics: request.plan.diagnostics,
      }
    },
  }
}
```

The header group plus first detail and the last detail plus footer group are hard atomic boundaries: no break is published inside either group. If either combined unit exceeds an empty page, core places it once as overflow and diagnostics name the combined range; it never creates an orphan header/footer. Fragment lookup uses offset->unit and precomputed row/cell/edge slices, so each page visits `O(log N + fragment facts)`, not all table facts. The adapter returns only exact range, local size, payload, and diagnostics; core mints identity/source/final page box. Table code never creates pages, supplies coordinates/tokens, repeats visible headers, or reserves footer height on intermediate pages.

Add the export:

```ts
export * from './pagination'
```

- [ ] **Step 4: Run table pagination and global runtime integration tests**

Run: `pnpm exec vitest run --dom packages/materials/table/data/src/pagination.test.ts packages/core/src/pagination-engine.test.ts`

Expected: PASS with the table tests reporting `5 passed`; core alone chooses page breaks and owns page creation, while detail blocks remain indivisible and header/footer units appear once.

- [ ] **Step 5: Commit pagination semantics**

```bash
git add packages/materials/table/data/src/pagination.ts packages/materials/table/data/src/pagination.test.ts packages/materials/table/data/src/index.ts
git commit -m "feat(table-data): expose core pagination break contracts"
```

## Task 11: Stable Multi-Region Table Selection

**Files:**
- Create: `packages/materials/table/kernel/src/selection.ts`
- Test: `packages/materials/table/kernel/src/selection.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write failing normalization, navigation, and rebase tests**

```ts
// packages/materials/table/kernel/src/selection.test.ts
import { describe, expect, it } from 'vitest'
import { createSequentialTableIdentityAllocator, createTableModel } from './model'
import { TableTopologyEngine } from './topology-engine'
import {
  expandTableSelectionRegion, moveTableFocus, normalizeTableSelection, rebaseTableSelection,
} from './selection'

describe('table selection', () => {
  it('preserves multiple stable-id regions', () => {
    const table = createTableModel({ kind: 'static', columnCount: 3, rowCount: 3 })
    const rows = table.bands[0]!.rows
    const columns = table.columns
    const selection = normalizeTableSelection(table, {
      active: { rowId: rows[2]!.id, columnId: columns[2]!.id },
      regions: [
        { anchor: { rowId: rows[0]!.id, columnId: columns[0]!.id }, focus: { rowId: rows[1]!.id, columnId: columns[1]!.id } },
        { anchor: { rowId: rows[2]!.id, columnId: columns[2]!.id }, focus: { rowId: rows[2]!.id, columnId: columns[2]!.id } },
      ],
    })
    expect(selection.regions).toHaveLength(2)
  })

  it('skips an entire merged region during visual navigation', () => {
    const table = createTableModel({ kind: 'static', columnCount: 3, rowCount: 1 })
    const row = table.bands[0]!.rows[0]!
    const merged = TableTopologyEngine.merge(table, {
      rowIds: [row.id], columnIds: table.columns.slice(0, 2).map(column => column.id), anchorCellId: row.cells[0]!.id,
      identities: createSequentialTableIdentityAllocator('selection-merge'),
    })
    expect(moveTableFocus(merged, { rowId: row.id, columnId: table.columns[0]!.id }, 'inline-next', 'ltr')).toEqual({ rowId: row.id, columnId: table.columns[2]!.id })
  })

  it('rebases a region to the nearest surviving row after removal', () => {
    const table = createTableModel({ kind: 'static', columnCount: 1, rowCount: 3 })
    const [first, second, last] = table.bands[0]!.rows
    const selection = { active: { rowId: last!.id, columnId: table.columns[0]!.id }, regions: [{ anchor: { rowId: first!.id, columnId: table.columns[0]!.id }, focus: { rowId: last!.id, columnId: table.columns[0]!.id } }] }
    const result = TableTopologyEngine.removeRow(table, last!.id)
    const rebased = rebaseTableSelection(result.model, selection, result.rebase)
    expect(rebased.active.rowId).toBe(second!.id)
    expect(rebased.regions[0]!.anchor.rowId).toBe(first!.id)
    expect(rebased.regions[0]!.focus.rowId).toBe(second!.id)
  })

  it('canonicalizes a covered address to its merge anchor and closes selection coverage over the merge', () => {
    const source = createTableModel({ kind: 'static', columnCount: 3, rowCount: 3 })
    const rows = source.bands[0]!.rows
    const table = TableTopologyEngine.merge(source, {
      rowIds: rows.slice(1).map(row => row.id), columnIds: source.columns.slice(1).map(column => column.id),
      anchorCellId: rows[1]!.cells[1]!.id, identities: createSequentialTableIdentityAllocator('selection-merge'),
    })
    const covered = { rowId: rows[2]!.id, columnId: source.columns[2]!.id }
    const normalized = normalizeTableSelection(table, { active: covered, regions: [{ anchor: covered, focus: covered }] })
    expect(normalized.active).toEqual({ rowId: rows[1]!.id, columnId: source.columns[1]!.id })
    expect(expandTableSelectionRegion(table, normalized.regions[0]!)).toEqual({
      rowIds: rows.slice(1).map(row => row.id), columnIds: source.columns.slice(1).map(column => column.id),
    })
  })

  it('jumps across the full rowSpan during block navigation', () => {
    const source = createTableModel({ kind: 'static', columnCount: 1, rowCount: 3 })
    const rows = source.bands[0]!.rows
    const table = TableTopologyEngine.merge(source, {
      rowIds: rows.slice(0, 2).map(row => row.id), columnIds: [source.columns[0]!.id],
      anchorCellId: rows[0]!.cells[0]!.id, identities: createSequentialTableIdentityAllocator('selection-merge'),
    })
    expect(moveTableFocus(table, { rowId: rows[1]!.id, columnId: source.columns[0]!.id }, 'block-next', 'ltr'))
      .toEqual({ rowId: rows[2]!.id, columnId: source.columns[0]!.id })
  })
})
```

- [ ] **Step 2: Run the test and verify the selection module is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/selection.test.ts`

Expected: FAIL with `Failed to load url ./selection`.

- [ ] **Step 3: Implement stable table regions and navigation**

```ts
// packages/materials/table/kernel/src/selection.ts
import type { TableColumnId, TableModel, TableRowId } from './model'
import type { TableSelectionRebaseHint } from './topology-engine'

export interface TableCellAddress { rowId: TableRowId, columnId: TableColumnId }
export interface TableSelectionRegion { anchor: TableCellAddress, focus: TableCellAddress }
export interface TableSelectionPayload { active: TableCellAddress, regions: TableSelectionRegion[] }

function rows(table: TableModel) { return table.bands.flatMap(band => band.rows) }
function valid(table: TableModel, address: TableCellAddress) {
  return rows(table).some(row => row.id === address.rowId) && table.columns.some(column => column.id === address.columnId)
}

function cellAt(table: TableModel, address: TableCellAddress) {
  const row = rows(table).find(candidate => candidate.id === address.rowId)
  return row?.cells.find(cell => cell.columnId === address.columnId)
}

function canonicalAddress(table: TableModel, address: TableCellAddress): TableCellAddress {
  if (!valid(table, address)) throw new Error('table cell does not exist')
  const cell = cellAt(table, address)!
  const merge = table.merges.find(region => region.anchorCellId === cell.id || region.inactiveCellIds.includes(cell.id))
  if (!merge) return address
  const anchorRow = rows(table).find(row => row.cells.some(candidate => candidate.id === merge.anchorCellId))!
  const anchorCell = anchorRow.cells.find(candidate => candidate.id === merge.anchorCellId)!
  return { rowId: anchorRow.id, columnId: anchorCell.columnId }
}

export function normalizeTableSelection(table: TableModel, selection: TableSelectionPayload): TableSelectionPayload {
  if (!valid(table, selection.active)) throw new Error('active table cell does not exist')
  const active = canonicalAddress(table, selection.active)
  const regions = selection.regions
    .filter(region => valid(table, region.anchor) && valid(table, region.focus))
    .map(region => ({ anchor: canonicalAddress(table, region.anchor), focus: canonicalAddress(table, region.focus) }))
  return { active, regions: regions.length ? regions : [{ anchor: active, focus: active }] }
}

export function expandTableSelectionRegion(table: TableModel, region: TableSelectionRegion): {
  rowIds: TableRowId[]
  columnIds: TableColumnId[]
} {
  const orderedRows = rows(table)
  const rowIndex = (id: TableRowId) => orderedRows.findIndex(row => row.id === id)
  const columnIndex = (id: TableColumnId) => table.columns.findIndex(column => column.id === id)
  let rowStart = Math.min(rowIndex(region.anchor.rowId), rowIndex(region.focus.rowId))
  let rowEnd = Math.max(rowIndex(region.anchor.rowId), rowIndex(region.focus.rowId))
  let columnStart = Math.min(columnIndex(region.anchor.columnId), columnIndex(region.focus.columnId))
  let columnEnd = Math.max(columnIndex(region.anchor.columnId), columnIndex(region.focus.columnId))
  let changed = true
  while (changed) {
    changed = false
    for (const merge of table.merges) {
      const mergeRows = merge.rowIds.map(rowIndex)
      const mergeColumns = merge.columnIds.map(columnIndex)
      const next = {
        rowStart: Math.min(...mergeRows), rowEnd: Math.max(...mergeRows),
        columnStart: Math.min(...mergeColumns), columnEnd: Math.max(...mergeColumns),
      }
      const intersects = next.rowStart <= rowEnd && next.rowEnd >= rowStart
        && next.columnStart <= columnEnd && next.columnEnd >= columnStart
      if (!intersects) continue
      const expanded = {
        rowStart: Math.min(rowStart, next.rowStart), rowEnd: Math.max(rowEnd, next.rowEnd),
        columnStart: Math.min(columnStart, next.columnStart), columnEnd: Math.max(columnEnd, next.columnEnd),
      }
      changed = expanded.rowStart !== rowStart || expanded.rowEnd !== rowEnd
        || expanded.columnStart !== columnStart || expanded.columnEnd !== columnEnd
      ;({ rowStart, rowEnd, columnStart, columnEnd } = expanded)
    }
  }
  return {
    rowIds: orderedRows.slice(rowStart, rowEnd + 1).map(row => row.id),
    columnIds: table.columns.slice(columnStart, columnEnd + 1).map(column => column.id),
  }
}

export function rebaseTableSelection(table: TableModel, selection: TableSelectionPayload, hint: TableSelectionRebaseHint): TableSelectionPayload {
  const survivingRows = new Set(rows(table).map(row => row.id))
  const survivingColumns = new Set(table.columns.map(column => column.id))
  const rebaseAddress = (address: TableCellAddress): TableCellAddress => {
    const rowId = survivingRows.has(address.rowId)
      ? address.rowId
      : hint.rows.find(item => item.removedId === address.rowId)?.nearestSurvivorId
    const columnId = survivingColumns.has(address.columnId)
      ? address.columnId
      : hint.columns.find(item => item.removedId === address.columnId)?.nearestSurvivorId
    if (!rowId || !columnId || !survivingRows.has(rowId) || !survivingColumns.has(columnId))
      throw new Error('selection rebase hint has no surviving stable-ID neighbor')
    return { rowId, columnId }
  }
  const active = rebaseAddress(selection.active)
  const regions = selection.regions.map(region => ({ anchor: rebaseAddress(region.anchor), focus: rebaseAddress(region.focus) }))
  return normalizeTableSelection(table, { active, regions })
}

export function moveTableFocus(
  table: TableModel,
  from: TableCellAddress,
  direction: 'inline-next' | 'inline-previous' | 'block-next' | 'block-previous',
  writingDirection: 'ltr' | 'rtl',
): TableCellAddress {
  const orderedRows = rows(table)
  const canonical = canonicalAddress(table, from)
  const rowIndex = orderedRows.findIndex(row => row.id === canonical.rowId)
  const columnIndex = table.columns.findIndex(column => column.id === canonical.columnId)
  const inlineDelta = (direction === 'inline-next' ? 1 : -1) * (writingDirection === 'rtl' ? -1 : 1)
  let nextRow = rowIndex + (direction === 'block-next' ? 1 : direction === 'block-previous' ? -1 : 0)
  let nextColumn = columnIndex + (direction.startsWith('inline') ? inlineDelta : 0)
  nextRow = Math.max(0, Math.min(nextRow, orderedRows.length - 1))
  nextColumn = Math.max(0, Math.min(nextColumn, table.columns.length - 1))
  const currentCell = cellAt(table, canonical)!
  const merge = table.merges.find(region => region.anchorCellId === currentCell.id)
  if (merge && direction.startsWith('inline')) {
    const indices = merge.columnIds.map(id => table.columns.findIndex(column => column.id === id))
    nextColumn = direction === 'inline-next'
      ? (writingDirection === 'ltr' ? Math.max(...indices) + 1 : Math.min(...indices) - 1)
      : (writingDirection === 'ltr' ? Math.min(...indices) - 1 : Math.max(...indices) + 1)
    nextColumn = Math.max(0, Math.min(nextColumn, table.columns.length - 1))
  }
  if (merge && direction.startsWith('block')) {
    const indices = merge.rowIds.map(id => orderedRows.findIndex(row => row.id === id))
    nextRow = direction === 'block-next' ? Math.max(...indices) + 1 : Math.min(...indices) - 1
    nextRow = Math.max(0, Math.min(nextRow, orderedRows.length - 1))
  }
  return { rowId: orderedRows[nextRow]!.id, columnId: table.columns[nextColumn]!.id }
}
```

Add the export:

```ts
export * from './selection'
```

- [ ] **Step 4: Run the selection tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/selection.test.ts`

Expected: PASS with `3 passed`.

- [ ] **Step 5: Commit stable multi-region selection**

```bash
git add packages/materials/table/kernel/src/selection.ts packages/materials/table/kernel/src/selection.test.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): add stable multi-region selection"
```

## Task 12: Focus, Keyboard, And IME State Machine

**Files:**
- Create: `packages/materials/table/kernel/src/editing/focus-controller.ts`
- Test: `packages/materials/table/kernel/src/editing/focus-controller.test.ts`
- Modify: `packages/materials/table/kernel/src/editing/index.ts`

- [ ] **Step 1: Write failing composition and keyboard tests**

```ts
// packages/materials/table/kernel/src/editing/focus-controller.test.ts
import { describe, expect, it } from 'vitest'
import { createTableFocusController } from './focus-controller'

describe('table focus controller', () => {
  it('does not commit Enter while an IME composition is active', () => {
    const controller = createTableFocusController()
    controller.dispatch({ kind: 'enter-editor' })
    controller.dispatch({ kind: 'composition-start' })
    expect(controller.dispatch({ kind: 'key', key: 'Enter', shiftKey: false })).toEqual([])
    controller.dispatch({ kind: 'composition-end' })
    expect(controller.dispatch({ kind: 'key', key: 'Enter', shiftKey: false })).toEqual([{ kind: 'commit-editor' }, { kind: 'move', direction: 'block-next' }])
  })

  it('cancels the editor before requesting a session pop', () => {
    const controller = createTableFocusController()
    controller.dispatch({ kind: 'enter-editor' })
    expect(controller.dispatch({ kind: 'key', key: 'Escape', shiftKey: false })).toEqual([{ kind: 'cancel-editor' }])
    expect(controller.dispatch({ kind: 'key', key: 'Escape', shiftKey: false })).toEqual([{ kind: 'pop-session' }])
  })

  it('commits and moves on Tab without requesting row insertion', () => {
    const controller = createTableFocusController()
    controller.dispatch({ kind: 'enter-editor' })
    expect(controller.dispatch({ kind: 'key', key: 'Tab', shiftKey: false })).toEqual([{ kind: 'commit-editor' }, { kind: 'move', direction: 'inline-next' }])
  })

  it.each(['Enter', 'F2'])('enters the editor from grid mode with %s', (key) => {
    const controller = createTableFocusController()
    expect(controller.dispatch({ kind: 'key', key, shiftKey: false })).toEqual([{ kind: 'open-editor' }])
  })

  it('inserts a newline on Shift+Enter without leaving the editor', () => {
    const controller = createTableFocusController()
    controller.dispatch({ kind: 'enter-editor' })
    expect(controller.dispatch({ kind: 'key', key: 'Enter', shiftKey: true })).toEqual([{ kind: 'insert-newline' }])
    expect(controller.dispatch({ kind: 'key', key: 'Enter', shiftKey: false })).toEqual([{ kind: 'commit-editor' }, { kind: 'move', direction: 'block-next' }])
  })

  it.each([
    ['ArrowLeft', {}, { kind: 'move', direction: 'physical-left' }],
    ['ArrowDown', { shiftKey: true }, { kind: 'extend', direction: 'block-next' }],
    ['Home', {}, { kind: 'move-boundary', boundary: 'row-start' }],
    ['End', { ctrlKey: true }, { kind: 'move-boundary', boundary: 'table-end' }],
    ['PageDown', {}, { kind: 'move-page', direction: 'next' }],
    ['a', { ctrlKey: true }, { kind: 'select-all' }],
    ['Backspace', {}, { kind: 'clear-selection' }],
    ['c', { ctrlKey: true }, { kind: 'copy' }],
    ['v', { ctrlKey: true }, { kind: 'paste' }],
  ] as const)('maps grid key %s through the complete keyboard matrix', (key, modifiers, effect) => {
    const controller = createTableFocusController({ direction: 'rtl' })
    expect(controller.dispatch({ kind: 'key', key, shiftKey: false, ctrlKey: false, metaKey: false, ...modifiers })).toContainEqual(effect)
  })
})
```

- [ ] **Step 2: Run the test and verify the controller is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/editing/focus-controller.test.ts`

Expected: FAIL with `Failed to load url ./focus-controller`.

- [ ] **Step 3: Implement the pure focus state machine**

```ts
// packages/materials/table/kernel/src/editing/focus-controller.ts
export type TableFocusEvent
  = | { kind: 'enter-editor' }
    | { kind: 'composition-start' }
    | { kind: 'composition-end' }
    | { kind: 'key', key: string, shiftKey: boolean, ctrlKey?: boolean, metaKey?: boolean }

export type TableFocusEffect
  = | { kind: 'open-editor' }
    | { kind: 'insert-newline' }
    | { kind: 'commit-editor' }
    | { kind: 'cancel-editor' }
    | { kind: 'pop-session' }
    | { kind: 'move', direction: 'inline-next' | 'inline-previous' | 'block-next' | 'physical-left' | 'physical-right' }
    | { kind: 'extend', direction: 'physical-left' | 'physical-right' | 'block-next' | 'block-previous' }
    | { kind: 'move-boundary', boundary: 'row-start' | 'row-end' | 'table-start' | 'table-end' }
    | { kind: 'move-page', direction: 'previous' | 'next' }
    | { kind: 'select-all' | 'clear-selection' | 'copy' | 'paste' }

export function createTableFocusController(options: { direction?: 'ltr' | 'rtl' } = {}) {
  let mode: 'grid' | 'editor' = 'grid'
  let composing = false
  return {
    dispatch(event: TableFocusEvent): TableFocusEffect[] {
      if (event.kind === 'enter-editor') { mode = 'editor'; return [] }
      if (event.kind === 'composition-start') { composing = true; return [] }
      if (event.kind === 'composition-end') { composing = false; return [] }
      if (event.kind !== 'key' || composing) return []
      if (mode === 'grid' && (event.key === 'Enter' || event.key === 'F2')) {
        mode = 'editor'
        return [{ kind: 'open-editor' }]
      }
      if (event.key === 'Escape') {
        if (mode === 'editor') { mode = 'grid'; return [{ kind: 'cancel-editor' }] }
        return [{ kind: 'pop-session' }]
      }
      if (event.key === 'Tab') {
        const effects: TableFocusEffect[] = mode === 'editor' ? [{ kind: 'commit-editor' }] : []
        mode = 'grid'
        return [...effects, { kind: 'move', direction: event.shiftKey ? 'inline-previous' : 'inline-next' }]
      }
      if (event.key === 'Enter' && mode === 'editor') {
        if (event.shiftKey) return [{ kind: 'insert-newline' }]
        mode = 'grid'
        return [{ kind: 'commit-editor' }, { kind: 'move', direction: 'block-next' }]
      }
      return []
    },
  }
}
```

Implement the remaining grid-mode matrix before the final `return []`: Arrow keys move physically while selection/navigation converts through table direction; Shift extends the canonical merge-closed region; Home/End target row boundaries and Ctrl/Cmd variants target table boundaries; PageUp/PageDown use the spatial index viewport; Ctrl/Cmd+A selects all active cells; Delete/Backspace clears through one transaction; copy/paste emit intents only. Editor mode leaves ordinary arrows/Home/End/copy/paste to the text control, while Escape/Tab/Enter and IME precedence remain as above. The Designer grid owns one focusable root with roving `tabindex`/`aria-activedescendant`; virtualization pins the active cell and restores focus by stable ID after layout/topology changes. Add LTR/RTL, covered-cell-to-anchor, rowSpan navigation, merge-closure, and focus-restoration assertions.

Add to `packages/materials/table/kernel/src/editing/index.ts`:

```ts
export * from './focus-controller'
```

- [ ] **Step 4: Run the focus tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/editing/focus-controller.test.ts`

Expected: PASS with `6 passed` because `it.each` expands both grid-entry keys.

- [ ] **Step 5: Commit keyboard and IME semantics**

```bash
git add packages/materials/table/kernel/src/editing/focus-controller.ts packages/materials/table/kernel/src/editing/focus-controller.test.ts packages/materials/table/kernel/src/editing/index.ts
git commit -m "feat(table): add accessible focus and IME controller"
```

## Task 13: Table Editing Adapter Over Document Transactions

**Files:**
- Create: `packages/materials/table/kernel/src/editing/topology-index.ts`
- Test: `packages/materials/table/kernel/src/editing/topology-index.test.ts`
- Create: `packages/materials/table/kernel/src/editing/table-editing-adapter.ts`
- Test: `packages/materials/table/kernel/src/editing/table-editing-adapter.test.ts`
- Create: `packages/materials/table/kernel/src/editing/table-contextual-properties.ts`
- Test: `packages/materials/table/kernel/src/editing/table-contextual-properties.test.ts`
- Modify: `packages/materials/table/kernel/src/editing/index.ts`
- Modify: `packages/materials/table/kernel/src/editing/cell-decoration.ts`

- [ ] **Step 1: Write failing transaction-boundary tests**

```ts
// packages/materials/table/kernel/src/editing/table-editing-adapter.test.ts
import { describe, expect, it, vi } from 'vitest'
import { deepClone } from '@easyink/shared'
import { createSequentialTableIdentityAllocator, createTableModel } from '../model'
import { createTableEditingAdapter } from './table-editing-adapter'

describe('table editing adapter', () => {
  const topologyHost = () => ({
    identities: createSequentialTableIdentityAllocator('transaction'), topologyRevision: () => 1,
  })
  it('updates only a text fallback, preserves its binding port, and carries a stable selection hint', () => {
    const table = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const cell = table.bands[0]!.rows[0]!.cells[0]!
    cell.content = { kind: 'text', text: 'fallback', bindingPort: 'value' }
    const node = { model: table, bindings: { value: { sourceId: 'source', fieldPath: 'value' } }, slots: {} }
    const engine = { run: vi.fn((_id: string, mutate: (draft: typeof node) => void) => mutate(node)) }
    const onSelectionHint = vi.fn()
    const adapter = createTableEditingAdapter({
      ...topologyHost(), nodeId: 'table-1', engine: engine as never,
      selectionLineage: 'selection-1', onSelectionHint,
    })
    adapter.updateText(cell.id, 'hello')
    expect(engine.run).toHaveBeenCalledTimes(1)
    expect(engine.run.mock.calls[0]![2]).toMatchObject({
      label: 'Update table cell text', operation: { kind: 'table.cell.text', targetIds: ['node:table-1', `table.cell:${cell.id}`] },
    })
    expect(node.model.bands[0]!.rows[0]!.cells[0]!.content)
      .toEqual({ kind: 'text', text: 'hello', bindingPort: 'value' })
    expect(onSelectionHint).toHaveBeenCalledWith({ activeCellId: cell.id })
  })

  it('rejects text edits on materials cells and clears bindings only through a separate atomic action', () => {
    const table = createTableModel({ kind: 'data', columnCount: 2, rowCount: 1 })
    const [text, hosted] = table.bands[0]!.rows[0]!.cells
    text!.content = { kind: 'text', text: 'fallback', bindingPort: 'cell-value' }
    hosted!.content = { kind: 'materials', slotId: `cell:${hosted!.id}` }
    table.data = { collectionPort: 'records', detailKeyPort: 'record-key' }
    const node = {
      model: table, slots: { [`cell:${hosted!.id}`]: [] },
      bindings: {
        'cell-value': { sourceId: 'source', fieldPath: 'value' },
        records: { sourceId: 'source', fieldPath: 'records' },
        'record-key': { sourceId: 'source', fieldPath: 'id' },
      },
    }
    const engine = draftEngine(node)
    const adapter = createTableEditingAdapter({
      ...topologyHost(),
      nodeId: 'table-1', engine: engine as never, selectionLineage: 'selection-1', onSelectionHint: vi.fn(),
    })
    expect(() => adapter.updateText(hosted!.id, 'invalid')).toThrow(/text cell/)
    adapter.clearCellBinding(text!.id)
    expect(text!.content).toEqual({ kind: 'text', text: 'fallback' })
    expect(node.bindings).toEqual({
      records: expect.anything(), 'record-key': expect.anything(),
    })
  })

  it('routes live property changes through PreviewTransaction instead of committed history', () => {
    const table = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const node = { model: table }
    const preview = { replaceNode: vi.fn((_id: string, _paths: readonly string[], mutate: (draft: typeof node) => void) => mutate(node)) }
    const adapter = createTableEditingAdapter({
      ...topologyHost(),
      nodeId: 'table-1', engine: { run: vi.fn() } as never, selectionLineage: 'selection-1', preview: preview as never,
      onSelectionHint: vi.fn(),
    })
    adapter.previewCellStyle(table.bands[0]!.rows[0]!.cells[0]!.id, { background: '#f00' })
    expect(preview.replaceNode).toHaveBeenCalledWith(
      'table-1', ['/model/bands/0/rows/0/cells/0/style'], expect.any(Function),
    )
    expect(node.model.bands[0]!.rows[0]!.cells[0]!.style).toMatchObject({ background: '#f00' })
  })

  it('uses the warmed topology index for near-O(1) edits and preserves untouched branches', () => {
    const table = createTableModel({ kind: 'static', columnCount: 20, rowCount: 100 })
    const untouched = table.bands[0]!.rows[99]!
    const visits = vi.fn()
    const adapter = createTableEditingAdapter({
      ...topologyHost(),
      nodeId: 'table-1', engine: draftEngine({ model: table }) as never,
      selectionLineage: 'selection-1', onSelectionHint: vi.fn(), onIndexVisit: visits,
    })
    const cell = table.bands[0]!.rows[0]!.cells[0]!
    adapter.primeTopologyIndex(table)
    visits.mockClear()
    adapter.updateText(cell.id, 'indexed')
    expect(visits).toHaveBeenCalledTimes(1)
    expect(table.bands[0]!.rows[99]).toBe(untouched)
  })

  it('rejects structural deletion of populated slots without an explicit disposition', () => {
    const table = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const removedCell = table.bands[0]!.rows[0]!.cells[1]!
    removedCell.content = { kind: 'materials', slotId: `cell:${removedCell.id}` }
    const node = { model: table, slots: { [`cell:${removedCell.id}`]: [{ id: 'child' }] }, bindings: {} }
    const adapter = createTableEditingAdapter({
      ...topologyHost(),
      nodeId: 'table-1', engine: draftEngine(node) as never,
      selectionLineage: 'selection-1', onSelectionHint: vi.fn(),
    })
    expect(() => adapter.removeColumn(table.columns[1]!.id)).toThrow('slot disposition required')
    expect(node.model).toBe(table)
  })

  it('keeps shared bindings, deletes explicitly disposed slots, and undo restores the exact envelope', () => {
    const table = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const [kept, removed] = table.bands[0]!.rows[0]!.cells
    kept!.content = { kind: 'text', text: '', bindingPort: 'shared' }
    removed!.content = { kind: 'materials', slotId: `cell:${removed!.id}` }
    const node = {
      model: table, slots: { [`cell:${removed!.id}`]: [{ id: 'child' }] },
      bindings: { shared: { sourceId: 'data', fieldPath: 'value' } },
    }
    const before = deepClone(node)
    const engine = draftEngine(node)
    const adapter = createTableEditingAdapter({
      ...topologyHost(),
      nodeId: 'table-1', engine: engine as never, selectionLineage: 'selection-1', onSelectionHint: vi.fn(),
    })
    adapter.removeColumn(table.columns[1]!.id, { kind: 'delete' })
    expect(node.bindings.shared).toBeDefined()
    expect(node.slots).toEqual({})
    engine.undo()
    expect(node).toEqual(before)
  })
})

function draftEngine<T extends object>(node: T) {
  const history: T[] = []
  return {
    run(_id: string, mutate: (draft: T) => void) {
      history.push(deepClone(node))
      mutate(node)
    },
    undo() {
      const previous = history.pop()!
      for (const key of Object.keys(node)) delete (node as Record<string, unknown>)[key]
      Object.assign(node, previous)
    },
  }
}
```

- [ ] **Step 2: Run the test and verify the adapter is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/editing/topology-index.test.ts packages/materials/table/kernel/src/editing/table-editing-adapter.test.ts`

Expected: FAIL with `Failed to load url ./table-editing-adapter`.

- [ ] **Step 3: Implement table intents as common change-set inputs**

```ts
// packages/materials/table/kernel/src/editing/topology-index.ts
import type { TableCellId, TableModel } from '../model'

export interface TableCellPath { band: number, row: number, cell: number }

export class TableTopologyIndex {
  private readonly cells = new Map<TableCellId, TableCellPath>()

  constructor(model: TableModel, visit: (id: string) => void = () => {}) {
    model.bands.forEach((band, bandIndex) => band.rows.forEach((row, rowIndex) =>
      row.cells.forEach((cell, cellIndex) => {
        visit(cell.id)
        this.cells.set(cell.id, { band: bandIndex, row: rowIndex, cell: cellIndex })
      })))
  }

  cell(id: TableCellId): TableCellPath {
    const path = this.cells.get(id)
    if (!path) throw new Error(`cell not found: ${id}`)
    return path
  }
}

export class TableTopologyIndexCache {
  private entry?: { revision: number, index: TableTopologyIndex }

  get(model: TableModel, topologyRevision: number, visit?: (id: string) => void): TableTopologyIndex {
    if (this.entry?.revision !== topologyRevision)
      this.entry = { revision: topologyRevision, index: new TableTopologyIndex(model, visit) }
    return this.entry.index
  }

  invalidate(): void { this.entry = undefined }
}
```

```ts
// packages/materials/table/kernel/src/editing/table-editing-adapter.ts
import type { DocumentChangeSet, DocumentTransactionEngine, PreviewTransaction, SlotReparentPlan } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableCellId, TableColumnId, TableIdentityAllocator, TableModel, TableStyle } from '../model'
import type { TableTopologyDelta } from '../topology-engine'
import { applyTableTopologyDelta, TableTopologyEngine } from '../topology-engine'
import { TableTopologyIndexCache } from './topology-index'

export function createTableEditingAdapter(input: {
  nodeId: string
  engine: Pick<DocumentTransactionEngine, 'run' | 'transact' | 'store'>
  preview?: Pick<PreviewTransaction, 'replaceNode'>
  selectionLineage: string
  identities: TableIdentityAllocator
  topologyRevision: () => number
  onSelectionHint: (hint: { activeCellId: TableCellId }) => void
  onIndexVisit?: (id: string) => void
}) {
  const indexes = new TableTopologyIndexCache()
  const mutateCell = (node: MaterialNode, cellId: TableCellId, mutate: (cell: TableModel['bands'][number]['rows'][number]['cells'][number]) => void) => {
    const model = node.model as unknown as TableModel
    const path = indexes.get(model, input.topologyRevision(), input.onIndexVisit).cell(cellId)
    input.onIndexVisit?.(cellId)
    const cell = model.bands[path.band]!.rows[path.row]!.cells[path.cell]!
    mutate(cell)
  }
  const applyTopology = (
    node: MaterialNode,
    delta: TableTopologyDelta,
    disposition?: { kind: 'delete' } | {
      kind: 'relocate'
      moves: readonly { childNodeId: string, targetOwnerNodeId: string, targetSlot: string, plan: SlotReparentPlan }[]
    },
  ) => {
    const populated = delta.effects.releasedSlotIds.filter(slot => (node.slots[slot]?.length ?? 0) > 0)
    if (populated.length && !disposition) throw new Error('slot disposition required before structural deletion')
    if (disposition?.kind === 'relocate') {
      const released = new Set(delta.effects.releasedSlotIds)
      if (disposition.moves.some(move => move.targetOwnerNodeId === input.nodeId && released.has(move.targetSlot)))
        throw new Error('relocation target is released by the same topology delta')
      const expectedChildren = new Set(populated.flatMap(slot => node.slots[slot]!.map(child => child.id)))
      if (disposition.moves.length !== expectedChildren.size
        || disposition.moves.some(move => !expectedChildren.delete(move.childNodeId)) || expectedChildren.size)
        throw new Error('relocation plans must cover every released child exactly once')
    }
    applyTableTopologyDelta(node.model as unknown as TableModel, delta, input.topologyRevision())
    for (const slot of delta.effects.releasedSlotIds) delete node.slots[slot]
    const stillReferenced = referencedBindingPorts(node.model as unknown as TableModel)
    for (const port of delta.effects.releasedBindingPorts)
      if (!stillReferenced.has(port)) delete node.bindings[port]
  }
  return {
    primeTopologyIndex(model: TableModel) {
      indexes.get(model, input.topologyRevision(), input.onIndexVisit)
    },
    acceptCommittedChangeSet(changeSet: DocumentChangeSet) {
      if (changeSet.operation.targetIds.includes(`node:${input.nodeId}`)
        && changeSet.operation.fieldPaths.some(path => path.startsWith('/model/columns')
          || path.startsWith('/model/bands') || path.startsWith('/model/merges')))
        indexes.invalidate()
    },
    updateText(cellId: TableCellId, text: string) {
      input.engine.run(input.nodeId, node => mutateCell(node, cellId, (cell) => {
        if (cell.content.kind !== 'text') throw new Error('table text update requires a text cell')
        cell.content = { ...cell.content, text }
      }), {
        label: 'Update table cell text',
        operation: {
          kind: 'table.cell.text', sessionPath: [], targetIds: [`node:${input.nodeId}`, `table.cell:${cellId}`],
          fieldPaths: ['/model/bands'], selectionLineage: input.selectionLineage, structural: false,
        },
      })
      input.onSelectionHint({ activeCellId: cellId })
    },
    clearCellBinding(cellId: TableCellId) {
      input.engine.run(input.nodeId, (node) => {
        let released: string | undefined
        mutateCell(node, cellId, (cell) => {
          if (cell.content.kind !== 'text') throw new Error('table binding clear requires a text cell')
          released = cell.content.bindingPort
          if (released) cell.content = { kind: 'text', text: cell.content.text }
        })
        if (released && !referencedBindingPorts(node.model as unknown as TableModel).has(released))
          delete node.bindings[released]
      }, {
        label: 'Clear table cell binding',
        operation: {
          kind: 'table.cell.binding.clear', sessionPath: [],
          targetIds: [`node:${input.nodeId}`, `table.cell:${cellId}`],
          fieldPaths: ['/model/bands', '/bindings'], selectionLineage: input.selectionLineage, structural: false,
        },
      })
    },
    previewCellStyle(cellId: TableCellId, style: TableStyle) {
      if (!input.preview) throw new Error('preview transaction is unavailable')
      const model = input.engine.store.committedIndex.getNode(input.nodeId)!.model as unknown as TableModel
      const path = indexes.get(model, input.topologyRevision()).cell(cellId)
      input.preview.replaceNode(input.nodeId, [
        `/model/bands/${path.band}/rows/${path.row}/cells/${path.cell}/style`,
      ], node => mutateCell(node, cellId, cell => { cell.style = { ...cell.style, ...style } }))
    },
    removeColumn(
      columnId: TableColumnId,
      disposition?: { kind: 'delete' } | {
        kind: 'relocate'
        moves: readonly { childNodeId: string, targetOwnerNodeId: string, targetSlot: string, plan: SlotReparentPlan }[]
      },
    ) {
      let hint: TableTopologyDelta['rebase'] | undefined
      input.engine.run(input.nodeId, (node) => {
        const delta = TableTopologyEngine.planRemoveColumn(node.model as unknown as TableModel, {
          columnId, topologyRevision: input.topologyRevision(),
        })
        applyTopology(node, delta, disposition)
        hint = delta.rebase
      }, {
        label: 'Remove table column',
        operation: {
          kind: 'table.column.remove', sessionPath: [],
          targetIds: [`node:${input.nodeId}`, `table.column:${columnId}`],
          fieldPaths: ['/model/columns', '/model/bands', '/model/merges', '/slots', '/bindings'],
          selectionLineage: input.selectionLineage, structural: true,
        },
      })
      return hint!
    },
  }
}

function referencedBindingPorts(model: TableModel): Set<string> {
  return new Set([
    ...model.bands.flatMap(band => band.rows.flatMap(row => row.cells.flatMap(cell =>
      cell.content.kind === 'text' && cell.content.bindingPort ? [cell.content.bindingPort] : []))),
    ...(model.data ? [model.data.collectionPort] : []),
    ...(model.data?.detailKeyPort ? [model.data.detailKeyPort] : []),
  ])
}
```

Implement `topologyOperation()` with the same stable operation descriptor fields shown by `updateText`. Add `insertColumn/removeColumn/reorderColumn` and band-scoped `insertRow/removeRow/reorderRow` recipes around the corresponding topology result; every Designer toolbar/context-menu handler calls these recipes rather than the kernel directly. The recipe validates every populated released slot before writing the draft, applies model/slot/binding changes once, returns the stable selection rebase hint only after `engine.run` succeeds, and relies on transaction undo to restore the exact prior envelope. Replace textarea handlers in `cell-decoration.ts` with the focus-controller effects and adapter calls; add `onCompositionstart` and `onCompositionend`, and remove direct blur-to-command dispatch. Selection remains local UI state and is published only after `engine.run` returns successfully. A non-structural edit mutates only its indexed draft path; it never deep-clones the model or rebuilds the topology index.

```ts
// packages/materials/table/kernel/src/editing/table-contextual-properties.ts
export const tableContextualProperties: MaterialContextualPropertyProvider = ({ node, selection }) => {
  const selected = decodeAndCanonicalizeTableSelection(node.model as unknown as TableModel, selection)
  const index = TableTopologyIndex.build(node.model as unknown as TableModel)
  const cellPaths = selected.cellIds.map(cellId => index.cell(cellId))
  return Object.freeze({
    contextKey: `table-cells:${selected.cellIds.join(',')}`,
    descriptors: createCellStyleDescriptors(cellPaths),
    values: readMixedCellStyleValues(node.model as unknown as TableModel, cellPaths),
  })
}
```

Create equivalent stable accessors for active row, column, and band contexts. Each accessor resolves stable IDs against the current topology revision, lists every exact node-relative JSON Pointer it may change, and writes only those paths; multi-selection reports `{kind:'mixed'}` until a value is applied. The provider receives no transaction/store/UI capability. Tests route its descriptors through the generic `PropertyPreviewController`, cover mixed values, preview/cancel/commit/undo, selection lineage, virtualized cells, stale topology cancellation, and patch scope. No table-specific property overlay or writer remains.

Add the export:

```ts
export * from './table-editing-adapter'
```

- [ ] **Step 4: Run adapter and existing cell editing tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/editing/topology-index.test.ts packages/materials/table/kernel/src/editing/table-editing-adapter.test.ts packages/materials/table/kernel/src/editing/table-contextual-properties.test.ts packages/materials/table/kernel/src/editing/behaviors.test.ts`

Expected: PASS; one text edit produces one committed history entry and preview events produce none.

- [ ] **Step 5: Commit transaction-backed editing**

```bash
git add packages/materials/table/kernel/src/editing/topology-index.ts packages/materials/table/kernel/src/editing/topology-index.test.ts packages/materials/table/kernel/src/editing/table-editing-adapter.ts packages/materials/table/kernel/src/editing/table-editing-adapter.test.ts packages/materials/table/kernel/src/editing/table-contextual-properties.ts packages/materials/table/kernel/src/editing/table-contextual-properties.test.ts packages/materials/table/kernel/src/editing/cell-decoration.ts packages/materials/table/kernel/src/editing/behaviors.test.ts packages/materials/table/kernel/src/editing/index.ts
git commit -m "refactor(table): route cell edits through document transactions"
```

## Task 14: Clipboard Interchange Without Implicit Topology Changes

**Files:**
- Create: `packages/materials/table/kernel/src/clipboard.ts`
- Test: `packages/materials/table/kernel/src/clipboard.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write failing internal and external clipboard tests**

```ts
// packages/materials/table/kernel/src/clipboard.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { MaterialNode } from '@easyink/schema'
import { createTableModel } from './model'
import {
  applyInternalTablePaste, decodeExternalTableText, decodeInternalTableClipboard, encodeTableClipboard,
  pasteTableMatrix, planInternalTablePaste,
} from './clipboard'

const mocks = vi.hoisted(() => ({ cloneMaterialGraph: vi.fn() }))
vi.mock('@easyink/core', async importOriginal => ({
  ...await importOriginal<typeof import('@easyink/core')>(),
  cloneMaterialGraph: mocks.cloneMaterialGraph,
}))

describe('table clipboard', () => {
  it('writes every internal region while HTML and TSV expose the active region', () => {
    const encoded = encodeTableClipboard({ version: 1, regions: [
      { matrix: [[{ content: { kind: 'text', text: '<one>' }, style: { background: '#fff' } }]] },
      { matrix: [[{ content: { kind: 'text', text: 'two' } }]] },
    ] })
    expect(JSON.parse(encoded.internal)).toMatchObject({ version: 1, regions: [{}, {}] })
    expect(encoded.tsv).toBe('<one>')
    expect(encoded.html).toContain('&lt;one&gt;')
  })

  it('clones hosted roots from all regions in one identity-aware graph operation', () => {
    const payload = { version: 1 as const, regions: [
      { matrix: [[{ content: { kind: 'materials' as const, slotId: 'cell:a' }, hostedRoots: [node('a')] }]] },
      { matrix: [[{ content: { kind: 'materials' as const, slotId: 'cell:b' }, hostedRoots: [node('b')] }]] },
    ] }
    mocks.cloneMaterialGraph.mockReturnValue({
      roots: [node('clone-a'), node('clone-b')], identityMap: new Map(), diagnostics: [],
    })
    const result = decodeInternalTableClipboard(JSON.stringify(payload), {} as never, identity => `clone-${identity.value}`)
    expect(mocks.cloneMaterialGraph).toHaveBeenCalledTimes(1)
    expect(mocks.cloneMaterialGraph.mock.calls[0]![0].map((root: MaterialNode) => root.id)).toEqual(['a', 'b'])
    expect(result.payload.regions.map(region => region.matrix[0]![0]!.hostedRoots![0]!.id)).toEqual(['clone-a', 'clone-b'])
  })

  it('treats external TSV as plain text', () => {
    expect(decodeExternalTableText('<b>x</b>\ty')).toEqual([['<b>x</b>', 'y']])
  })

  it('clips a matrix to existing rows and columns', () => {
    const writes: Array<{ row: number, column: number, value: string }> = []
    pasteTableMatrix([['a', 'b'], ['c', 'd']], { startRow: 1, startColumn: 1, rowCount: 2, columnCount: 2 }, (row, column, value) => writes.push({ row, column, value }))
    expect(writes).toEqual([{ row: 1, column: 1, value: 'a' }])
  })

  it.each([
    '{"version":2,"regions":[]}',
    '{"version":1,"regions":[{"matrix":[[{"content":{"kind":"html","text":"x"}}]]}]}',
    '{"version":1,"regions":[{"matrix":[[{"content":{"kind":"materials","slotId":"cell:x"},"hostedRoots":[{"__proto__":{"polluted":true}}]}]]}]}',
  ])('rejects malformed or malicious internal JSON: %s', (text) => {
    expect(() => decodeInternalTableClipboard(text, {} as never, vi.fn())).toThrow('invalid EasyInk table clipboard')
  })

  it('plans cross-region slot/port collisions and applies one undoable transaction', () => {
    const model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const [textTarget, slotTarget] = model.bands[0]!.rows[0]!.cells
    slotTarget!.content = { kind: 'materials', slotId: `cell:${slotTarget!.id}` }
    const table = node('table')
    table.type = 'table-static'
    table.model = model as never
    table.bindings = { value: { sourceId: 'existing', fieldPath: 'value' } }
    table.slots = { [`cell:${slotTarget!.id}`]: [node('old-child')] }
    const payload = JSON.stringify({
      version: 1,
      bindings: {
        value: { sourceId: 'source', fieldPath: 'amount' },
        unused: { sourceId: 'source', fieldPath: 'unused' },
      },
      regions: [
        { matrix: [[{ content: { kind: 'text', text: '', bindingPort: 'value' } }]] },
        { matrix: [[{ content: { kind: 'materials', slotId: 'cell:source' }, hostedRoots: [node('new-child')] }]] },
      ],
    })
    mocks.cloneMaterialGraph.mockReturnValue({ roots: [node('cloned-child')], identityMap: new Map(), diagnostics: [] })
    const plan = planInternalTablePaste({
      text: payload, table, targetRegions: [{ cellIds: [[textTarget!.id]] }, { cellIds: [[slotTarget!.id]] }],
      profile: {} as never, createIdentity: vi.fn(), allocatePort: () => 'value-copy',
      occupiedSlotDisposition: { kind: 'delete' },
    })
    const transact = vi.fn((mutate: (draft: { elements: MaterialNode[] }) => void) => mutate({ elements: [table] }))
    applyInternalTablePaste({ engine: { transact } as never, plan, tableNodeId: table.id, selectionLineage: 'selection-1' })
    expect(mocks.cloneMaterialGraph).toHaveBeenCalledTimes(1)
    expect(transact).toHaveBeenCalledTimes(1)
    expect(table.bindings).toHaveProperty('value-copy')
    expect(table.bindings).not.toHaveProperty('unused')
    expect(table.slots[`cell:${slotTarget!.id}`]![0]!.id).toBe('cloned-child')
  })
})

function node(id: string): MaterialNode {
  return {
    id, type: 'text', x: 0, y: 0, width: 10, height: 4, modelVersion: 1, model: {},
    slots: {}, bindings: {}, output: { visibility: 'include' },
  }
}
```

- [ ] **Step 2: Run the test and verify the clipboard module is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/clipboard.test.ts`

Expected: FAIL with `Failed to load url ./clipboard`.

- [ ] **Step 3: Implement safe multi-format interchange**

```ts
// packages/materials/table/kernel/src/clipboard.ts
import type {
  CompiledMaterialProfile, DocumentTransactionEngine, MaterialGraphDiagnostic, MaterialIdentity, MaterialIdentityKey,
} from '@easyink/core'
import { admitMaterialGraph, cloneMaterialGraph, requireDocumentNode } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableCellContent, TableCellId, TableModel, TableStyle } from './model'
import { assertJsonValue, deepClone, escapeHtml, isObject } from '@easyink/shared'
import { decodeTableCellContentV1, decodeTableStyleV1 } from './model-codec'
import { TableTopologyIndex } from './editing/topology-index'

export const TABLE_CLIPBOARD_MIME = 'application/x-easyink-table+json'
export interface ClipboardCell { content: TableCellContent, style?: TableStyle, hostedRoots?: MaterialNode[] }
export interface TableClipboardRegion { matrix: ClipboardCell[][] }
export interface TableClipboardPayload {
  version: 1
  regions: TableClipboardRegion[]
  bindings?: MaterialNode['bindings']
}

export function encodeTableClipboard(payload: TableClipboardPayload) {
  const matrix = payload.regions[0]?.matrix ?? []
  const text = matrix.map(row => row.map(cell => cell.content.kind === 'text' ? cell.content.text : '').join('\t')).join('\n')
  const html = `<table>${matrix.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell.content.kind === 'text' ? cell.content.text : '')}</td>`).join('')}</tr>`).join('')}</table>`
  return { internal: JSON.stringify(payload), html, tsv: text }
}

function parsePayload(text: string): TableClipboardPayload {
  if (new TextEncoder().encode(text).byteLength > 4 * 1024 * 1024)
    throw new TypeError('EasyInk table clipboard payload exceeds 4 MiB')
  const value: unknown = JSON.parse(text)
  try {
    assertJsonValue(value)
    exactKeys(value, ['version', 'regions'], ['bindings'])
    if ((value as Record<string, unknown>).version !== 1) throw new Error('version')
    const regions = (value as Record<string, unknown>).regions
    if (!Array.isArray(regions) || regions.length === 0) throw new Error('regions')
    for (const region of regions) {
      exactKeys(region, ['matrix'], [])
      const matrix = (region as Record<string, unknown>).matrix
      if (!Array.isArray(matrix)) throw new Error('matrix')
      for (const row of matrix) {
        if (!Array.isArray(row)) throw new Error('row')
        for (const cell of row) {
          exactKeys(cell, ['content'], ['style', 'hostedRoots'])
          const record = cell as Record<string, unknown>
          if (decodeTableCellContentV1(record.content, '/content').issues.length) throw new Error('content')
          if (Object.hasOwn(record, 'style') && decodeTableStyleV1(record.style, '/style').issues.length)
            throw new Error('style')
          if (Object.hasOwn(record, 'hostedRoots')) {
            if (!Array.isArray(record.hostedRoots)) throw new Error('hostedRoots')
            record.hostedRoots.forEach(validateClipboardRoot)
            if ((record.content as { kind?: unknown }).kind !== 'materials') throw new Error('hosted text roots')
          }
        }
      }
    }
    const bindings = (value as Record<string, unknown>).bindings
    if (bindings !== undefined) {
      if (!isObject(bindings) || Array.isArray(bindings)) throw new Error('bindings')
      for (const binding of Object.values(bindings))
        if (!isObject(binding) || Array.isArray(binding)) throw new Error('scalar binding')
    }
  }
  catch {
    throw new TypeError('invalid EasyInk table clipboard payload')
  }
  return value as unknown as TableClipboardPayload
}

function exactKeys(value: unknown, required: readonly string[], optional: readonly string[]): void {
  if (!isObject(value) || Array.isArray(value)) throw new Error('object')
  const allowed = new Set([...required, ...optional])
  if (Object.keys(value).some(key => !allowed.has(key)) || required.some(key => !Object.hasOwn(value, key)))
    throw new Error('keys')
}

function validateClipboardRoot(value: unknown): void {
  exactKeys(value,
    ['id', 'type', 'x', 'y', 'width', 'height', 'modelVersion', 'model', 'slots', 'bindings', 'output'],
    ['unit', 'rotation', 'alpha', 'zIndex', 'editorState', 'extensions', 'compat'])
  const node = value as Record<string, unknown>
  if (typeof node.id !== 'string' || typeof node.type !== 'string'
    || !['x', 'y', 'width', 'height', 'modelVersion'].every(key => typeof node[key] === 'number' && Number.isFinite(node[key])))
    throw new Error('node envelope')
  if (!isObject(node.slots) || Array.isArray(node.slots) || !isObject(node.bindings) || Array.isArray(node.bindings))
    throw new Error('node maps')
  for (const children of Object.values(node.slots)) {
    if (!Array.isArray(children)) throw new Error('slot children')
    children.forEach(validateClipboardRoot)
  }
}

export function decodeInternalTableClipboard(
  text: string,
  profile: CompiledMaterialProfile,
  createIdentity: (identity: MaterialIdentity, address: import('@easyink/core').MaterialNodeAddress) => string,
): {
    payload: TableClipboardPayload
    identityMap: ReadonlyMap<MaterialIdentityKey, string>
    diagnostics: readonly MaterialGraphDiagnostic[]
  } {
  const payload = parsePayload(text)
  const roots = payload.regions.flatMap(region => region.matrix.flatMap(row => row.flatMap(cell => cell.hostedRoots ?? [])))
  const admitted = admitMaterialGraph(roots, profile, { maxJsonNodes: 100_000, maxMaterialNodes: 10_000 })
  if (admitted.diagnostics.some(item => item.severity === 'error')
    || [...admitted.nodeStates.values()].some(state => state.status !== 'ready'))
    throw new TypeError('clipboard hosted roots failed profile admission')
  const cloned = cloneMaterialGraph(admitted.roots, profile, { createIdentity })
  let offset = 0
  const result = deepClone(payload)
  for (const region of result.regions) for (const row of region.matrix) for (const cell of row) {
    const count = cell.hostedRoots?.length ?? 0
    if (count) cell.hostedRoots = cloned.roots.slice(offset, offset + count)
    offset += count
  }
  return { payload: result, identityMap: cloned.identityMap, diagnostics: cloned.diagnostics }
}

export interface TablePasteTargetRegion { cellIds: TableCellId[][] }
export interface InternalTablePastePlan {
  operation: {
    kind: 'table.clipboard.paste'
    targetIds: string[]
    fieldPaths: string[]
    structural: true
  }
  apply: (node: MaterialNode) => void
}

export function planInternalTablePaste(input: {
  text: string
  table: MaterialNode
  targetRegions: TablePasteTargetRegion[]
  profile: CompiledMaterialProfile
  createIdentity: (identity: MaterialIdentity, address: import('@easyink/core').MaterialNodeAddress) => string
  allocatePort: (sourcePort: string, occupied: ReadonlySet<string>) => string
  expectedNodeRevision: number
  occupiedSlotDisposition?: { kind: 'delete' } | { kind: 'relocate', plans: readonly SlotReparentPlan[] }
}): InternalTablePastePlan {
  const decoded = decodeInternalTableClipboard(input.text, input.profile, input.createIdentity)
  if (decoded.payload.regions.length !== input.targetRegions.length)
    throw new Error('clipboard region count does not match paste targets')
  const model = input.table.model as unknown as TableModel
  const index = new TableTopologyIndex(model)
  const occupiedPorts = new Set(Object.keys(input.table.bindings))
  const portMap = new Map<string, string>()
  const copiedBindings: MaterialNode['bindings'] = {}
  const referencedPorts = new Set(decoded.payload.regions.flatMap(region => region.matrix.flatMap(row =>
    row.flatMap(cell => cell.content.kind === 'text' && cell.content.bindingPort ? [cell.content.bindingPort] : []))))
  for (const sourcePort of referencedPorts) {
    const binding = decoded.payload.bindings?.[sourcePort]
    if (!binding) continue
    const targetPort = occupiedPorts.has(sourcePort) ? input.allocatePort(sourcePort, occupiedPorts) : sourcePort
    if (occupiedPorts.has(targetPort)) throw new Error(`allocated clipboard port is not unique: ${targetPort}`)
    occupiedPorts.add(targetPort)
    portMap.set(sourcePort, targetPort)
    copiedBindings[targetPort] = deepClone(binding)
  }

  const writes: Array<{ cellId: TableCellId, source: ClipboardCell }> = []
  decoded.payload.regions.forEach((region, regionIndex) => region.matrix.forEach((row, rowIndex) =>
    row.forEach((source, columnIndex) => {
      const cellId = input.targetRegions[regionIndex]!.cellIds[rowIndex]?.[columnIndex]
      if (cellId) {
        index.cell(cellId)
        writes.push({ cellId, source })
      }
    })))
  for (const { cellId } of writes) {
    const path = index.cell(cellId)
    const cell = model.bands[path.band]!.rows[path.row]!.cells[path.cell]!
    if (cell.content.kind !== 'materials') continue
    const children = input.table.slots[cell.content.slotId] ?? []
    if (children.length && !input.occupiedSlotDisposition)
      throw new Error(`occupied target slot requires disposition: ${cell.content.slotId}`)
  }

  return {
    operation: {
      kind: 'table.clipboard.paste',
      targetIds: [`node:${input.table.id}`, ...writes.map(write => `table.cell:${write.cellId}`)],
      fieldPaths: ['/model/bands', '/slots', '/bindings'],
      structural: true,
    },
    apply(node) {
      const targetModel = node.model as unknown as TableModel
      const targetIndex = new TableTopologyIndex(targetModel)
      const releasedPorts = new Set<string>()
      for (const { cellId, source } of writes) {
        const path = targetIndex.cell(cellId)
        const target = targetModel.bands[path.band]!.rows[path.row]!.cells[path.cell]!
        if (target.content.kind === 'text' && target.content.bindingPort) releasedPorts.add(target.content.bindingPort)
        if (target.content.kind === 'materials') {
          const children = node.slots[target.content.slotId] ?? []
          if (children.length && input.occupiedSlotDisposition?.kind === 'relocate')
            input.occupiedSlotDisposition.apply(children)
          delete node.slots[target.content.slotId]
        }
        if (source.content.kind === 'materials') {
          const slotId = `cell:${cellId}`
          target.content = { kind: 'materials', slotId }
          node.slots[slotId] = deepClone(source.hostedRoots ?? [])
        }
        else {
          const mappedPort = source.content.bindingPort ? portMap.get(source.content.bindingPort) : undefined
          target.content = {
            kind: 'text', text: source.content.text,
            ...(mappedPort ? { bindingPort: mappedPort } : {}),
          }
        }
        if (source.style) target.style = deepClone(source.style)
        else delete target.style
      }
      Object.assign(node.bindings, copiedBindings)
      const retainedPorts = new Set(targetModel.bands.flatMap(band => band.rows.flatMap(row => row.cells.flatMap(cell =>
        cell.content.kind === 'text' && cell.content.bindingPort ? [cell.content.bindingPort] : []))))
      for (const port of releasedPorts) if (!retainedPorts.has(port)) delete node.bindings[port]
    },
  }
}

export function applyInternalTablePaste(input: {
  engine: DocumentTransactionEngine
  plan: InternalTablePastePlan
  tableNodeId: string
  selectionLineage: string
}): void {
  input.engine.transact((draft) => {
    input.plan.apply(requireDocumentNode(draft, input.engine.store.profile, input.tableNodeId))
  }, {
    label: 'Paste table cells',
    operation: { ...input.plan.operation, sessionPath: [], selectionLineage: input.selectionLineage },
  })
}

export function decodeExternalTableText(text: string): string[][] {
  return text.replace(/\r\n?/g, '\n').split('\n').map(row => row.split('\t'))
}

export function pasteTableMatrix(
  matrix: string[][],
  bounds: { startRow: number, startColumn: number, rowCount: number, columnCount: number },
  write: (row: number, column: number, value: string) => void,
): void {
  matrix.forEach((values, rowOffset) => values.forEach((value, columnOffset) => {
    const row = bounds.startRow + rowOffset
    const column = bounds.startColumn + columnOffset
    if (row < bounds.rowCount && column < bounds.columnCount) write(row, column, value)
  }))
}
```

Never execute an arbitrary relocation callback inside a transaction recipe. Plan every occupied-slot move through core `createSlotReparentPlan()` against `expectedNodeRevision`, reject a relocation target that is itself released by the paste, and revalidate every plan immediately before one atomic recipe applies model/style/binding/slot changes. The transaction fails closed if node/layout revision, slot policy, target anchor, or prospective geometry changed. Update mocks with the real profile/index contract and assert paste creates one change set/undo entry whose inverse restores exact bindings, slots, hosted children, selection, and topology revision.

Add the generic `admitMaterialGraph()` helper to the foundation introspection/admission module: it applies cumulative budgets, canonical envelope decoding, profile adapters, recursive slot admission, and graph validation to detached roots without inventing a document. Unknown/future/quarantined roots are preserved in the decoded payload for extraction diagnostics but never passed to adapter introspection or `cloneMaterialGraph`, and paste rejects them atomically. Tests prove byte rejection happens before `JSON.parse`, accessors/prototype keys fail, and an invalid hosted root cannot invoke its manifest adapter.

Internal paste calls `cloneMaterialGraph` exactly once for all hosted roots across every selected region, allowing the core two-pass identity map to rewrite cross-root document and table-private references. Task 4's introspection declares the table identities and encoded `cell:<cellId>` slot-key references consumed here. Internal JSON alone preserves bindings, styles, and hosted roots; HTML and TSV always become plain text. `pasteTableMatrix` clips to the existing target rectangle and no path inserts rows or columns.

Add the export:

```ts
export * from './clipboard'
```

- [ ] **Step 4: Run clipboard tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/clipboard.test.ts`

Expected: PASS with `4 passed`; the internal MIME retains multiple regions and invokes the foundation graph clone once for all hosted roots.

- [ ] **Step 5: Commit clipboard semantics**

```bash
git add packages/materials/table/kernel/src/clipboard.ts packages/materials/table/kernel/src/clipboard.test.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): add safe table clipboard interchange"
```

## Task 15: Materials-Mode Cell Slots And Atomic Reparent

**Files:**
- Create: `packages/materials/table/kernel/src/cell-slots.ts`
- Test: `packages/materials/table/kernel/src/cell-slots.test.ts`
- Modify: `packages/materials/table/kernel/src/editing/table-editing-adapter.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write failing slot and reparent tests**

```ts
// packages/materials/table/kernel/src/cell-slots.test.ts
import { describe, expect, it, vi } from 'vitest'
import type { MaterialNode } from '@easyink/schema'
import { createTableModel } from './model'
import { applyMaterialsCellModel, applyTextCellModel, reparentIntoMaterialsCell } from './cell-slots'

describe('materials-mode table cells', () => {
  it('switches the model to its stable clipped cell slot', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const cellId = model.bands[0]!.rows[0]!.cells[0]!.id
    const node = { model, slots: {}, bindings: {} } as unknown as MaterialNode
    applyMaterialsCellModel(node, cellId)
    expect((node.model as unknown as typeof model).bands[0]!.rows[0]!.cells[0]!.content)
      .toEqual({ kind: 'materials', slotId: `cell:${cellId}` })
    expect(node.slots).toEqual({ [`cell:${cellId}`]: [] })
  })

  it('removes an exclusive text port but preserves a shared port when switching mode', () => {
    const model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const [first, second] = model.bands[0]!.rows[0]!.cells
    first!.content = { kind: 'text', text: '', bindingPort: 'shared' }
    second!.content = { kind: 'text', text: '', bindingPort: 'shared' }
    const node = { model, slots: {}, bindings: { shared: { sourceId: 'data', fieldPath: 'value' } } } as unknown as MaterialNode
    applyMaterialsCellModel(node, first!.id)
    expect(node.bindings.shared).toBeDefined()
    applyMaterialsCellModel(node, second!.id)
    expect(node.bindings.shared).toBeUndefined()
  })

  it('rejects materials-to-text with children unless delete or relocation is explicit', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const cell = model.bands[0]!.rows[0]!.cells[0]!
    cell.content = { kind: 'materials', slotId: `cell:${cell.id}` }
    const child = { id: 'child' } as MaterialNode
    const node = { model, slots: { [`cell:${cell.id}`]: [child] }, bindings: {} } as unknown as MaterialNode
    expect(() => applyTextCellModel(node, cell.id, 'text')).toThrow('non-empty materials slot')
    applyTextCellModel(node, cell.id, 'text', { kind: 'delete' })
    expect(node.slots).toEqual({})
    expect((node.model as unknown as typeof model).bands[0]!.rows[0]!.cells[0]!.content)
      .toEqual({ kind: 'text', text: 'text' })
  })

  it('publishes model, ensured slot, and reparent as one transaction recipe', () => {
    const apply = vi.fn()
    const plan = { operation: { kind: 'structure.reparent' }, apply }
    const transact = vi.fn()
    const engine = { store: {}, transact } as never
    reparentIntoMaterialsCell({
      engine, tableNodeId: 'table-1', childNodeId: 'text-1', cellId: 'cell-1' as never,
      selectionLineage: 'selection-1', createReparentPlan: vi.fn(() => plan as never),
    })
    expect(transact).toHaveBeenCalledTimes(1)
    expect(transact.mock.calls[0]![1]).toMatchObject({
      label: 'Move material into table cell', operation: expect.objectContaining({ structural: true }),
    })
  })
})
```

- [ ] **Step 2: Run the test and verify the slot adapter is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/cell-slots.test.ts`

Expected: FAIL with `Failed to load url ./cell-slots`.

- [ ] **Step 3: Apply the table model and pure reparent plan in one transaction**

```ts
// packages/materials/table/kernel/src/cell-slots.ts
import type { DocumentTransactionEngine, SlotReparentPlan, SlotReparentPlanInput } from '@easyink/core'
import { combineStableOperationDescriptors, createSlotReparentPlan, requireDocumentNode } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableCellId, TableModel } from './model'
import { TableTopologyIndex } from './editing/topology-index'

export function tableCellSlotId(cellId: TableCellId): string { return `cell:${cellId}` }

export function applyMaterialsCellModel(node: MaterialNode, cellId: TableCellId): void {
  const model = node.model as unknown as TableModel
  const path = new TableTopologyIndex(model).cell(cellId)
  const cell = model.bands[path.band]!.rows[path.row]!.cells[path.cell]!
  const releasedPort = cell.content.kind === 'text' ? cell.content.bindingPort : undefined
  const slotId = tableCellSlotId(cellId)
  cell.content = { kind: 'materials', slotId }
  node.slots[slotId] ??= []
  if (releasedPort && !model.bands.some(band => band.rows.some(row => row.cells.some(candidate =>
    candidate.id !== cellId && candidate.content.kind === 'text' && candidate.content.bindingPort === releasedPort))))
    delete node.bindings[releasedPort]
}

export function applyTextCellModel(
  node: MaterialNode,
  cellId: TableCellId,
  text: string,
  disposition?: { kind: 'delete' } | { kind: 'relocate', apply: (children: MaterialNode[]) => void },
): void {
  const model = node.model as unknown as TableModel
  const path = new TableTopologyIndex(model).cell(cellId)
  const cell = model.bands[path.band]!.rows[path.row]!.cells[path.cell]!
  if (cell.content.kind !== 'materials') {
    cell.content = { kind: 'text', text }
    return
  }
  const slotId = cell.content.slotId
  const children = node.slots[slotId] ?? []
  if (children.length && !disposition) throw new Error('non-empty materials slot requires delete or relocation disposition')
  if (children.length && disposition?.kind === 'relocate') disposition.apply(children)
  delete node.slots[slotId]
  cell.content = { kind: 'text', text }
}

export function reparentIntoMaterialsCell(input: {
  engine: DocumentTransactionEngine
  tableNodeId: string
  childNodeId: string
  cellId: TableCellId
  selectionLineage: string
  createReparentPlan?: (store: DocumentTransactionEngine['store'], input: SlotReparentPlanInput) => SlotReparentPlan
}): void {
  const slotId = tableCellSlotId(input.cellId)
  const factory = input.createReparentPlan ?? createSlotReparentPlan
  const plan = factory(input.engine.store, {
    nodeId: input.childNodeId,
    target: { kind: 'node-slot', ownerNodeId: input.tableNodeId, slot: slotId, atEnd: true },
    preserveWorldPose: true,
    ensureTargetSlot: true,
    selectionLineage: input.selectionLineage,
  })
  const tableOperation = {
    kind: 'table.cell.materials', sessionPath: [],
    targetIds: [`node:${input.tableNodeId}`, `table.cell:${input.cellId}`],
    fieldPaths: ['/model/bands', `/slots/${slotId}`],
    selectionLineage: input.selectionLineage, structural: true,
  } as const
  input.engine.transact((draft) => {
    applyMaterialsCellModel(requireDocumentNode(draft, input.engine.store.profile, input.tableNodeId), input.cellId)
    plan.apply(draft)
  }, {
    label: 'Move material into table cell',
    operation: combineStableOperationDescriptors('table.cell.materials', [tableOperation, plan.operation]),
  })
}
```

Add the export:

```ts
export * from './cell-slots'
```

Call `reparentIntoMaterialsCell` and the inverse text-mode recipe from `table-editing-adapter.ts`. `ensureTargetSlot: true` asks core to create `owner.slots[slotId] = []` only after the manifest prefix policy approves it. The manifest declares the cell slot coordinate space as `slot`; the core reparent plan uses the slot world matrix so a child keeps its world pose when the table is translated, rotated, or scaled, while its persisted `x/y` become content-rect-local. Clipping is the committed table content rect, not a core slot option. Text-to-materials deletes a binding only when no surviving cell/data config references that port. Materials-to-text rejects a nonempty slot until the caller supplies core relocation plans or an explicit delete disposition. Model, slots, bindings, child moves, and selection publish in one transaction and undo restores them exactly; no pre-commit change set exists or is combined.

- [ ] **Step 4: Run slot, transaction, and matrix-chain tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/cell-slots.test.ts packages/materials/table/kernel/src/editing/table-editing-adapter.test.ts packages/core/src/slot-reparent.test.ts packages/core/src/matrix-chain.test.ts`

Expected: PASS; shared ports survive, orphan ports are removed, nonempty inverse switches require disposition, reparent preserves the child world transform under rotated/scaled table matrices within numeric tolerance, slot-local padding/clip geometry matches `contentRect`, and each recipe creates one exact undo entry.

- [ ] **Step 5: Commit cell slot integration**

```bash
git add packages/materials/table/kernel/src/cell-slots.ts packages/materials/table/kernel/src/cell-slots.test.ts packages/materials/table/kernel/src/editing/table-editing-adapter.ts packages/materials/table/kernel/src/editing/table-editing-adapter.test.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): add atomic materials-cell reparenting"
```

## Task 16: Designer Cell Virtualization And Template-Only Data Editing

**Files:**
- Create: `packages/materials/table/kernel/src/editing/designer-window.ts`
- Test: `packages/materials/table/kernel/src/editing/designer-window.test.ts`
- Modify: `packages/materials/table/static/src/designer.ts`
- Modify: `packages/materials/table/data/src/designer.ts`
- Modify: `packages/materials/table/static/src/designer.test.ts`
- Modify: `packages/materials/table/data/src/designer.test.ts`
- Create: `packages/designer/src/layout/material-layout-preview-service.ts`
- Create: `packages/designer/src/layout/material-layout-preview-service.test.ts`

- [ ] **Step 1: Write failing viewport and template-only tests**

```ts
// packages/materials/table/kernel/src/editing/designer-window.test.ts
import { describe, expect, it } from 'vitest'
import { TableSpatialIndex } from './designer-window'

describe('selectDesignerCells', () => {
  const cells = Array.from({ length: 100 }, (_, index) => ({
    cellId: `cell-${index}`,
    rect: { x: 0, y: index * 10, width: 100, height: 10 },
  }))

  it('returns visible cells plus document-unit overscan', () => {
    const index = TableSpatialIndex.build(1, cells)
    const selected = index.query({ x: 0, y: 200, width: 100, height: 50 }, 20)
    expect(selected[0]!.cellId).toBe('cell-18')
    expect(selected.at(-1)!.cellId).toBe('cell-26')
  })

  it('retains the focused cell outside the viewport', () => {
    const selected = TableSpatialIndex.build(1, cells).query({ x: 0, y: 200, width: 100, height: 50 }, 0, 'cell-2')
    expect(selected.map(cell => cell.cellId)).toContain('cell-2')
  })

  it('visits only visible rows plus crossing merges', () => {
    const large = Array.from({ length: 100_000 }, (_, index) => ({
      cellId: `cell-${index}`, rect: { x: 0, y: index * 10, width: 100, height: 10 },
    }))
    let visited = 0
    const selected = TableSpatialIndex.build(9, large).query(
      { x: 0, y: 500_000, width: 100, height: 100 }, 20, undefined, () => { visited += 1 },
    )
    expect(selected.length).toBeLessThan(20)
    expect(visited).toBeLessThan(64)
  })

  it('does not linearly scan nonintersecting row-spanning merges', () => {
    const merges = Array.from({ length: 100_000 }, (_, index) => ({
      cellId: `merge-${index}`,
      rect: { x: 0, y: index * 20, width: 100, height: 15 },
      crossesRows: true,
    }))
    let visited = 0
    const selected = TableSpatialIndex.build(10, merges).query(
      { x: 0, y: 1_000_000, width: 100, height: 20 }, 0, undefined, () => { visited += 1 },
    )
    expect(selected.length).toBeLessThanOrEqual(2)
    expect(visited).toBeLessThan(64)
  })
})
```

Add this integration test to `packages/materials/table/data/src/designer.test.ts`:

```ts
it('renders only template bands and never expands runtime records in Designer', () => {
  const readRuntimeRows = vi.fn(() => { throw new Error('Designer must not read runtime records') })
  const extension = createTableDataExtension(designerContext({ readRuntimeRows }))
  const host = document.createElement('div')
  const dispose = extension.renderContent(nodeSignal(createTableDataNode()), host)
  expect(readRuntimeRows).not.toHaveBeenCalled()
  expect(host.querySelectorAll('[data-table-band="detail"]')).toHaveLength(1)
  dispose()
})
```

- [ ] **Step 2: Run the tests and verify viewport selection is absent**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/editing/designer-window.test.ts packages/materials/table/data/src/designer.test.ts`

Expected: FAIL with missing `designer-window` and the current placeholder-record rendering assertion.

- [ ] **Step 3: Implement viewport selection and update both Designer facets**

```ts
// packages/materials/table/kernel/src/editing/designer-window.ts
import type { Rect } from '@easyink/core'

export interface DesignerCellRect { cellId: string, rect: Rect, crossesRows?: boolean }

interface MergeIntervalNode {
  center: number
  byStart: readonly DesignerCellRect[]
  byEnd: readonly DesignerCellRect[]
  left?: MergeIntervalNode
  right?: MergeIntervalNode
}

function intersects(first: Rect, second: Rect): boolean {
  return first.x < second.x + second.width && first.x + first.width > second.x
    && first.y < second.y + second.height && first.y + first.height > second.y
}

export class TableSpatialIndex {
  private constructor(
    readonly layoutRevision: number,
    private readonly cells: readonly DesignerCellRect[],
    private readonly starts: readonly number[],
    private readonly crossingMerges: MergeIntervalNode | undefined,
    private readonly byId: ReadonlyMap<string, DesignerCellRect>,
  ) {}

  static build(layoutRevision: number, cells: readonly DesignerCellRect[]): TableSpatialIndex {
    const ordered = [...cells].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
    return new TableSpatialIndex(
      layoutRevision, ordered, ordered.map(cell => cell.rect.y),
      buildMergeIntervalTree(ordered.filter(cell => cell.crossesRows)),
      new Map(ordered.map(cell => [cell.cellId, cell])),
    )
  }

  query(viewport: Rect, overscan: number, focusedCellId?: string, onVisit: () => void = () => {}): DesignerCellRect[] {
    const expanded = { x: viewport.x - overscan, y: viewport.y - overscan, width: viewport.width + overscan * 2, height: viewport.height + overscan * 2 }
    const start = lowerBound(this.starts, expanded.y) - 1
    const result = new Map<string, DesignerCellRect>()
    for (let index = Math.max(0, start); index < this.cells.length; index++) {
      const cell = this.cells[index]!
      if (cell.rect.y >= expanded.y + expanded.height) break
      onVisit()
      if (intersects(cell.rect, expanded)) result.set(cell.cellId, cell)
    }
    queryMergeIntervals(this.crossingMerges, expanded, cell => {
      onVisit()
      if (intersects(cell.rect, expanded)) result.set(cell.cellId, cell)
    })
    if (focusedCellId) {
      const focused = this.byId.get(focusedCellId)
      if (focused) result.set(focused.cellId, focused)
    }
    return [...result.values()]
  }
}

function lowerBound(values: readonly number[], target: number): number {
  let low = 0
  let high = values.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (values[mid]! < target) low = mid + 1
    else high = mid
  }
  return low
}

function buildMergeIntervalTree(cells: readonly DesignerCellRect[]): MergeIntervalNode | undefined {
  if (cells.length === 0) return undefined
  const endpoints = cells.flatMap(cell => [cell.rect.y, cell.rect.y + cell.rect.height]).sort((a, b) => a - b)
  const center = endpoints[Math.floor(endpoints.length / 2)]!
  const left: DesignerCellRect[] = []
  const right: DesignerCellRect[] = []
  const overlap: DesignerCellRect[] = []
  for (const cell of cells) {
    const end = cell.rect.y + cell.rect.height
    if (end < center) left.push(cell)
    else if (cell.rect.y > center) right.push(cell)
    else overlap.push(cell)
  }
  return {
    center,
    byStart: [...overlap].sort((a, b) => a.rect.y - b.rect.y),
    byEnd: [...overlap].sort((a, b) => b.rect.y + b.rect.height - (a.rect.y + a.rect.height)),
    left: buildMergeIntervalTree(left),
    right: buildMergeIntervalTree(right),
  }
}

function queryMergeIntervals(
  node: MergeIntervalNode | undefined,
  viewport: Rect,
  visit: (cell: DesignerCellRect) => void,
): void {
  if (!node) return
  const start = viewport.y
  const end = viewport.y + viewport.height
  if (end < node.center) {
    for (const cell of node.byStart) {
      if (cell.rect.y >= end) break
      visit(cell)
    }
    queryMergeIntervals(node.left, viewport, visit)
    return
  }
  if (start > node.center) {
    for (const cell of node.byEnd) {
      if (cell.rect.y + cell.rect.height <= start) break
      visit(cell)
    }
    queryMergeIntervals(node.right, viewport, visit)
    return
  }
  node.byStart.forEach(visit)
  queryMergeIntervals(node.left, viewport, visit)
  queryMergeIntervals(node.right, viewport, visit)
}
```

Build one `TableSpatialIndex` per committed `layoutRevision` and reuse it for rendering, hit testing, rectangle selection, drag/drop targeting, and autoscroll. Map `TableCellLayout.coveredRowIds.length > 1` to `crossesRows`; the augmented interval tree visits only row-spanning merge anchors whose vertical intervals can intersect the query, so query cost is `O(log rows + log merges + visible/intersecting cells)`. In both Designer facets request the shared authoring-preview plan and render only query results. Data Designer feeds only header/detail-template/footer model bands and never opens runtime records.

Implement the generic `MaterialLayoutPreviewService` in Designer, not in a table package. It resolves the active `MaterialDesignerFacet.layout`, sends `mode:'authoring-preview'`, a provisional terminal `resourceRevision`, current node/data/layout revisions, host budgets/scheduler, raw/display binding resolvers, and `measureSlot`; it never activates a Viewer facet. Key its bounded cache by a structured tuple including exact profile object, mode, instance/node/model/topology/resource revisions, scope, unit, and constraints. Superseding requests abort, stale results cannot publish geometry sidecars, and session/profile destruction clears caches and awaits disposers. It publishes immutable plan copies plus `SlotContentTransformSnapshot` values for existing material slots and policy-approved prospective `cell:<id>` slots derived from committed cell `contentRect`. Tests cover preview/authoritative cache isolation, data-table zero collection opens, resource invalidation, abort/stale suppression, prospective slot geometry, and source models remaining unfrozen.

Export the shared helper from `packages/materials/table/kernel/src/editing/index.ts`; both static and data facets import it from `@easyink/material-table-kernel/editing`, so `table-static` never depends on `table-data`.

- [ ] **Step 4: Run static/data Designer tests and the selection overlay suite**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/editing/designer-window.test.ts packages/materials/table/static/src/designer.test.ts packages/materials/table/data/src/designer.test.ts packages/designer/src/layout/material-layout-preview-service.test.ts packages/designer/src/components/selection-overlay.test.ts`

Expected: PASS; rendered cell count remains bounded by viewport plus overscan and data Designer performs zero runtime-record reads.

- [ ] **Step 5: Commit Designer virtualization**

```bash
git add packages/materials/table/kernel/src/editing/designer-window.ts packages/materials/table/kernel/src/editing/designer-window.test.ts packages/materials/table/kernel/src/editing/index.ts packages/materials/table/static/src/designer.ts packages/materials/table/data/src/designer.ts packages/materials/table/static/src/designer.test.ts packages/materials/table/data/src/designer.test.ts packages/designer/src/layout/material-layout-preview-service.ts packages/designer/src/layout/material-layout-preview-service.test.ts
git commit -m "perf(table): virtualize designer cells"
```

## Task 17: Semantic Table Accessibility Plan

**Files:**
- Create: `packages/materials/table/kernel/src/accessibility.ts`
- Test: `packages/materials/table/kernel/src/accessibility.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write failing semantic grouping and header tests**

```ts
// packages/materials/table/kernel/src/accessibility.test.ts
import { describe, expect, it } from 'vitest'
import type { TableBand, TableModel } from './model'
import { createTableModel } from './model'
import { buildTableLayoutPlan } from './layout-plan'
import { TableTopologyEngine } from './topology-engine'
import { buildTableAccessibilityPlan } from './accessibility'

describe('buildTableAccessibilityPlan', () => {
  it('combines multiple header/footer bands into one thead and one tfoot', async () => {
    const table = createTableModel({ kind: 'data', columnCount: 2, rowCount: 1 })
    const detail = table.bands[0]!
    table.bands = [copyBand(detail, 'h1', 'header'), copyBand(detail, 'h2', 'header'), detail,
      copyBand(detail, 'f1', 'footer'), copyBand(detail, 'f2', 'footer')]
    table.accessibility = { caption: 'Invoice items' }
    const plan = buildTableAccessibilityPlan(table, await layout(table))
    expect(plan.caption).toBe('Invoice items')
    expect(plan.groups.map(group => group.tag)).toEqual(['thead', 'tbody', 'tfoot'])
    expect(plan.groups[0]!.rows).toHaveLength(2)
    expect(plan.groups[2]!.rows).toHaveLength(2)
    expect(plan.groups[1]!.rows[0]!.cells[0]!.headers).toEqual([
      plan.groups[0]!.rows[0]!.cells[0]!.domId,
      plan.groups[0]!.rows[1]!.cells[0]!.domId,
    ])
  })

  it('associates a merged header with every column covered by its layout entry', async () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    const body = source.bands[0]!
    const header = copyBand(body, 'header', 'header')
    source.bands.unshift(header)
    const row = header.rows[0]!
    const table = TableTopologyEngine.merge(source, {
      rowIds: [row.id], columnIds: source.columns.map(column => column.id), anchorCellId: row.cells[0]!.id,
    })
    const plan = buildTableAccessibilityPlan(table, await layout(table))
    const mergedHeader = plan.groups[0]!.rows[0]!.cells[0]!
    expect(mergedHeader).toMatchObject({ tag: 'th', colSpan: 2 })
    expect(plan.groups[1]!.rows[0]!.cells.map(cell => cell.headers)).toEqual([[mergedHeader.domId], [mergedHeader.domId]])
  })
})

function copyBand(source: TableBand, prefix: string, role: TableBand['role']): TableBand {
  return {
    ...source, id: `${prefix}-band` as never, role,
    rows: source.rows.map((row, rowIndex) => ({
      ...row, id: `${prefix}-row-${rowIndex}` as never,
      cells: row.cells.map((cell, cellIndex) => ({ ...cell, id: `${prefix}-cell-${rowIndex}-${cellIndex}` as never })),
    })),
  }
}

function layout(model: TableModel) {
  return buildTableLayoutPlan({
    model,
    constraints: { availableWidth: 100, availableHeight: 100, unit: 'mm', writingMode: 'horizontal-tb' },
    direction: 'ltr', scope: { key: 'a11y-test', data: {} }, instanceKey: 'table-a11y',
    measureText: async () => ({ width: 0, height: 0 }),
    measureSlot: async () => ({
      instanceKey: 'a11y-slot', contentBounds: { x: 0, y: 0, width: 0, height: 0 }, childPlans: [],
    }),
  })
}
```

- [ ] **Step 2: Run the test and verify the accessibility planner is missing**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/accessibility.test.ts`

Expected: FAIL with `Failed to load url ./accessibility`.

- [ ] **Step 3: Implement semantic groups and header associations**

```ts
// packages/materials/table/kernel/src/accessibility.ts
import type { TableCellId, TableModel } from './model'
import type { TableCellLayout, TableLayoutPlanData } from './layout-plan'

export interface AccessibleCellPlan {
  instanceId: string
  cellId: TableCellId
  domId: string
  tag: 'th' | 'td'
  headers: string[]
  ariaLabel?: string
  rowSpan: number
  colSpan: number
}
export interface AccessibleRowPlan { rowId: string, cells: AccessibleCellPlan[] }
export interface AccessibleGroupPlan { tag: 'thead' | 'tbody' | 'tfoot', rows: AccessibleRowPlan[] }
export interface TableAccessibilityPlan { caption?: string, description?: string, decorative: boolean, groups: AccessibleGroupPlan[] }

export function buildTableAccessibilityPlan(
  table: TableModel,
  layout: TableLayoutPlanData,
  fragment?: Pick<MaterialFragmentPlan, 'id' | 'consumedRange'>,
): TableAccessibilityPlan {
  const firstFragment = !fragment || fragment.consumedRange.startBlockOffset === 0
  const idPrefix = `table-${encodeTableOpaqueIdPart(fragment?.id ?? 'unfragmented-test')}`
  const headerByColumn = new Map<string, string[]>()
  const layoutByRow = new Map<string, TableCellLayout[]>()
  layout.cells.forEach(cell => layoutByRow.set(cell.rowInstanceId, [...(layoutByRow.get(cell.rowInstanceId) ?? []), cell]))
  for (const cell of layout.cells.filter(candidate => candidate.bandRole === 'header')) {
    const domId = `${idPrefix}-cell-${encodeTableOpaqueIdPart(cell.instanceId)}`
    for (const columnId of cell.coveredColumnIds)
      headerByColumn.set(columnId, [...(headerByColumn.get(columnId) ?? []), domId])
  }

  const createGroup = (tag: AccessibleGroupPlan['tag'], roles: Set<string>): AccessibleGroupPlan => ({
    tag,
    rows: layout.rows.filter(row => roles.has(row.bandRole)).map(row => ({
      rowId: row.instanceId,
      cells: (layoutByRow.get(row.instanceId) ?? []).map((cell): AccessibleCellPlan => {
        const isHeader = cell.bandRole === 'header'
        const headers = isHeader ? [] : [...new Set(cell.coveredColumnIds.flatMap(columnId => headerByColumn.get(columnId) ?? []))]
        return {
          instanceId: cell.instanceId,
          cellId: cell.cellId,
          domId: `${idPrefix}-cell-${encodeTableOpaqueIdPart(cell.instanceId)}`,
          tag: isHeader ? 'th' : 'td',
          headers,
          ...(!isHeader && !firstFragment ? {
            ariaLabel: cell.coveredColumnIds.flatMap(columnId => layout.headerLabelsByColumn?.[columnId] ?? []).join(', '),
          } : {}),
          rowSpan: cell.rowSpan,
          colSpan: cell.columnSpan,
        }
      }),
    })),
  })
  const groups: AccessibleGroupPlan[] = []
  if (layout.rows.some(row => row.bandRole === 'header')) groups.push(createGroup('thead', new Set(['header'])))
  groups.push(createGroup('tbody', new Set(['body', 'detail'])))
  if (layout.rows.some(row => row.bandRole === 'footer')) groups.push(createGroup('tfoot', new Set(['footer'])))
  return {
    ...(firstFragment && table.accessibility?.caption ? { caption: table.accessibility.caption } : {}),
    ...(firstFragment && table.accessibility?.description ? { description: table.accessibility.description } : {}),
    decorative: table.accessibility?.decorative === true,
    groups,
  }
}
```

During authoritative measurement, persist plain-text `headerLabelsByColumn` in the immutable JSON layout payload before fragment slicing. A continuation fragment never references IDs from the first page because page virtualization may unmount it; each continuation `td` receives its own `aria-label` from that snapshot and every emitted ID includes the core fragment ID. Caption/description render only in the first fragment. Add a browser/accessibility test that mounts only page 2, verifies unique IDs and usable cell labels, and proves no `headers`/`aria-describedby` points to an absent page-1 element.

Add the export:

```ts
export * from './accessibility'
```

- [ ] **Step 4: Run accessibility tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/accessibility.test.ts`

Expected: PASS with `2 passed`; any number of header/footer bands collapse into one semantic group, and merged header associations come from the shared active-cell layout rather than a second merge algorithm.

- [ ] **Step 5: Commit semantic accessibility planning**

```bash
git add packages/materials/table/kernel/src/accessibility.ts packages/materials/table/kernel/src/accessibility.test.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): add semantic accessibility plans"
```

## Task 18: Runtime Detail Layout And Semantic ViewerRenderTree

**Files:**
- Create: `packages/materials/table/data/src/runtime-layout.ts`
- Test: `packages/materials/table/data/src/runtime-layout.test.ts`
- Create: `packages/materials/table/kernel/src/viewer-tree.ts`
- Test: `packages/materials/table/kernel/src/viewer-tree.test.ts`
- Modify: `packages/materials/table/static/src/viewer.ts`
- Modify: `packages/materials/table/static/src/viewer.test.ts`
- Modify: `packages/materials/table/data/src/viewer.ts`
- Modify: `packages/materials/table/data/src/viewer.test.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`
- Modify: `packages/materials/table/data/src/index.ts`

- [ ] **Step 1: Write failing runtime-instance and semantic-tree tests**

```ts
// packages/materials/table/data/src/runtime-layout.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createTableMaterialLayoutPlan, encodeTableOpaqueIdPart } from '@easyink/material-table-kernel'
import { createArrayRuntimeRecordSource, createRuntimeRows } from './runtime-rows'
import { buildDataRuntimeTableLayout } from './runtime-layout'
import { createDefaultDataTableModel } from './schema'

describe('buildDataRuntimeTableLayout', () => {
  it('grows each derived detail independently and carries RuntimeRowId through layout and pagination', async () => {
    const model = createDefaultDataTableModel()
    const detailRow = model.bands.find(band => band.role === 'detail')!.rows[0]!
    const detailCell = detailRow.cells[0]!
    const hostedCell = detailRow.cells[1]!
    const plainCell = detailRow.cells[2]!
    detailCell.content = { kind: 'text', text: '', bindingPort: 'amount' }
    hostedCell.content = { kind: 'materials', slotId: `cell:${hostedCell.id}` }
    const rows = createRuntimeRows({
      dataRevision: 4,
      source: createArrayRuntimeRecordSource([{ id: 'a', amount: 4 }, { id: 'b', amount: 20 }]),
      readDetailKey: record => record.id,
    })
    const result = await buildDataRuntimeTableLayout({
      nodeId: 'table-1', instanceKey: 'table-1', model, width: 90, unit: 'mm', direction: 'ltr', rows, chunkSize: 1, pageContentHeight: 100,
      scope: { key: 'document', data: {} },
      resolveText: (cell, scope) => cell.content.kind === 'text' && cell.content.bindingPort
        ? String(scope.data[cell.content.bindingPort] ?? '')
        : cell.content.kind === 'text' ? cell.content.text : '',
      measureText: vi.fn(async ({ text }) => ({ width: 10, height: Number(text) || 0 })),
      measureSlot: vi.fn(async ({ scope }) => ({
        instanceKey: `detail-slot:${scope.key}`, contentBounds: { x: 0, y: 0, width: 0, height: 0 }, childPlans: [],
      })),
    })
    const firstRuntimeRow = `key-${encodeTableOpaqueIdPart('a')}`
    const secondRuntimeRow = `key-${encodeTableOpaqueIdPart('b')}`
    expect(result.pagination.units.filter(unit => unit.kind === 'detail')).toEqual([
      expect.objectContaining({ height: 8, runtimeRowId: firstRuntimeRow }),
      expect.objectContaining({ height: 20, runtimeRowId: secondRuntimeRow }),
    ])
    expect(result.layout.rows.filter(row => row.bandRole === 'detail').map(row => row.runtimeRowId))
      .toEqual([firstRuntimeRow, secondRuntimeRow])
    expect(result.layout.cells.filter(cell => cell.bandRole === 'detail').map(cell => cell.instanceId))
      .toEqual([
        `table-1:${firstRuntimeRow}:cell:${detailCell.id}`, `table-1:${firstRuntimeRow}:cell:${hostedCell.id}`,
        `table-1:${firstRuntimeRow}:cell:${plainCell.id}`,
        `table-1:${secondRuntimeRow}:cell:${detailCell.id}`, `table-1:${secondRuntimeRow}:cell:${hostedCell.id}`,
        `table-1:${secondRuntimeRow}:cell:${plainCell.id}`,
      ])
    const hostedBoxes = createTableMaterialLayoutPlan({
      nodeId: 'table-1', instanceKey: 'table-1', nodeRevision: 1, constraintKey: 'runtime', layout: result.layout,
    }).slotBoxes.filter(box => box.slotId === `cell:${hostedCell.id}`)
    expect(hostedBoxes).toHaveLength(2)
    expect(new Set(hostedBoxes.map(box => box.slotInstanceKey)).size).toBe(2)
  })

  it('creates zero derived detail rows for an empty collection', async () => {
    const model = createDefaultDataTableModel()
    const result = await buildDataRuntimeTableLayout({
      nodeId: 'table-empty', instanceKey: 'table-empty', model, width: 90, unit: 'mm', direction: 'ltr',
      rows: createRuntimeRows({ dataRevision: 1, source: createArrayRuntimeRecordSource([]) }),
      chunkSize: 32, pageContentHeight: 100,
      scope: { key: 'document', data: {} },
      resolveText: cell => cell.content.kind === 'text' ? cell.content.text : '',
      measureText: async () => ({ width: 0, height: 0 }),
      measureSlot: async () => ({
        instanceKey: 'empty-slot', contentBounds: { x: 0, y: 0, width: 0, height: 0 }, childPlans: [],
      }),
    })
    expect(result.pagination.units.filter(unit => unit.kind === 'detail')).toEqual([])
    expect(result.layout.rows.filter(row => row.bandRole === 'detail')).toEqual([])
  })

  it('disposes the cursor and releases partial facts when detail measurement fails', async () => {
    const model = createDefaultDataTableModel()
    model.bands = model.bands.filter(band => band.role === 'detail')
    const close = vi.fn()
    const rows = createRuntimeRows({
      dataRevision: 2,
      source: { open: async () => ({
        declaredRowCount: 1, keyIndex: { completeness: 'complete', multiplicity: new Map() },
        readNext: async () => ({ records: [{ amount: 1 }], done: true }), close,
      }) },
    })
    await expect(buildDataRuntimeTableLayout({
      nodeId: 'table-failure', instanceKey: 'table-failure', model, width: 90, unit: 'mm', direction: 'ltr',
      rows, chunkSize: 1, pageContentHeight: 100, scope: { key: 'document', data: {} },
      resolveText: () => '1', measureText: async () => { throw new Error('measure failed') },
      measureSlot: async () => ({
        instanceKey: 'unused', contentBounds: { x: 0, y: 0, width: 0, height: 0 }, childPlans: [],
      }),
    })).rejects.toThrow('measure failed')
    expect(close).toHaveBeenCalledTimes(1)
    await rows.dispose()
    expect(close).toHaveBeenCalledTimes(1)
  })
})
```

```ts
// packages/materials/table/kernel/src/viewer-tree.test.ts
import { describe, expect, it } from 'vitest'
import { createTableModel } from './model'
import { buildTableLayoutPlan } from './layout-plan'
import { buildTableAccessibilityPlan } from './accessibility'
import { buildTableViewerTree } from './viewer-tree'

describe('buildTableViewerTree', () => {
  it('returns semantic ViewerRenderTree nodes and never HTML strings', async () => {
    const model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    model.accessibility = { caption: 'Invoice', description: 'Line items' }
    model.style.padding = { top: 1, right: 2, bottom: 1, left: 2 }
    const [left, right] = model.bands[0]!.rows[0]!.cells
    left!.content = { kind: 'text', text: '<paid>' }
    left!.style = { border: { inlineEnd: { width: 1, color: '#f00', style: 'solid' } } }
    right!.style = { border: { inlineStart: { width: 2, color: '#00f', style: 'dashed' } } }
    const layout = await buildTableLayoutPlan({
      model,
      constraints: { availableWidth: 80, availableHeight: 100, unit: 'mm', writingMode: 'horizontal-tb' },
      direction: 'ltr', scope: { key: 'static', data: {} }, instanceKey: 'table-1',
      measureText: async () => ({ width: 10, height: 4 }),
      measureSlot: async () => ({
        instanceKey: 'slot', contentBounds: { x: 0, y: 0, width: 0, height: 0 }, childPlans: [],
      }),
    })
    const tree = buildTableViewerTree({
      model, layout, instanceKey: 'table-1', accessibility: buildTableAccessibilityPlan(model, layout),
      renderSlot: () => ({ kind: 'fragment', children: [] }),
    })
    expect(tree).toMatchObject({ kind: 'element', tag: 'table' })
    expect(tags(tree)).toEqual(expect.arrayContaining(['table', 'caption', 'tbody', 'tr', 'td']))
    expect(JSON.stringify(tree)).toContain('"value":"<paid>"')
    expect(JSON.stringify(tree)).not.toContain('<table>')
    expect(JSON.stringify(tree)).toContain('"padding-left":"2mm"')
    expect(JSON.stringify(tree)).toContain('"border-left":"1mm solid #f00"')
    expect(JSON.stringify(tree)).not.toContain('2mm dashed #00f')
  })

  it('mounts hosted content in the exact committed padded content rect', async () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 })
    const cell = model.bands[0]!.rows[0]!.cells[0]!
    model.style.padding = { top: 2, right: 3, bottom: 2, left: 3 }
    cell.content = { kind: 'materials', slotId: `cell:${cell.id}` }
    const layout = await buildTableLayoutPlan({
      model,
      constraints: { availableWidth: 40, availableHeight: 100, unit: 'mm', writingMode: 'horizontal-tb' },
      direction: 'ltr', scope: { key: 'hosted', data: {} }, instanceKey: 'table-hosted',
      measureText: async () => ({ width: 0, height: 0 }),
      measureSlot: async () => ({
        instanceKey: 'slot-instance', contentBounds: { x: 0, y: 0, width: 34, height: 25 }, childPlans: [],
      }),
    })
    const tree = buildTableViewerTree({
      model, layout, instanceKey: 'table-hosted', accessibility: buildTableAccessibilityPlan(model, layout),
      renderSlot: () => ({ kind: 'fragment', children: [] }),
    })
    expect(JSON.stringify(tree)).toContain(
      '"left":"3mm","top":"2mm","width":"34mm","height":"25mm"',
    )
  })

  it('emits logical colgroup widths while rtl controls physical column placement and cell bidi', async () => {
    const source = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    source.columns[0]!.track = { kind: 'fixed', size: 30 }
    source.columns[1]!.track = { kind: 'fixed', size: 70 }
    source.style.typography = { direction: 'rtl' }
    source.bands[0]!.rows[1]!.cells[0]!.style = { typography: { direction: 'ltr' } }
    source.bands[0]!.rows[1]!.cells[1]!.style = { typography: { direction: 'auto' } }
    const firstRow = source.bands[0]!.rows[0]!
    const model = TableTopologyEngine.merge(source, {
      rowIds: [firstRow.id], columnIds: source.columns.map(column => column.id),
      anchorCellId: firstRow.cells[0]!.id,
    })
    const layout = await buildTableLayoutPlan({
      model,
      constraints: { availableWidth: 100, availableHeight: 100, unit: 'mm', writingMode: 'horizontal-tb' },
      direction: 'rtl', scope: { key: 'rtl', data: {} }, instanceKey: 'table-rtl',
      measureText: async () => ({ width: 0, height: 0 }), measureSlot: async () => ({
        instanceKey: 'unused', contentBounds: { x: 0, y: 0, width: 0, height: 0 }, childPlans: [],
      }),
    })
    const secondRowCells = layout.cells.filter(cell => cell.rowId === model.bands[0]!.rows[1]!.id)
    expect(secondRowCells.map(cell => cell.rect)).toEqual([
      expect.objectContaining({ x: 70, width: 30 }), expect.objectContaining({ x: 0, width: 70 }),
    ])
    const tree = buildTableViewerTree({
      model, layout, instanceKey: 'table-rtl', accessibility: buildTableAccessibilityPlan(model, layout),
      renderSlot: () => ({ kind: 'fragment', children: [] }),
    })
    const json = JSON.stringify(tree)
    expect(json).toContain('"tag":"colgroup"')
    expect(json.indexOf('"width":"30mm"')).toBeLessThan(json.indexOf('"width":"70mm"'))
    expect(json).toContain('"dir":"rtl"')
    expect(json).toContain('"dir":"ltr"')
    expect(json).toContain('"dir":"auto"')
  })
})

function tags(tree: import('@easyink/core').ViewerRenderTree): string[] {
  if (tree.kind === 'text' || tree.kind === 'sanitized-markup' || tree.kind === 'imperative-dom') return []
  const own = tree.kind === 'element' ? [tree.tag] : []
  return [...own, ...(tree.children ?? []).flatMap(tags)]
}
```

- [ ] **Step 2: Run the focused tests and verify both modules are missing**

Run: `pnpm exec vitest run --dom packages/materials/table/data/src/runtime-layout.test.ts packages/materials/table/kernel/src/viewer-tree.test.ts`

Expected: FAIL with missing `runtime-layout` and `viewer-tree` modules.

- [ ] **Step 3: Implement sequential runtime measurement and derived instance geometry**

```ts
// packages/materials/table/data/src/runtime-layout.ts
import type { LayoutPlanDiagnostic, MaterialRuntimeScope } from '@easyink/core'
import type {
  BuildTableLayoutInput, TableBand, TableCell, TableCellLayout, TableLayoutPlanData,
} from '@easyink/material-table-kernel'
import {
  assertValidTableModel, buildTableLayoutPlan, createTableRecordScope, resolveColumnTracks, resolveTablePaintEdges,
} from '@easyink/material-table-kernel'
import type { RuntimeRows } from './runtime-rows'
import type { TablePaginationContract } from './pagination'
import { buildTablePaginationContract } from './pagination'

export interface BuildDataRuntimeTableLayoutInput {
  nodeId: string
  instanceKey: string
  model: import('@easyink/material-table-kernel').TableModel
  width: number
  unit: import('@easyink/core').LayoutConstraints['unit']
  direction: 'ltr' | 'rtl'
  rows: RuntimeRows
  chunkSize: number
  pageContentHeight: number
  scope: MaterialRuntimeScope
  resolveText: (cell: TableCell, scope: MaterialRuntimeScope) => string
  measureText: BuildTableLayoutInput['measureText']
  measureSlot: BuildTableLayoutInput['measureSlot']
  budget: import('@easyink/core').MaterialLayoutBudgetToken
  schedule: import('@easyink/core').MaterialMeasureScheduler
  signal?: AbortSignal
}

export async function buildDataRuntimeTableLayout(input: BuildDataRuntimeTableLayoutInput) {
  assertValidTableModel(input.model)
  const detail = input.model.bands.find(band => band.role === 'detail')!
  if (detail.rows.length !== 1) throw new Error('table-data detail band requires exactly one template row')
  const headers = input.model.bands.filter(band => band.role === 'header')
  const footers = input.model.bands.filter(band => band.role === 'footer')
  const cells: TableLayoutPlanData['cells'] = []
  const layoutRows: TableLayoutPlanData['rows'] = []
  const rowHeights: number[] = []
  const runtimeDiagnostics: LayoutPlanDiagnostic[] = []
  const detailMeasures: Array<{ id: import('@easyink/material-table-kernel').RuntimeRowId, height: number }> = []
  const columnWidths = resolveColumnTracks(input.width, input.model.columns.map(column => column.track)).widths
  let y = 0

  const append = (plan: TableLayoutPlanData) => {
    cells.push(...plan.cells.map(cell => ({
      ...cell,
      rect: { ...cell.rect, y: cell.rect.y + y },
      contentRect: { ...cell.contentRect, y: cell.contentRect.y + y },
    })))
    layoutRows.push(...plan.rows.map(row => ({ ...row, rect: { ...row.rect, y: row.rect.y + y } })))
    rowHeights.push(...plan.rowHeights)
    y += plan.height
  }
  const measure = (
    bands: TableBand[],
    scope: MaterialRuntimeScope,
    runtimeRowId?: import('@easyink/material-table-kernel').RuntimeRowId,
    layoutFactsReserved = false,
  ) =>
    buildTableLayoutPlan({
      model: input.model,
      constraints: {
        availableWidth: input.width, availableHeight: input.pageContentHeight,
        unit: input.unit, writingMode: 'horizontal-tb',
      },
      columnWidths,
      direction: input.direction,
      scope,
      instanceKey: input.instanceKey,
      bandIds: bands.map(band => band.id), runtimeRowId, signal: input.signal,
      deferPaintEdges: true,
      resolveText: cell => input.resolveText(cell, scope),
      measureText: input.measureText,
      measureSlot: input.measureSlot,
      budget: input.budget,
      schedule: input.schedule,
      layoutFactsReserved,
    })

  let succeeded = false
  try {
    const headerPlan = await measure(headers, input.scope)
    append(headerPlan)
    while (true) {
    if (input.signal?.aborted) throw input.signal.reason
    const chunk = await input.rows.next(input.chunkSize, input.signal)
    input.budget.reserveRuntimeRows(chunk.items.length)
    input.budget.reserveLayoutFacts('row', chunk.items.length)
    input.budget.reserveLayoutFacts('cell', chunk.items.length * input.model.columns.length)
    runtimeDiagnostics.push(...chunk.diagnostics.map(diagnostic => ({
      code: diagnostic.code, severity: 'warning' as const, instanceKey: input.instanceKey, nodeId: input.nodeId,
      message: `${diagnostic.code} at runtime record ${diagnostic.recordIndex}.`, detail: diagnostic,
    })))
    const measuredChunk = await input.schedule.mapOrdered(chunk.items, async (block) => {
      const scope = createTableRecordScope(input.scope, String(block.id), block.record)
      const plan = await measure([detail], scope, block.id, true)
      return { block, plan }
    }, input.signal ?? new AbortController().signal)
    for (const { block, plan } of measuredChunk) {
      append(plan)
      detailMeasures.push({ id: block.id, height: plan.height })
    }
    if (chunk.done) break
    }
    const footerPlan = await measure(footers, input.scope)
    append(footerPlan)

  const bandMeasures = (bands: TableBand[], plan: TableLayoutPlanData) => bands.map(band => ({
    id: band.id,
    height: plan.rows.filter(row => row.bandId === band.id).reduce((sum, row) => sum + row.rect.height, 0),
  }))
  const pagination = buildTablePaginationContract({
    sourceNodeId: input.nodeId, sourceInstanceKey: input.instanceKey, pageContentHeight: input.pageContentHeight,
    headers: bandMeasures(headers, headerPlan), details: detailMeasures, footers: bandMeasures(footers, footerPlan),
  })
  const layout = resolveTablePaintEdges({
    width: input.width, height: y, unit: input.unit, direction: input.direction,
    cells, rows: layoutRows, rowHeights,
    columnIds: input.model.columns.map(column => column.id),
    columnWidths,
  }, input.direction)
    const result = { layout, pagination, runtimeDiagnostics }
    succeeded = true
    return result
  }
  finally {
    await input.rows.dispose()
    if (!succeeded) {
      cells.length = 0
      layoutRows.length = 0
      rowHeights.length = 0
      detailMeasures.length = 0
      runtimeDiagnostics.length = 0
    }
  }
}
```

Runtime layouts exist only in the revision-keyed `MeasureService` result. Do not write `RuntimeRowId`, resolved text, measured heights, or record values into `MaterialNode.model`. A declared row limit is rejected by Task 9 before the first detail call to `measure`; unknown streams are checked before each new chunk is materialized.

- [ ] **Step 4: Build semantic trees exclusively from the shared layout and accessibility plan**

Use the `description` field already added to `TableAccessibilityPlan` in Task 17.

```ts
// packages/materials/table/kernel/src/viewer-tree.ts
import type { ViewerRenderTree } from '@easyink/core'
import { viewerElement, viewerText } from '@easyink/core'
import type { TableModel } from './model'
import { encodeTableOpaqueIdPart } from './model'
import type { TableCellPaintStyle, TableLayoutPlanData, TablePaintEdge } from './layout-plan'
import type { TableAccessibilityPlan } from './accessibility'

export function buildTableViewerTree(input: {
  model: TableModel
  layout: TableLayoutPlanData
  instanceKey: string
  accessibility: TableAccessibilityPlan
  renderSlot: (slotInstanceKey: string) => ViewerRenderTree
}): ViewerRenderTree {
  const layoutByInstance = new Map(input.layout.cells.map(cell => [cell.instanceId, cell]))
  const groups = input.accessibility.groups.map((group): ViewerRenderTree => viewerElement(
    group.tag,
    {},
    group.rows.map(row => viewerElement(
      'tr',
      { attributes: { id: `table-row-${encodeTableOpaqueIdPart(input.fragmentId ?? 'unfragmented-test')}-${encodeTableOpaqueIdPart(row.rowId)}` } },
      row.cells.map(cell => {
        const layout = layoutByInstance.get(cell.instanceId)
        if (!layout) throw new Error(`missing shared layout for cell instance ${cell.instanceId}`)
        const attributes: Record<string, string | number | boolean> = { id: cell.domId }
        if (cell.headers.length) attributes.headers = cell.headers.join(' ')
        if (cell.ariaLabel) attributes['aria-label'] = cell.ariaLabel
        if (cell.rowSpan > 1) attributes.rowspan = cell.rowSpan
        if (cell.colSpan > 1) attributes.colspan = cell.colSpan
        attributes.dir = layout.paintStyle.direction
        if (layout.content.kind === 'materials' && !layout.slotInstanceKey)
          throw new Error(`missing slot instance for cell ${layout.instanceId}`)
        const hosted = layout.content.kind === 'materials'
        const content: readonly ViewerRenderTree[] = !hosted
          ? [viewerText(layout.resolvedText ?? layout.content.text)]
          : [viewerElement('div', { style: {
              position: 'absolute',
              left: `${layout.contentRect.x - layout.rect.x}${input.layout.unit}`,
              top: `${layout.contentRect.y - layout.rect.y}${input.layout.unit}`,
              width: `${layout.contentRect.width}${input.layout.unit}`,
              height: `${layout.contentRect.height}${input.layout.unit}`,
              overflow: layout.clip ? 'hidden' : 'visible',
              'box-sizing': 'border-box',
            } }, [input.renderSlot(layout.slotInstanceKey!)])]
        const children = [...content, ...layout.paintStyle.edges.map(edge => paintEdge(edge, input.layout.unit))]
        return viewerElement(cell.tag, {
          attributes,
          style: {
            width: `${layout.rect.width}${input.layout.unit}`,
            height: `${layout.rect.height}${input.layout.unit}`,
            ...paintStyle(layout.paintStyle, input.layout.unit, hosted),
          },
        }, children)
      }),
    )),
  ))
  const attributes: Record<string, string | number | boolean> = {}
  if (input.accessibility.decorative) attributes.role = 'presentation'
  const descriptionId = `table-description-${encodeTableOpaqueIdPart(input.fragmentId ?? 'unfragmented-test')}`
  if (input.accessibility.description) attributes['aria-describedby'] = descriptionId
  const captionChildren: ViewerRenderTree[] = []
  if (input.accessibility.caption) captionChildren.push(viewerText(input.accessibility.caption))
  if (input.accessibility.description) captionChildren.push(viewerElement('span', {
    attributes: { id: descriptionId },
    style: { position: 'absolute', left: '-10000px', width: '1px', height: '1px', overflow: 'hidden' },
  }, [viewerText(input.accessibility.description)]))
  const caption = captionChildren.length ? [viewerElement('caption', {}, captionChildren)] : []
  const colgroup = viewerElement('colgroup', {}, input.layout.columnWidths.map(width =>
    viewerElement('col', { style: { width: `${width}${input.layout.unit}` } }, [])))
  const contentWidth = input.layout.contentWidth ?? input.layout.width
  const viewportWidth = input.layout.viewportWidth ?? input.layout.width
  const table = viewerElement('table', {
    attributes: { ...attributes, dir: input.layout.direction },
    style: {
      width: `${contentWidth}${input.layout.unit}`, height: `${input.layout.height}${input.layout.unit}`, 'table-layout': 'fixed',
      'border-collapse': 'separate', 'border-spacing': '0',
      ...(input.layout.direction === 'rtl' && contentWidth > viewportWidth
        ? { transform: `translateX(-${contentWidth - viewportWidth}${input.layout.unit})` } : {}),
    },
  }, [...caption, colgroup, ...groups])
  return viewerElement('div', {
    style: { width: `${viewportWidth}${input.layout.unit}`, overflow: 'hidden', position: 'relative' },
  }, [table])
}

function paintStyle(
  style: TableCellPaintStyle,
  unit: TableLayoutPlanData['unit'],
  hosted: boolean,
): Record<string, string> {
  return {
    position: 'relative',
    'box-sizing': 'border-box',
    overflow: style.overflow,
    'padding-top': hosted ? '0' : `${style.padding.top}${unit}`,
    'padding-right': hosted ? '0' : `${style.padding.right}${unit}`,
    'padding-bottom': hosted ? '0' : `${style.padding.bottom}${unit}`,
    'padding-left': hosted ? '0' : `${style.padding.left}${unit}`,
    ...(style.backgroundColor !== undefined ? { 'background-color': style.backgroundColor } : {}),
    ...(style.color !== undefined ? { color: style.color } : {}),
    'font-family': style.fontFamily,
    'font-size': `${style.fontSize}${unit}`,
    'font-weight': style.fontWeight,
    'font-style': style.fontStyle,
    'line-height': String(style.lineHeight),
    'letter-spacing': `${style.letterSpacing}${unit}`,
    'text-align': style.textAlign,
    'vertical-align': style.verticalAlign,
    'white-space': style.whiteSpace,
    'overflow-wrap': style.overflowWrap,
  }
}

function paintEdge(edge: TablePaintEdge, unit: TableLayoutPlanData['unit']): ViewerRenderTree {
  const horizontal = edge.side === 'top' || edge.side === 'bottom'
  const style: Record<string, string> = {
    position: 'absolute',
    width: horizontal ? `${edge.length}${unit}` : '0',
    height: horizontal ? '0' : `${edge.length}${unit}`,
    ...(horizontal ? { left: `${edge.offset}${unit}` } : { top: `${edge.offset}${unit}` }),
    ...(edge.side === 'top' ? { top: '0' } : {}),
    ...(edge.side === 'right' ? { right: '0' } : {}),
    ...(edge.side === 'bottom' ? { bottom: '0' } : {}),
    ...(edge.side === 'left' ? { left: '0' } : {}),
    [horizontal ? 'border-top' : 'border-left']:
      `${edge.declaration.width}${unit} ${edge.declaration.style} ${edge.declaration.color}`,
  }
  return viewerElement('span', { attributes: { 'aria-hidden': true }, style }, [])
}
```

Add the measured-fragment selector to `runtime-layout.ts`:

```ts
export function selectRuntimeFragmentLayout(
  layout: TableLayoutPlanData,
  pagination: TablePaginationContract,
  unitKeys: readonly string[],
): TableLayoutPlanData {
  const unitByKey = new Map(pagination.units.map(unit => [unit.key, unit]))
  const units = unitKeys.map((key) => {
    const unit = unitByKey.get(key)
    if (!unit) throw new Error(`table fragment references unknown unit key ${key}`)
    return unit
  })
  const rows = layout.rows.filter(row => units.some(unit => unit.kind === 'detail'
    ? unit.runtimeRowId === row.runtimeRowId
    : unit.bandId === row.bandId))
  if (!rows.length) throw new Error('table fragment render payload selects no measured rows')
  const rowInstances = new Set(rows.map(row => row.instanceId))
  const start = Math.min(...rows.map(row => row.rect.y))
  const shiftedRows = rows.map(row => ({ ...row, rect: { ...row.rect, y: row.rect.y - start } }))
  const selectedCells = layout.cells.filter(cell => rowInstances.has(cell.rowInstanceId))
  const cellsWithBoundary = carryFragmentTopBoundary(layout.cells, selectedCells, start)
  const cells = cellsWithBoundary
    .map(cell => ({
      ...cell,
      rect: { ...cell.rect, y: cell.rect.y - start },
      contentRect: { ...cell.contentRect, y: cell.contentRect.y - start },
    }))
  const height = shiftedRows.reduce((max, row) => Math.max(max, row.rect.y + row.rect.height), 0)
  return {
    width: layout.width, height, unit: layout.unit, direction: layout.direction, cells, rows: shiftedRows,
    columnIds: layout.columnIds, columnWidths: layout.columnWidths,
    rowHeights: shiftedRows.map(row => row.rect.height),
  }
}

function carryFragmentTopBoundary(
  allCells: readonly TableCellLayout[],
  selectedCells: readonly TableCellLayout[],
  start: number,
): TableCellLayout[] {
  if (start === 0) return selectedCells.map(cell => ({ ...cell, paintStyle: { ...cell.paintStyle, edges: [...cell.paintStyle.edges] } }))
  const result = selectedCells.map(cell => ({ ...cell, paintStyle: { ...cell.paintStyle, edges: [...cell.paintStyle.edges] } }))
  const topCells = result.filter(cell => cell.rect.y === start)
  for (const owner of allCells) {
    for (const edge of owner.paintStyle.edges) {
      if (edge.side !== 'bottom' || owner.rect.y + owner.rect.height !== start) continue
      const edgeStart = owner.rect.x + edge.offset
      const edgeEnd = edgeStart + edge.length
      for (const target of topCells) {
        const overlapStart = Math.max(edgeStart, target.rect.x)
        const overlapEnd = Math.min(edgeEnd, target.rect.x + target.rect.width)
        if (overlapEnd <= overlapStart) continue
        target.paintStyle.edges.push({
          side: 'top', offset: overlapStart - target.rect.x, length: overlapEnd - overlapStart,
          declaration: { ...edge.declaration },
        })
      }
    }
  }
  return result
}
```

The production selector must not keep the illustrative full-array `filter/some` scans above. While appending each measured unit, record its contiguous row/cell slices in `layout.fragmentFacts[unitKey]` and index resolved horizontal boundary edges by canonical numeric offset string in `boundaryEdgesByOffset`; reserve both index entries as layout facts. `selectRuntimeFragmentLayout` binary-resolves the first unit, validates contiguous keys, slices only those row/cell ranges, and copies only the indexed top boundary. Add a visit-count test across thousands of pages proving each fragment touches `O(log N + fragment facts)` and never scans all rows/cells/edges.

Wire the final Viewer prerequisite fields directly:

```ts
// packages/materials/table/static/src/viewer.ts
import type { MaterialViewerExtension, MaterialViewerLayoutFacet } from '@easyink/core'
import { createLayoutConstraintKey } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { TableLayoutPlanData, TableModel } from '@easyink/material-table-kernel'
import {
  buildTableAccessibilityPlan, buildTableLayoutPlan, buildTableViewerTree, createTableMaterialLayoutPlan,
} from '@easyink/material-table-kernel'

export const tableStaticViewerLayoutFacet: MaterialViewerLayoutFacet = {
  async measure(request) {
    const model = request.resolvedModel as unknown as TableModel
    const layout = await buildTableLayoutPlan({
      model,
      constraints: request.constraints,
      direction: model.style.typography?.direction === 'rtl' ? 'rtl' : 'ltr',
      scope: request.scope,
      instanceKey: request.instanceKey,
      signal: request.signal,
      resolveText: cell => cell.content.kind === 'text' && cell.content.bindingPort
        ? tableText(request.formatBinding(cell.content.bindingPort), cell.content.text)
        : cell.content.kind === 'text' ? cell.content.text : '',
      measureText: request.measureText,
      measureSlot: request.measureSlot,
      budget: request.budget,
      schedule: request.schedule,
    })
    return createTableMaterialLayoutPlan({
      nodeId: request.node.id, instanceKey: request.instanceKey, nodeRevision: request.nodeRevision,
      constraintKey: createLayoutConstraintKey(request.constraints), layout,
    })
  },
}

export const tableStaticViewerExtension: MaterialViewerExtension = {
  render(node: MaterialNode, context) {
    const model = node.model as unknown as TableModel
    const layout = context.layoutPlan.payload as TableLayoutPlanData
    context.renderBudget.reserveNodes('element', countTableRenderElements(layout))
    context.renderBudget.reserveNodes('text', countTableRenderTexts(layout))
    return { tree: buildTableViewerTree({
      model, layout, instanceKey: context.instanceKey,
      fragmentId: context.fragmentPlan.id,
      accessibility: buildTableAccessibilityPlan(model, layout, context.fragmentPlan), renderSlot: context.renderSlot,
    }) }
  },
}

function tableText(result: ReturnType<MaterialDisplayBindingResolver>, fallback = ''): string {
  return result.status === 'resolved' ? result.text : fallback
}
```

```ts
// packages/materials/table/data/src/viewer.ts
import type { MaterialRuntimeScope, MaterialViewerExtension, MaterialViewerLayoutFacet } from '@easyink/core'
import { createLayoutConstraintKey } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { PaginatedTablePayload } from './pagination'
import type { TableModel } from '@easyink/material-table-kernel'
import {
  buildTableAccessibilityPlan, buildTableViewerTree, createTableMaterialLayoutPlan, createTableRecordScope,
} from '@easyink/material-table-kernel'
import { createOpenedRuntimeRecordSource, createRuntimeRows } from './runtime-rows'
import { createTableFragmentAdapter, withTablePagination } from './pagination'
import { buildDataRuntimeTableLayout, selectRuntimeFragmentLayout } from './runtime-layout'

export const tableDataViewerLayoutFacet: MaterialViewerLayoutFacet = {
  async measure(request) {
    const model = request.resolvedModel as unknown as TableModel
    if (!model.data) throw new Error('table-data runtime requires data configuration')
    if (request.mode === 'authoring-preview') {
      const layout = await buildTableLayoutPlan({
        model, constraints: request.constraints, direction: model.style.typography?.direction === 'rtl' ? 'rtl' : 'ltr',
        scope: request.scope, instanceKey: request.instanceKey, signal: request.signal,
        resolveText: cell => cell.content.kind === 'text' ? cell.content.text : '',
        measureText: request.measureText, measureSlot: request.measureSlot,
        budget: request.budget, schedule: request.schedule,
      })
      return createTableMaterialLayoutPlan({
        nodeId: request.node.id, instanceKey: request.instanceKey, nodeRevision: request.nodeRevision,
        constraintKey: createLayoutConstraintKey(request.constraints), layout,
      })
    }
    const recordScope = (record: Record<string, unknown>, recordIndex: number): MaterialRuntimeScope =>
      createTableRecordScope(request.scope, `revision:${request.dataRevision}:index:${recordIndex}`, record)
    const detailKeyPort = model.data.detailKeyPort
    const collection = await request.openCollection(model.data.collectionPort, request.scope, request.signal)
    const rows = createRuntimeRows({
      dataRevision: request.dataRevision,
      source: createOpenedRuntimeRecordSource(collection),
      ...(detailKeyPort ? {
        readDetailKey: (record: Record<string, unknown>, recordIndex: number) => {
          const key = request.resolveBinding(detailKeyPort, recordScope(record, recordIndex))
          return key.status === 'resolved' ? key.value : undefined
        },
      } : {}),
    })
    const result = await buildDataRuntimeTableLayout({
      nodeId: request.node.id,
      instanceKey: request.instanceKey,
      model,
      width: request.constraints.availableWidth,
      unit: request.constraints.unit,
      direction: model.style.typography?.direction === 'rtl' ? 'rtl' : 'ltr',
      rows,
      chunkSize: 256,
      pageContentHeight: request.constraints.availableHeight,
      scope: request.scope,
      resolveText: (cell, scope) => cell.content.kind === 'text' && cell.content.bindingPort
        ? tableText(request.formatBinding(cell.content.bindingPort, scope), cell.content.text)
        : cell.content.kind === 'text' ? cell.content.text : '',
      measureText: request.measureText,
      measureSlot: request.measureSlot,
      signal: request.signal,
      budget: request.budget,
      schedule: request.schedule,
    })
    const base = createTableMaterialLayoutPlan({
      nodeId: request.node.id, instanceKey: request.instanceKey, nodeRevision: request.nodeRevision,
      constraintKey: createLayoutConstraintKey(request.constraints), layout: result.layout,
      diagnostics: result.runtimeDiagnostics,
    })
    return withTablePagination(base, result.pagination)
  },
  fragment: createTableFragmentAdapter(),
}

export const tableDataViewerExtension: MaterialViewerExtension = {
  render(node: MaterialNode, context) {
    const model = node.model as unknown as TableModel
    const payload = context.layoutPlan.payload as PaginatedTablePayload
    const renderPayload = context.fragmentPlan.renderPayload as { unitKeys?: readonly string[] } | undefined
    if (!renderPayload?.unitKeys) throw new Error('table fragment unit keys are required')
    const layout = selectRuntimeFragmentLayout(payload.layout, payload.pagination, renderPayload.unitKeys)
    context.renderBudget.reserveNodes('element', countTableRenderElements(layout))
    context.renderBudget.reserveNodes('text', countTableRenderTexts(layout))
    return { tree: buildTableViewerTree({
      model, layout, instanceKey: context.instanceKey,
      fragmentId: context.fragmentPlan.id,
      accessibility: buildTableAccessibilityPlan(model, layout, context.fragmentPlan), renderSlot: context.renderSlot,
    }) }
  },
}

```

Export both modules. Designer and Viewer manifests reference these exact same layout facet objects. `authoring-preview` takes the explicit template-only branch and never calls `openCollection`, creates runtime rows, or installs the Viewer extension. Authoritative data layout consumes the host prepared cursor; inline arrays are only the core opener's budgeted fallback. Raw collection/detail-key resolution never runs display formatting, while text cells use `formatBinding` and fall back to persisted `cell.text` on unbound/missing/invalid values. Reserve runtime rows, rows/cells/edges/slots/index facts before each allocation and use the host bounded scheduler for chunk/cell measurement. Every abort/error path closes rows exactly once. Render reserves the effective host token for the actual table/group/colgroup/col/row/cell/text/slot/shared-edge nodes before building; the core/browser final audit still catches under-reporting. Paint only selects indexed measured facts and saved slot instances; it never rebinds, measures, expands records, or repeats visible headers.

- [ ] **Step 5: Run runtime layout, semantic output, and Viewer security tests**

Run: `pnpm exec vitest run --dom packages/materials/table/data/src/runtime-layout.test.ts packages/materials/table/kernel/src/viewer-tree.test.ts packages/materials/table/static/src/viewer.test.ts packages/materials/table/data/src/viewer.test.ts packages/viewer/src/render-tree-dom.test.ts`

Expected: PASS; detail heights are independent, empty input has zero details, every runtime DOM ID includes `RuntimeRowId`, output contains semantic tree nodes but no trusted/raw HTML, and Viewer rendering performs no record expansion.

- [ ] **Step 6: Commit runtime table planning and semantic rendering**

```bash
git add packages/materials/table/data/src/runtime-layout.ts packages/materials/table/data/src/runtime-layout.test.ts packages/materials/table/data/src/index.ts packages/materials/table/kernel/src/viewer-tree.ts packages/materials/table/kernel/src/viewer-tree.test.ts packages/materials/table/kernel/src/accessibility.ts packages/materials/table/kernel/src/index.ts packages/materials/table/static/src/viewer.ts packages/materials/table/static/src/viewer.test.ts packages/materials/table/data/src/viewer.ts packages/materials/table/data/src/viewer.test.ts
git commit -m "feat(table): render measured runtime tables as semantic trees"
```

## Task 19: Lossless Legacy Table Migration

**Files:**
- Create: `packages/materials/table/kernel/src/legacy-migration.ts`
- Test: `packages/materials/table/kernel/src/legacy-migration.test.ts`
- Modify: `packages/materials/table/kernel/src/schema-adapter.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`

- [ ] **Step 1: Write a failing v0 conversion test with merges, bindings, and hosted elements**

```ts
// packages/materials/table/kernel/src/legacy-migration.test.ts
import { describe, expect, it } from 'vitest'
import type { AdaptableMaterialNode, SchemaAdapterContext } from '@easyink/core'
import { assertValidTableModel } from './model'
import { migrateLegacyTableV0ToV1 } from './legacy-migration'

const context: SchemaAdapterContext = { documentVersion: '0.0.30', documentUnit: 'mm', materialType: 'table-static' }

describe('legacy table v0 migration', () => {
  it('moves cell elements to stable slots and converts spans without losing the v0 payload', () => {
    const legacy: AdaptableMaterialNode = {
      id: 'legacy-table', type: 'table-static', x: 1, y: 2, width: 80, height: 16,
      modelVersion: 0,
      model: {
        borderWidth: 1, borderColor: '#111', borderType: 'solid', cellPadding: 2,
        table: {
          kind: 'static',
          topology: {
            columns: [{ ratio: 0.5 }, { ratio: 0.5 }],
            rows: [{ height: 8, role: 'normal', cells: [
              { colSpan: 2, content: { text: 'kept', elements: [child('nested')] }, staticBinding: { sourceId: 'orders', fieldPath: 'name' } },
              { content: { text: 'covered' } },
            ] }],
          },
          layout: { borderWidth: 1, borderColor: '#111', borderType: 'solid' },
        },
      },
      slots: {}, bindings: {}, output: { visibility: 'include' },
    }
    const migrated = migrateLegacyTableV0ToV1.migrate(legacy, context)
    const model = migrated.model as unknown as import('./model').TableModel
    expect(migrated.modelVersion).toBe(1)
    expect(model.merges).toHaveLength(1)
    expect(model.merges[0]!.inactiveCellIds).toHaveLength(1)
    const anchor = model.bands[0]!.rows[0]!.cells[0]!
    expect(anchor.content).toEqual({ kind: 'materials', slotId: `cell:${anchor.id}` })
    expect(migrated.slots?.[`cell:${anchor.id}`]).toEqual([child('nested')])
    expect(migrated.compat?.passthrough?.['easyink.table.v0']).toEqual(legacy.model)
    expect(() => assertValidTableModel(model)).not.toThrow()
    expect(() => assertJsonValue(migrated)).not.toThrow()
    expect(JSON.parse(JSON.stringify(migrated))).toEqual(migrated)
    expect(Object.hasOwn((model.bands[0]!.rows[0]!.cells[1]!.content as object), 'bindingPort')).toBe(false)
    expect(Object.hasOwn(model.bands[0]!.rows[0]!.cells[1]!, 'style')).toBe(false)
    expect(Object.hasOwn(model, 'data')).toBe(false)
  })

  it('rejects a data input with more than one repeat template before migration', () => {
    const node = legacyDataNode(['repeat-template', 'repeat-template'])
    expect(migrateLegacyTableV0ToV1.validateInput(node, { ...context, materialType: 'table-data' }))
      .toContainEqual(expect.objectContaining({ code: 'TABLE_LEGACY_DETAIL_TEMPLATE_COUNT', severity: 'error' }))
  })
})

function child(id: string) {
  return { id, type: 'text', x: 0, y: 0, width: 10, height: 4, modelVersion: 1, model: {}, slots: {}, bindings: {}, output: { visibility: 'include' as const } }
}

function legacyDataNode(roles: string[]): AdaptableMaterialNode {
  return {
    id: 'legacy-data', type: 'table-data', x: 0, y: 0, width: 80, height: 24, modelVersion: 0,
    model: { table: { kind: 'data', topology: { columns: [{ ratio: 1 }], rows: roles.map(role => ({ height: 8, role, cells: [{}] })) }, layout: {} } },
    slots: {}, bindings: {}, output: { visibility: 'include' },
  }
}
```

- [ ] **Step 2: Run the focused test and verify the migration is absent**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/legacy-migration.test.ts`

Expected: FAIL with `Failed to load url ./legacy-migration`.

- [ ] **Step 3: Implement deterministic v0 conversion without envelope mutation**

```ts
// packages/materials/table/kernel/src/legacy-migration.ts
import type { AdaptableMaterialNode, MaterialSchemaIssue, SchemaAdapterContext, SchemaMigration } from '@easyink/core'
import type { MaterialBinding, MaterialNodeInput } from '@easyink/schema'
import { deepClone, isObject } from '@easyink/shared'
import type {
  TableBand, TableBandRole, TableCell, TableCellContent, TableColumn, TableMergeRegion, TableModel, TableRow, TableStyle,
} from './model'

interface LegacyColumn { ratio?: number }
interface LegacyCell {
  rowSpan?: number
  colSpan?: number
  padding?: Partial<{ top: number, right: number, bottom: number, left: number }>
  typography?: Record<string, unknown>
  content?: { text?: string, elements?: MaterialNodeInput[] }
  binding?: MaterialBinding
  staticBinding?: MaterialBinding
}
interface LegacyRow { height?: number, role?: string, cells?: LegacyCell[] }
interface LegacyTable {
  kind?: string
  topology?: { columns?: LegacyColumn[], rows?: LegacyRow[] }
  layout?: { borderWidth?: number, borderColor?: string, borderType?: 'solid' | 'dashed' | 'dotted' }
  showHeader?: boolean
  showFooter?: boolean
}

function stableLegacyHash(value: unknown): string {
  const text = JSON.stringify(value ?? null)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index++) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193)
  return (hash >>> 0).toString(16).padStart(8, '0')
}

const materialId = <T extends string>(
  kind: T,
  nodeId: string,
  path: readonly number[],
  source: unknown,
) => `${kind}:legacy:${stableLegacyHash(nodeId)}:${path.join('.')}:${stableLegacyHash(source)}` as import('./model').TableId<T>

function issue(code: string, path: `/${string}`, message: string): MaterialSchemaIssue {
  return { code, severity: 'error', path, message }
}

function readLegacy(node: AdaptableMaterialNode): LegacyTable | undefined {
  return isObject(node.model) && isObject(node.model.table) ? node.model.table as LegacyTable : undefined
}

function role(kind: 'static' | 'data', value: string | undefined): TableBandRole {
  if (kind === 'static') return 'body'
  if (value === 'header') return 'header'
  if (value === 'footer') return 'footer'
  return value === 'repeat-template' ? 'detail' : 'body'
}

function tableStyle(model: Record<string, unknown>, table: LegacyTable): TableStyle {
  const padding = typeof model.cellPadding === 'number' ? model.cellPadding : 0
  const border = {
    width: table.layout?.borderWidth ?? (typeof model.borderWidth === 'number' ? model.borderWidth : 0),
    color: table.layout?.borderColor ?? (typeof model.borderColor === 'string' ? model.borderColor : '#000000'),
    style: table.layout?.borderType ?? (model.borderType === 'dashed' || model.borderType === 'dotted' ? model.borderType : 'solid'),
  } as const
  return {
    padding: { top: padding, right: padding, bottom: padding, left: padding },
    border: { blockStart: border, inlineEnd: border, blockEnd: border, inlineStart: border },
  }
}

function convert(node: AdaptableMaterialNode, legacy: LegacyTable): AdaptableMaterialNode {
  const kind = node.type === 'table-data' ? 'data' : 'static'
  const legacyColumns = legacy.topology!.columns!
  const legacyRows = legacy.topology!.rows!
  const columns: TableColumn[] = legacyColumns.map((column, index) => ({
    id: materialId('column', node.id, [index], column),
    track: { kind: 'fr', weight: typeof column.ratio === 'number' && column.ratio > 0 ? column.ratio : 1 },
  }))
  const slots = { ...(node.slots ?? {}) }
  const bindings = { ...node.bindings }
  const rowsByLegacyIndex: TableRow[] = []
  const convertedRows = legacyRows.map((legacyRow, rowIndex): { role: TableBandRole, row: TableRow } => {
    const rowId = materialId('row', node.id, [rowIndex], legacyRow)
    const cells = columns.map((column, columnIndex): TableCell => {
      const legacyCell = legacyRow.cells?.[columnIndex] ?? {}
      const cellId = materialId('cell', node.id, [rowIndex, columnIndex], legacyCell)
      const elements = legacyCell.content?.elements
      let content: TableCellContent
      if (Array.isArray(elements) && elements.length) {
        const slotId = `cell:${cellId}`
        slots[slotId] = deepClone(elements)
        content = { kind: 'materials', slotId }
      }
      else {
        const binding = legacyCell.staticBinding ?? legacyCell.binding
        const bindingPort = binding ? `cell:${cellId}:value` : undefined
        if (binding && bindingPort) bindings[bindingPort] = deepClone(binding)
        content = {
          kind: 'text', text: legacyCell.content?.text ?? '',
          ...(bindingPort ? { bindingPort } : {}),
        }
      }
      return {
        id: cellId, columnId: column.id, content,
        ...(legacyCell.padding ? { style: { padding: legacyCell.padding } } : {}),
      }
    })
    const row: TableRow = { id: rowId, minHeight: typeof legacyRow.height === 'number' ? legacyRow.height : 0, cells }
    rowsByLegacyIndex.push(row)
    return { role: role(kind, legacyRow.role), row }
  })

  const bands: TableBand[] = []
  for (const entry of convertedRows) {
    let band = bands.at(-1)
    if (!band || band.role !== entry.role) {
      band = { id: materialId('band', node.id, [bands.length], { role: entry.role }), role: entry.role, rows: [] }
      bands.push(band)
    }
    band.rows.push(entry.row)
  }
  if (kind === 'data' && legacy.showHeader === false) bands.splice(0, bands.length, ...bands.filter(band => band.role !== 'header'))
  if (kind === 'data' && legacy.showFooter === false) bands.splice(0, bands.length, ...bands.filter(band => band.role !== 'footer'))

  const merges: TableMergeRegion[] = []
  legacyRows.forEach((legacyRow, rowIndex) => legacyRow.cells?.forEach((legacyCell, columnIndex) => {
    const rowSpan = Math.max(1, Math.trunc(legacyCell.rowSpan ?? 1))
    const colSpan = Math.max(1, Math.trunc(legacyCell.colSpan ?? 1))
    if (rowSpan === 1 && colSpan === 1) return
    const selectedRows = rowsByLegacyIndex.slice(rowIndex, rowIndex + rowSpan)
    const selectedColumns = columns.slice(columnIndex, columnIndex + colSpan)
    const selectedCells = selectedRows.flatMap(row => selectedColumns.map(column => row.cells.find(cell => cell.columnId === column.id)!))
    const anchor = rowsByLegacyIndex[rowIndex]?.cells[columnIndex]
    if (!anchor) return
    merges.push({
      id: materialId('merge', node.id, [merges.length], { rowIndex, columnIndex, rowSpan, colSpan }), anchorCellId: anchor.id,
      rowIds: selectedRows.map(row => row.id), columnIds: selectedColumns.map(column => column.id),
      inactiveCellIds: selectedCells.filter(cell => cell.id !== anchor.id).map(cell => cell.id),
    })
  }))

  const model: TableModel = {
    kind, columns, bands, merges, style: tableStyle(node.model, legacy),
    ...(kind === 'data' ? { data: {
      collectionPort: bindings.records ? 'records' : bindings.value ? 'value' : 'records',
    } } : {}),
  }
  return {
    ...node,
    modelVersion: 1,
    model: model as unknown as Record<string, unknown>,
    slots,
    bindings,
    compat: {
      ...node.compat,
      materials: {
        ...node.compat?.materials,
        [node.type]: { v0: deepClone(node.model) },
      },
    },
  }
}

export const migrateLegacyTableV0ToV1: SchemaMigration & {
  validateInput: (node: AdaptableMaterialNode, context: SchemaAdapterContext) => readonly MaterialSchemaIssue[]
} = {
  from: 0,
  to: 1,
  validateInput(node) {
    const table = readLegacy(node)
    if (!table || !table.topology || !Array.isArray(table.topology.columns) || !table.topology.columns.length
      || !Array.isArray(table.topology.rows) || !table.topology.rows.length)
      return [issue('TABLE_LEGACY_TOPOLOGY_INVALID', '/model/table/topology', 'legacy table topology must contain rows and columns')]
    if (node.type === 'table-data') {
      const unsupported = table.topology.rows.findIndex(row => !['header', 'repeat-template', 'footer'].includes(row.role ?? ''))
      if (unsupported >= 0)
        return [issue('TABLE_LEGACY_DATA_ROLE_INVALID', `/model/table/topology/rows/${unsupported}/role`, 'legacy data rows must be header, repeat-template, or footer')]
      const details = table.topology.rows.filter(row => row.role === 'repeat-template')
      if (details.length !== 1)
        return [issue('TABLE_LEGACY_DETAIL_TEMPLATE_COUNT', '/model/table/topology/rows', 'legacy data table requires exactly one repeat template')]
    }
    return []
  },
  migrate(node) {
    const table = readLegacy(node)
    if (!table) return node
    return convert(node, table)
  },
}
```

Update `tableSchemaAdapter`:

```ts
import { migrateLegacyTableV0ToV1 } from './legacy-migration'

export const tableSchemaAdapter: SchemaAdapter = {
  currentModelVersion: 1,
  modelUnitPolicy: 'convertible',
  migrations: [migrateLegacyTableV0ToV1],
  validateInput(node, context) {
    return node.modelVersion === 0
      ? migrateLegacyTableV0ToV1.validateInput(node, context)
      : decodeTableModelV1(node.model, '/model').issues
  },
  normalize(node) {
    const cloned = deepClone(node)
    if (cloned.modelVersion !== 1) return cloned
    const decoded = decodeTableModelV1(cloned.model, '/model')
    return decoded.value ? { ...cloned, model: decoded.value } : cloned
  },
  validate(node) {
    const decoded = decodeTableModelV1(node.model, '/model')
    if (decoded.issues.length) return decoded.issues
    try {
      const model = decoded.value!
      assertValidTableModel(model)
      if ((node.type === 'table-static') !== (model.kind === 'static'))
        return [issue(`material type ${node.type} does not match table kind ${model.kind}`)]
      return validateTableEnvelopeReferences(node, model)
    }
    catch (error) {
      return [issue(error instanceof Error ? error.message : String(error))]
    }
  },
  convertModelUnits(model, from, to) {
    return convertTableModelUnits(model as unknown as TableModel, from, to) as unknown as Record<string, unknown>
  },
  introspect(node) { return tableIntrospection(node as MaterialNode<TableModel>) },
}
```

Do not persist a migration diagnostic or a dual table model. The full legacy private payload under the adapter-owned `compat.materials[node.type].v0` namespace is the extraction fallback and can be removed only by a future explicit compatibility policy. Assert the migrated node is strict JSON and JSON-round-trips without any own-key `undefined`. A quarantined node does not publish table-private identities: the loader exposes only its standard document node ID and recursively admitted canonical slots until the adapter becomes valid again.

- [ ] **Step 4: Run migration, adapter, and recursive schema tests**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/legacy-migration.test.ts packages/materials/table/kernel/src/schema-adapter.test.ts packages/schema/src/codec.test.ts`

Expected: PASS; valid v0 input produces a canonical v1 private model and dynamic slots, while an incompatible detail-template count is rejected before migration and the original node remains extractable.

- [ ] **Step 5: Commit the legacy migration**

```bash
git add packages/materials/table/kernel/src/legacy-migration.ts packages/materials/table/kernel/src/legacy-migration.test.ts packages/materials/table/kernel/src/schema-adapter.ts packages/materials/table/kernel/src/index.ts
git commit -m "feat(table): migrate legacy tables without data loss"
```

## Task 20: Complete Table Manifests And Built-In Package Assembly

**Files:**
- Create: `packages/materials/table/kernel/src/properties.ts`
- Test: `packages/materials/table/kernel/src/properties.test.ts`
- Modify: `packages/materials/table/static/src/manifest.ts`
- Modify: `packages/materials/table/data/src/manifest.ts`
- Modify: `packages/materials/table/static/src/index.ts`
- Modify: `packages/materials/table/data/src/index.ts`
- Modify: `packages/materials/table/static/src/ai.ts`
- Modify: `packages/materials/table/data/src/ai.ts`
- Modify: `packages/builtin/src/types.ts`
- Modify: `packages/builtin/src/basic.ts`
- Modify: `packages/builtin/src/all.ts`
- Modify: `packages/builtin/src/none.ts`
- Modify: `packages/builtin/src/index.ts`
- Modify: `packages/builtin/src/index.test.ts`
- Modify: `packages/builtin/src/conformance.test.ts`
- Modify: `packages/schema/src/codec.test.ts`

- [ ] **Step 1: Write failing manifest assembly, default-node, and admission tests**

Add to `packages/builtin/src/index.test.ts`:

```ts
import { loadDocumentWithProfile } from '@easyink/core'
import { tableDataMaterialManifest } from '@easyink/material-table-data'
import { tableStaticMaterialManifest } from '@easyink/material-table-static'
import { builtinAllMaterialPackage, builtinBasicMaterialPackage, builtinNoneMaterialPackage, compileBuiltinMaterialProfile } from './index'

it('assembles each table manifest once through built-in packages', () => {
  for (const pkg of [builtinBasicMaterialPackage, builtinAllMaterialPackage]) {
    expect(pkg.manifests.filter(manifest => manifest.type === 'table-static')).toEqual([tableStaticMaterialManifest])
    expect(pkg.manifests.filter(manifest => manifest.type === 'table-data')).toEqual([tableDataMaterialManifest])
  }
  expect(builtinNoneMaterialPackage.manifests).toEqual([])
  expect(tableStaticMaterialManifest.common.layout.fragmentation).toBe('none')
  expect(tableDataMaterialManifest.common.layout.fragmentation).toBe('break-opportunities')
})

it('creates canonical table defaults and admits a valid legacy table through the same profile', () => {
  const profile = compileBuiltinMaterialProfile('basic')
  expect(profile.createNode('table-data', { id: 'new-table' })).toMatchObject({
    id: 'new-table', type: 'table-data', modelVersion: 1,
    slots: {}, bindings: {}, output: { visibility: 'include' },
    model: { kind: 'data' },
  })
  const loaded = loadDocumentWithProfile({
    unit: 'mm', page: { mode: 'fixed', width: 100, height: 100 },
    elements: [{
      id: 'legacy-table', type: 'table-static', x: 0, y: 0, width: 80, height: 8,
      props: { cellPadding: 1 },
      table: { kind: 'static', topology: { columns: [{ ratio: 1 }], rows: [{ height: 8, role: 'normal', cells: [{ content: { text: 'A' } }] }] }, layout: {} },
    }],
  }, profile)
  expect(loaded.nodeStates.get('legacy-table')).toMatchObject({ status: 'ready' })
  expect(loaded.schema.elements[0]).toMatchObject({ modelVersion: 1, model: { kind: 'static' } })
  expect(JSON.stringify(loaded.schema.elements[0])).not.toMatch(/"(?:props|binding|children|table)"\s*:/)
})
```

Add a quarantine case to `packages/schema/src/codec.test.ts` using `loadDocumentWithProfile`: a `table-data` v0 input with two `repeat-template` rows must preserve its source node, set `nodeStates.get(id)` to `{ status: 'quarantined', code: 'TABLE_LEGACY_DETAIL_TEMPLATE_COUNT', stage: 'validate-input' }`, and emit no persisted `editorState.diagnostics`.

- [ ] **Step 2: Run assembly and conformance tests and verify incomplete manifests fail**

Run: `pnpm exec vitest run --dom packages/builtin/src/index.test.ts packages/builtin/src/conformance.test.ts packages/schema/src/codec.test.ts`

Expected: FAIL because the foundation-created table manifest shells do not yet expose the new defaults, adapters, semantic facets, or package assembly.

- [ ] **Step 3: Add model-backed property descriptors**

```ts
// packages/materials/table/kernel/src/properties.ts
import type { PropertyDescriptor } from '@easyink/core'
import { createModelPropertyAccessor } from '@easyink/core'

export const tableCommonPropertyDescriptors: readonly PropertyDescriptor[] = [
  { key: 'background', label: 'designer.property.background', type: 'color', group: 'table-appearance', accessor: createModelPropertyAccessor('/style/background') },
  { key: 'overflow', label: 'designer.property.overflow', type: 'enum', group: 'table-layout',
    enum: [{ label: 'Clip', value: 'clip' }, { label: 'Visible', value: 'visible' }], accessor: createModelPropertyAccessor('/style/overflow') },
  { key: 'paddingTop', label: 'designer.property.paddingTop', type: 'number', group: 'table-layout', min: 0, step: 0.1,
    accessor: createModelPropertyAccessor('/style/padding/top') },
  { key: 'paddingRight', label: 'designer.property.paddingRight', type: 'number', group: 'table-layout', min: 0, step: 0.1,
    accessor: createModelPropertyAccessor('/style/padding/right') },
  { key: 'paddingBottom', label: 'designer.property.paddingBottom', type: 'number', group: 'table-layout', min: 0, step: 0.1,
    accessor: createModelPropertyAccessor('/style/padding/bottom') },
  { key: 'paddingLeft', label: 'designer.property.paddingLeft', type: 'number', group: 'table-layout', min: 0, step: 0.1,
    accessor: createModelPropertyAccessor('/style/padding/left') },
  { key: 'fontSize', label: 'designer.property.fontSize', type: 'number', group: 'table-typography', min: 1, step: 0.1,
    accessor: createModelPropertyAccessor('/style/typography/fontSize') },
  { key: 'textColor', label: 'designer.property.color', type: 'color', group: 'table-typography',
    accessor: createModelPropertyAccessor('/style/typography/color') },
]
```

The property test creates a profile-owned table node, writes each descriptor through its accessor, reads it back, and verifies every declared path starts under `/model/style`; no descriptor reads legacy root `props` or `table`.

- [ ] **Step 4: Complete both package-local manifests**

```ts
// packages/materials/table/static/src/manifest.ts
import type { MaterialDesignerFacet, MaterialExtensionContext, MaterialViewerFacet } from '@easyink/core'
import { defineMaterialManifest } from '@easyink/core'
import { tableCommonPropertyDescriptors, tableContextualProperties, tableSchemaAdapter } from '@easyink/material-table-kernel'
import { tableStaticAIMaterialDescriptor } from './ai'
import { createTableStaticExtension } from './designer'
import { tableStaticLocaleMessages } from './locale'
import { createDefaultStaticTableModel, TABLE_STATIC_TYPE } from './schema'
import { tableStaticViewerExtension, tableStaticViewerLayoutFacet } from './viewer'

export const tableStaticMaterialManifest = defineMaterialManifest<MaterialDesignerFacet, MaterialViewerFacet>({
  manifestVersion: 1,
  apiVersion: 1,
  engineRange: { min: '0.0.30', maxExclusive: '0.1.0' },
  type: TABLE_STATIC_TYPE,
  modelVersion: 1,
  common: {
    nameKey: 'materials.tableStatic.name', category: 'data', iconKey: 'table',
    defaultNode: { width: 180, height: 24, unit: 'mm', model: createDefaultStaticTableModel() as unknown as Record<string, unknown> },
    interaction: { rotatable: false, resizable: true, supportsAnimation: false, supportsUnionDrop: true },
    binding: { kind: 'ports', ports: [{
      id: 'cell-value', key: { kind: 'prefix', value: 'cell:' }, role: 'display', valueShape: 'scalar',
      formatEditor: { tabs: ['preset'] },
    }] },
    layout: { intrinsicSize: 'height', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
    structure: { slots: [{
      id: 'table-cell-free', key: { kind: 'prefix', value: 'cell:' }, coordinateSpace: 'slot',
      layoutParticipation: 'owner', reparent: 'allowed',
    }] },
    properties: tableCommonPropertyDescriptors,
  },
  schemaAdapter: tableSchemaAdapter,
  facets: {
    designer: context => ({
      extension: createTableStaticExtension(context.services as MaterialExtensionContext),
      catalog: { group: 'data', order: 60 }, localeMessages: tableStaticLocaleMessages,
      layout: tableStaticViewerLayoutFacet, contextualProperties: tableContextualProperties,
    }),
    viewer: () => ({
      extension: tableStaticViewerExtension, layout: tableStaticViewerLayoutFacet, capabilities: {},
    }),
    ai: {
      generation: {
        enabled: true,
        modelSchema: { type: 'object', required: ['kind', 'columns', 'bands', 'merges', 'style'], additionalProperties: false },
        bindingShape: { type: 'object', additionalProperties: { type: 'object' } },
        requiredModelPaths: ['/columns', '/bands'], examples: [createDefaultStaticTableModel()],
      },
      descriptor: tableStaticAIMaterialDescriptor as unknown as Record<string, unknown>,
    },
  },
})
```

```ts
// packages/materials/table/data/src/manifest.ts
import type { MaterialDesignerFacet, MaterialExtensionContext, MaterialViewerFacet } from '@easyink/core'
import { defineMaterialManifest } from '@easyink/core'
import { tableCommonPropertyDescriptors, tableContextualProperties, tableSchemaAdapter } from '@easyink/material-table-kernel'
import { tableDataAIMaterialDescriptor } from './ai'
import { createTableDataExtension } from './designer'
import { tableDataLocaleMessages } from './locale'
import { createDefaultDataTableModel, TABLE_DATA_TYPE } from './schema'
import { tableDataViewerExtension, tableDataViewerLayoutFacet } from './viewer'

export const tableDataMaterialManifest = defineMaterialManifest<MaterialDesignerFacet, MaterialViewerFacet>({
  manifestVersion: 1,
  apiVersion: 1,
  engineRange: { min: '0.0.30', maxExclusive: '0.1.0' },
  type: TABLE_DATA_TYPE,
  modelVersion: 1,
  common: {
    nameKey: 'materials.tableData.name', category: 'data', iconKey: 'table-properties',
    defaultNode: { width: 180, height: 40, unit: 'mm', model: createDefaultDataTableModel() as unknown as Record<string, unknown> },
    interaction: { rotatable: false, resizable: true, supportsAnimation: false, supportsUnionDrop: true },
    binding: { kind: 'ports', ports: [
      { id: 'records', key: { kind: 'exact', value: 'records' }, role: 'semantic', valueShape: 'record-array', formatEditor: false },
      { id: 'detail-key', key: { kind: 'exact', value: 'detailKey' }, role: 'semantic', valueShape: 'scalar', formatEditor: false },
      { id: 'cell-value', key: { kind: 'prefix', value: 'cell:' }, role: 'display', valueShape: 'scalar', formatEditor: { tabs: ['preset'] } },
    ] },
    layout: { intrinsicSize: 'height', fragmentation: 'break-opportunities', pageRepeat: 'none', overflow: 'clip' },
    structure: { slots: [{
      id: 'table-cell-free', key: { kind: 'prefix', value: 'cell:' }, coordinateSpace: 'slot',
      layoutParticipation: 'owner', reparent: 'allowed',
    }] },
    properties: tableCommonPropertyDescriptors,
  },
  schemaAdapter: tableSchemaAdapter,
  facets: {
    designer: context => ({
      extension: createTableDataExtension(context.services as MaterialExtensionContext),
      catalog: { group: 'data', order: 61 }, localeMessages: tableDataLocaleMessages,
      layout: tableDataViewerLayoutFacet, contextualProperties: tableContextualProperties,
    }),
    viewer: () => ({
      extension: tableDataViewerExtension, layout: tableDataViewerLayoutFacet, capabilities: {},
    }),
    ai: {
      generation: {
        enabled: true,
        modelSchema: { type: 'object', required: ['kind', 'columns', 'bands', 'merges', 'style', 'data'], additionalProperties: false },
        bindingShape: { type: 'object', properties: { records: { type: 'object' }, detailKey: { type: 'object' } }, additionalProperties: { type: 'object' } },
        requiredModelPaths: ['/columns', '/bands', '/data/collectionPort'], examples: [createDefaultDataTableModel()],
      },
      descriptor: tableDataAIMaterialDescriptor as unknown as Record<string, unknown>,
    },
  },
})
```

Update both AI descriptors so their schema rules name `model.columns`, `model.bands`, named binding ports, and the exactly-one-row detail template; remove `props`, root `table`, `repeat-template`, virtual preview rows, and `showHeader/showFooter` instructions. Export each manifest from its package index.

- [ ] **Step 5: Assemble manifests only through built-in package registrations**

Add `tableStaticMaterialManifest` and `tableDataMaterialManifest` once to `builtinBasicMaterialPackage.manifests`; `builtinAllMaterialPackage` reuses that basic manifest list when composing the superset. Keep `builtinNoneMaterialPackage.manifests` empty. `getBuiltinMaterialPackage()` and `compileBuiltinMaterialProfile()` remain the only set-selection APIs; do not recreate `designer.ts`, `viewer.ts`, or a second registry.

- [ ] **Step 6: Run table manifests through built-in conformance and admission**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/properties.test.ts packages/builtin/src/index.test.ts packages/builtin/src/conformance.test.ts packages/schema/src/codec.test.ts`

Expected: PASS; each table has exactly one manifest source, all three consumers see the same profile membership, defaults normalize/validate, valid legacy input becomes canonical, and invalid legacy input is preserved with sidecar quarantine.

- [ ] **Step 7: Commit manifest assembly**

```bash
git add packages/materials/table/kernel/src/properties.ts packages/materials/table/kernel/src/properties.test.ts packages/materials/table/kernel/src/index.ts packages/materials/table/static/src/manifest.ts packages/materials/table/static/src/index.ts packages/materials/table/static/src/ai.ts packages/materials/table/data/src/manifest.ts packages/materials/table/data/src/index.ts packages/materials/table/data/src/ai.ts packages/builtin/src/types.ts packages/builtin/src/basic.ts packages/builtin/src/all.ts packages/builtin/src/none.ts packages/builtin/src/index.ts packages/builtin/src/index.test.ts packages/builtin/src/conformance.test.ts packages/schema/src/codec.test.ts
git commit -m "feat(table): assemble canonical table manifests"
```

## Task 21: Deterministic Topology Fuzz And Inverse Suite

**Files:**
- Create: `packages/materials/table/kernel/src/testing/arbitraries.ts`
- Create: `packages/materials/table/kernel/src/topology.fuzz.test.ts`

- [ ] **Step 1: Write the fixed-seed failing fuzz suite**

```ts
// packages/materials/table/kernel/src/testing/arbitraries.ts
export interface DeterministicRandom {
  integer: (maxExclusive: number) => number
  choose: <T>(values: readonly T[]) => T
}

export function createDeterministicRandom(seed: number): DeterministicRandom {
  let state = seed >>> 0
  const next = () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296
  }
  return {
    integer(maxExclusive) {
      if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) throw new RangeError('maxExclusive must be positive')
      return Math.floor(next() * maxExclusive)
    },
    choose(values) {
      if (!values.length) throw new RangeError('cannot choose from an empty collection')
      return values[Math.floor(next() * values.length)]!
    },
  }
}
```

```ts
// packages/materials/table/kernel/src/topology.fuzz.test.ts
import { describe, expect, it } from 'vitest'
import { deepClone } from '@easyink/shared'
import { assertValidTableModel, createTableModel } from './model'
import { TableTopologyEngine } from './topology-engine'
import { createDeterministicRandom } from './testing/arbitraries'

const REPLAY_SEED = 20260711

describe('TableTopologyEngine fuzz', () => {
  it('preserves every invariant after a deterministic mixed operation sequence', () => {
    const random = createDeterministicRandom(REPLAY_SEED)
    let model = createTableModel({ kind: 'static', columnCount: 4, rowCount: 4 })
    const operations: string[] = []
    try {
      for (let step = 0; step < 1_000; step++) {
        const band = model.bands[0]!
        const action = random.integer(8)
        if (action === 0) {
          const after = random.choose(model.columns).id
          model = TableTopologyEngine.insertColumn(model, { after, track: { kind: 'fr', weight: 1 } })
          operations.push(`insert-column-after:${after}`)
        }
        else if (action === 1 && model.columns.length > 1) {
          const id = random.choose(model.columns).id
          model = TableTopologyEngine.removeColumn(model, id).model
          operations.push(`remove-column:${id}`)
        }
        else if (action === 2 && model.columns.length > 1 && model.merges.length === 0) {
          const moved = random.choose(model.columns).id
          const siblings = model.columns.filter(column => column.id !== moved)
          const before = random.choose(siblings).id
          model = TableTopologyEngine.reorderColumn(model, moved, { before })
          operations.push(`move-column:${moved}:before:${before}`)
        }
        else if (action === 3) {
          const after = random.choose(band.rows).id
          model = TableTopologyEngine.insertRow(model, { bandId: band.id, after, minHeight: 8 })
          operations.push(`insert-row-after:${after}`)
        }
        else if (action === 4 && band.rows.length > 1) {
          const id = random.choose(band.rows).id
          model = TableTopologyEngine.removeRow(model, id).model
          operations.push(`remove-row:${id}`)
        }
        else if (action === 5 && band.rows.length > 1 && model.merges.length === 0) {
          const moved = random.choose(band.rows).id
          const before = random.choose(band.rows.filter(row => row.id !== moved)).id
          model = TableTopologyEngine.reorderRow(model, moved, { before })
          operations.push(`move-row:${moved}:before:${before}`)
        }
        else if (action === 6 && model.columns.length > 1 && model.merges.length === 0) {
          const row = random.choose(band.rows)
          const start = random.integer(model.columns.length - 1)
          model = TableTopologyEngine.merge(model, {
            rowIds: [row.id], columnIds: model.columns.slice(start, start + 2).map(column => column.id),
            anchorCellId: row.cells.find(cell => cell.columnId === model.columns[start]!.id)!.id,
          })
          operations.push(`merge:${row.id}:${start}`)
        }
        else if (model.merges.length) {
          const id = random.choose(model.merges).id
          model = TableTopologyEngine.split(model, id)
          operations.push(`split:${id}`)
        }
        assertValidTableModel(model)
      }
    }
    catch (error) {
      throw new Error(`table topology fuzz failed; seed=${REPLAY_SEED}; operations=${JSON.stringify(operations)}`, { cause: error })
    }
  })

  it('restores exact models for insert/remove and merge/split inverse pairs', () => {
    const source = createTableModel({ kind: 'static', columnCount: 3, rowCount: 2 })
    const insertedColumn = TableTopologyEngine.insertColumn(source, { after: source.columns[0]!.id, track: { kind: 'fr', weight: 1 } })
    const addedColumn = insertedColumn.columns.find(column => !source.columns.some(original => original.id === column.id))!
    expect(TableTopologyEngine.removeColumn(insertedColumn, addedColumn.id).model).toEqual(source)
    const insertedRow = TableTopologyEngine.insertRow(source, { bandId: source.bands[0]!.id, after: source.bands[0]!.rows[0]!.id, minHeight: 8 })
    const addedRow = insertedRow.bands[0]!.rows.find(row => !source.bands[0]!.rows.some(original => original.id === row.id))!
    expect(TableTopologyEngine.removeRow(insertedRow, addedRow.id).model).toEqual(source)
    const row = source.bands[0]!.rows[0]!
    const merged = TableTopologyEngine.merge(deepClone(source), {
      rowIds: [row.id], columnIds: source.columns.slice(0, 2).map(column => column.id), anchorCellId: row.cells[0]!.id,
    })
    expect(TableTopologyEngine.split(merged, merged.merges[0]!.id)).toEqual(source)
  })
})
```

- [ ] **Step 2: Run the suite and observe the first invariant or missing-helper failure**

Run: `pnpm exec vitest run packages/materials/table/kernel/src/topology.fuzz.test.ts --dom`

Expected: FAIL until all Task 1-3 structural operations satisfy the generated sequence.

- [ ] **Step 3: Fix only reproducible topology defects and retain the replay trace**

For every failure, use the printed seed and operation list to add the shortest regression case to `topology-engine.test.ts` before changing the engine. Do not catch and ignore rejected valid operations; generator guards are the only skipped branches.

- [ ] **Step 4: Run fuzz and focused topology tests**

Run: `pnpm exec vitest run packages/materials/table/kernel/src/topology-engine.test.ts packages/materials/table/kernel/src/topology.fuzz.test.ts --dom`

Expected: PASS; replay seed `20260711` executes 1,000 operations, every intermediate model validates, and all inverse pairs restore byte-equivalent JSON values.

- [ ] **Step 5: Commit the fuzz gate**

```bash
git add packages/materials/table/kernel/src/testing/arbitraries.ts packages/materials/table/kernel/src/topology.fuzz.test.ts packages/materials/table/kernel/src/topology-engine.ts packages/materials/table/kernel/src/topology-engine.test.ts
git commit -m "test(table): fuzz stable topology invariants"
```

## Task 22: Enforce Runtime, Render, Virtualization, And Cancellation Budgets

**Files:**
- Create: `packages/materials/table/kernel/src/table.performance.test.ts`
- Modify: `packages/materials/table/kernel/src/viewer-tree.ts`
- Modify: `packages/materials/table/kernel/src/viewer-tree.test.ts`
- Modify: `packages/materials/table/data/src/runtime-rows.ts`
- Modify: `packages/materials/table/data/src/runtime-rows.test.ts`

- [ ] **Step 1: Write the failing budget suite**

```ts
// packages/materials/table/kernel/src/table.performance.test.ts
import { describe, expect, it, vi } from 'vitest'
import { createTableModel } from './model'
import { TableTopologyEngine } from './topology-engine'
import { TableSpatialIndex } from './editing/designer-window'
import type { TableLayoutPlanData } from './layout-plan'
import { reserveTableRenderFacts } from './viewer-tree'

describe('table performance budgets', () => {
  it('keeps a 100,000-cell Designer geometry list bounded to viewport plus overscan', () => {
    const cells = Array.from({ length: 100_000 }, (_, index) => ({
      cellId: `cell-${index}`,
      rect: { x: (index % 100) * 10, y: Math.floor(index / 100) * 10, width: 10, height: 10 },
    }))
    let visited = 0
    const visible = TableSpatialIndex.build(1, cells).query(
      { x: 200, y: 200, width: 300, height: 200 }, 20, undefined, () => { visited += 1 },
    )
    expect(visible.length).toBeLessThanOrEqual(900)
    expect(visited).toBeLessThan(1_200)
  })

  it('reserves the host effective render token before building arrays', () => {
    let allocated = false
    const reserveNodes = vi.fn(() => {
      expect(allocated).toBe(false)
      throw new Error('VIEWER_RENDER_TREE_BUDGET_EXCEEDED')
    })
    expect(() => reserveTableRenderFacts(largeLayout(), { reserveNodes } as never)).toThrow('VIEWER_RENDER_TREE_BUDGET_EXCEEDED')
    allocated = true
    expect(reserveNodes).toHaveBeenCalled()
  })

  it('runs 200 stable-ID reorders inside the encoded CPU budget', () => {
    let model = createTableModel({ kind: 'static', columnCount: 20, rowCount: 20 })
    const started = performance.now()
    for (let index = 0; index < 200; index++) {
      const moved = model.columns[index % model.columns.length]!
      const before = model.columns[(index + 7) % model.columns.length]!
      if (moved.id !== before.id) model = TableTopologyEngine.reorderColumn(model, moved.id, { before: before.id })
    }
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})

function largeLayout(): TableLayoutPlanData {
  return {
    width: 100, viewportWidth: 100, contentWidth: 100, height: 10, unit: 'mm', direction: 'ltr',
    columnIds: ['column-1' as never], columnWidths: [100], rowHeights: [10],
    rows: [{
      instanceId: 'row-1', rowId: 'row-1' as never, bandId: 'band-1' as never,
      bandRole: 'body', rect: { x: 0, y: 0, width: 100, height: 10 },
    }],
    cells: [{
      instanceId: 'cell-1', rowInstanceId: 'row-1', cellId: 'cell-1' as never,
      bandId: 'band-1' as never, bandRole: 'body', rowId: 'row-1' as never,
      columnId: 'column-1' as never, coveredRowIds: ['row-1' as never],
      coveredRowInstanceIds: ['row-1'], coveredColumnIds: ['column-1' as never],
      rowSpan: 1, columnSpan: 1,
      rect: { x: 0, y: 0, width: 100, height: 10 },
      contentRect: { x: 0, y: 0, width: 100, height: 10 },
      content: { kind: 'text', text: 'bounded' }, resolvedText: 'bounded', clip: true,
      paintStyle: {
        padding: { top: 0, right: 0, bottom: 0, left: 0 }, fontFamily: 'sans-serif',
        fontSize: 4, fontWeight: 'normal', fontStyle: 'normal', lineHeight: 1.2,
        letterSpacing: 0, textAlign: 'start', verticalAlign: 'top', direction: 'ltr',
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflow: 'hidden',
        edgeCandidates: {}, edges: [],
      },
    }],
  }
}
```

The runtime-row tests from Task 9 prove the 100,000-row declared limit is checked before `readNext` and an already-aborted request never calls `source.open`; runtime layout integration keeps all measure spies at zero in both cases.

The 100,000-row value is an absolute defensive ceiling, not a throughput promise. Before reading/queueing each chunk, call `budget.reserveRuntimeRows(chunkCount)`, then reserve the exact rows/cells/shared edges/slots/pagination-index facts before allocating their arrays. Effective capacity is the minimum of inline-data node/byte, runtime-row, retained-layout-fact, and render-node budgets. A host cursor can exceed inline JSON scale but can never bypass row/fact limits. Tests assert counters remain unchanged after a rejected reservation, no further cursor read or scheduled measure starts, and cursor close runs once.

- [ ] **Step 2: Run the performance suite and observe the missing render guard**

Run: `pnpm exec vitest run packages/materials/table/kernel/src/table.performance.test.ts --dom`

Expected: FAIL because `reserveTableRenderFacts` is not exported from `viewer-tree.ts`.

- [ ] **Step 3: Consume the core host-effective reservation tokens before allocation**

```ts
export function reserveTableRenderFacts(layout: TableLayoutPlanData, budget: MaterialRenderBudgetToken): void {
  budget.reserveNodes('element', countTableRenderElements(layout))
  budget.reserveNodes('text', countTableRenderTexts(layout))
}
```

Counts include table, caption/description policy, colgroup/cols, row groups, rows, cells, text wrappers, slot wrappers, and physical shared-edge nodes. Call the reservation before creating maps or arrays and share the same token through hosted slots. Never define a table-local hardcoded limit; core injects the effective minimum of host/browser ceilings and the browser performs a final independent tree count.

- [ ] **Step 4: Run every encoded budget and the prerequisite cache/DOM bounds**

Run: `pnpm exec vitest run --dom packages/materials/table/kernel/src/table.performance.test.ts packages/materials/table/data/src/runtime-rows.test.ts packages/core/src/measure-service.test.ts packages/viewer/src/render-window.test.ts`

Expected: PASS with these defaults enforced: 100,000 runtime rows, 50,000 render nodes per material, 512 `MeasureService` cache entries, and one output page of Viewer DOM overscan. Cancellation performs no source, measure, cache, or DOM publication after abort.

- [ ] **Step 5: Commit performance budgets**

```bash
git add packages/materials/table/kernel/src/table.performance.test.ts packages/materials/table/kernel/src/viewer-tree.ts packages/materials/table/kernel/src/viewer-tree.test.ts packages/materials/table/data/src/runtime-rows.ts packages/materials/table/data/src/runtime-rows.test.ts
git commit -m "perf(table): enforce bounded runtime materialization"
```

## Task 23: Remove Superseded Table Paths And Run The Full Release Gate

**Files:**
- Delete: `packages/materials/table/kernel/src/render.ts`
- Delete: `packages/materials/table/kernel/src/render.test.ts`
- Delete: `packages/materials/table/kernel/src/measure.ts`
- Delete: `packages/materials/table/kernel/src/measure.test.ts`
- Delete: `packages/materials/table/kernel/src/schema.ts`
- Delete: `packages/materials/table/kernel/src/topology.ts`
- Delete: `packages/materials/table/data/src/layout.ts`
- Modify: `packages/materials/table/kernel/src/index.ts`
- Modify: `packages/materials/table/static/src/index.ts`
- Modify: `packages/materials/table/data/src/index.ts`
- Modify: `.github/architecture/07-layout-engine.md`
- Modify: `.github/architecture/09-plugin-system.md`
- Modify: `.github/architecture/11-element-system.md`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `pnpm-lock.yaml`
- Create: `vitest.browser.config.ts`
- Create: `packages/materials/table/kernel/src/table.browser.test.ts`

- [ ] **Step 1: Prove the old root-table, HTML, pagination, and full-array paths are unreferenced**

Run:

```powershell
rg -n "node\.table|isTableNode|getNodeProps|trustedViewerHtml|renderTableHtml|FragmentPaginator|runtimeLayoutCache|TABLE_DATA_PLACEHOLDER_ROW_COUNT|readRecords" packages/materials/table packages/builtin packages/designer packages/viewer
```

Expected: FAIL before Step 2 by listing only the seven superseded implementations/exports named in this task. Any other production match is fixed before deletion; after Step 2 the same command has no production matches. Legacy fixture strings may remain only in `legacy-migration.test.ts` and `packages/schema/src/codec.test.ts`.

- [ ] **Step 2: Delete superseded implementations and close public exports**

Delete the seven files listed above after their imports reach zero. Remove their exports from package indexes. The remaining public table API is stable-ID model/topology, schema adapter/introspection, layout/accessibility/tree plans, transaction-backed editing, and the two package-local manifests; do not export legacy index-coordinate types or HTML helpers.

- [ ] **Step 3: Run the complete focused table suite**

Run:

```powershell
pnpm exec vitest run packages/materials/table --dom
```

Expected: PASS, including `topology.fuzz.test.ts` with seed `20260711` and `table.performance.test.ts` within its encoded budgets.

- [ ] **Step 4: Run real-browser geometry and pixel assertions**

Add `@vitest/browser` and `@vitest/browser-playwright` through the repository catalog plus Playwright Chromium setup, and create `vitest.browser.config.ts` with a Chromium provider, deterministic 1280x900 viewport, forced device scale 1, animations disabled, and the table browser test include. The test mounts the real Browser DOM adapter and asserts `getBoundingClientRect()`/computed styles for LTR and RTL fixed+fr columns, first-row merges, row/column spans, T-junction shared edges, continuation top-boundary paint, fragment-scoped accessibility IDs, and a rotated child inside a padded prospective cell slot. Capture small clipped pixel regions for shared-edge winner/continuity rather than full-page font-sensitive goldens; assert nonblank pixels and exact edge coordinates.

Run: `pnpm exec vitest run --config vitest.browser.config.ts`

Expected: PASS in Chromium; every referenced screenshot/pixel fixture is deterministic and page-2-only accessibility has no dangling IDREF.

- [ ] **Step 5: Run cross-boundary conformance, Viewer, Designer, and Schema suites**

Run:

```powershell
pnpm exec vitest run packages/builtin/src/conformance.test.ts packages/schema/src packages/core/src packages/viewer/src packages/designer/src --dom
```

Expected: PASS; static/data manifests have the same membership across consumers, core owns pagination, semantic trees pass the browser boundary, and legacy quarantine state remains sidecar-only.

- [ ] **Step 6: Run the workspace quality gate in repository order, then build documentation**

Build documentation first, then run the final repository gate in its required order:

```powershell
pnpm docs:build
pnpm build
pnpm lint
pnpm typecheck
```

Expected: every command exits `0`; architecture links resolve, no deleted table helper is referenced, and the final three commands run strictly as `build` -> `lint` -> `typecheck`.

- [ ] **Step 7: Update architecture chapters to the implemented ownership boundaries**

Document these facts with links to their owning source and conformance tests: table-private stable IDs and identity introspection; exactly one detail template row; core-owned slot instances, measure plans, numeric pagination ranges, graph clone/rekey, transactions, and compiled profiles; table-owned topology, runtime detail derivation, accessibility, and semantic tree generation. Remove all descriptions of root `node.table`, full-array expansion, repeated continuation headers, trusted HTML, material-created pages, and Designer-authored runtime records.

- [ ] **Step 8: Commit cleanup and verify the checkpoint**

```bash
git add packages/materials/table packages/builtin packages/schema packages/core packages/viewer packages/designer .github/architecture package.json pnpm-workspace.yaml pnpm-lock.yaml vitest.browser.config.ts
git commit -m "refactor(table): complete report table architecture"
git status --short
```

Expected: commit succeeds and `git status --short` prints no output.
