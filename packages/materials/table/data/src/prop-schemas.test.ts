import type { Selection } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { resolvePropertyAccessor, validatePropertyDescriptors } from '@easyink/core'
import { assertValidTableModel, createTableCellSelectionType, getTableMaterialModel } from '@easyink/material-table-kernel'
import { describe, expect, it } from 'vitest'
import { tableDataDesignerPropSchemas } from './prop-schemas'
import { createDefaultDataTableModel } from './schema'

function node(): MaterialNode {
  return {
    id: 'data',
    type: 'table-data',
    x: 0,
    y: 0,
    width: 90,
    height: 30,
    modelVersion: 1,
    model: createDefaultDataTableModel() as unknown as Record<string, unknown>,
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

function accessor(key: string) {
  return resolvePropertyAccessor(tableDataDesignerPropSchemas.find(descriptor => descriptor.key === key)!)
}

const tableCellSelectionType = createTableCellSelectionType({
  getNode: () => undefined,
  getTableKind: () => 'data',
  getPlaceholderRowCount: () => 2,
  getUnit: () => 'px',
  screenToDoc: value => value,
  getZoom: () => 1,
  getPageEl: () => null,
  t: key => key,
})

describe('table-data band descriptors', () => {
  it('declares valid recursively frozen shared band accessors', () => {
    expect(validatePropertyDescriptors(tableDataDesignerPropSchemas)).toEqual([])
    const bandAccessors = ['showHeader', 'showFooter', 'headerBackground', 'summaryBackground'].map(accessor)
    expect(bandAccessors.every(candidate => Object.isFrozen(candidate.paths))).toBe(true)
    expect(bandAccessors.map(candidate => candidate.pathSharingGroup)).toEqual(Array.from({ length: 4 }).fill('table-data-bands'))
  })

  it('removes and deterministically restores header/footer bands through the topology engine', () => {
    const source = node()
    const headerCells = getTableMaterialModel(source).bands.find(band => band.role === 'header')!.rows[0]!.cells
    const slotId = `cell:${headerCells[1]!.id}`
    headerCells[0]!.content = { kind: 'text', text: '', bindingPort: 'header:value' }
    headerCells[1]!.content = { kind: 'materials', slotId }
    source.bindings['header:value'] = { sourceId: 'source', fieldPath: 'header' }
    source.slots[slotId] = []
    accessor('showHeader').write(source as MaterialNode, false)
    accessor('showFooter').write(source as MaterialNode, false)
    expect(getTableMaterialModel(source).bands.map(band => band.role)).toEqual(['detail'])
    expect(source.bindings['header:value']).toBeUndefined()
    expect(source.slots[slotId]).toBeUndefined()
    accessor('showHeader').write(source as MaterialNode, true)
    accessor('showFooter').write(source as MaterialNode, true)
    expect(getTableMaterialModel(source).bands.map(band => band.role)).toEqual(['header', 'detail', 'footer'])
    assertValidTableModel(getTableMaterialModel(source))
  })

  it('maps appearance descriptors to canonical band styles', () => {
    const source = node()
    accessor('headerBackground').write(source as MaterialNode, '#f00')
    accessor('summaryBackground').write(source as MaterialNode, '#0f0')
    expect(accessor('headerBackground').read(source as MaterialNode)).toBe('#f00')
    expect(accessor('summaryBackground').read(source as MaterialNode)).toBe('#0f0')
    expect(getTableMaterialModel(source).bands.find(band => band.role === 'header')?.style?.background).toBe('#f00')
  })

  it.each([
    { key: 'showHeader', selectedRow: 0, expectedRow: 0 },
    { key: 'showFooter', selectedRow: 2, expectedRow: 1 },
  ])('returns topology rebase data when $key removes the selected band', ({ key, selectedRow, expectedRow }) => {
    const source = node()
    const before = structuredClone(source)
    const selection: Selection<{ row: number, col: number }> = {
      type: 'table.cell',
      nodeId: source.id,
      payload: { row: selectedRow, col: 0 },
    }

    const result = accessor(key).write(source as MaterialNode, false)
    expect(result?.selectionRebase?.type).toBe('table.cell')
    const rebased = tableCellSelectionType.rebase?.(
      selection,
      before,
      source,
      result?.selectionRebase?.hint,
    )

    expect(rebased?.payload).toEqual({ row: expectedRow, col: 0 })
    const row = getTableMaterialModel(source).bands.flatMap(band => band.rows)[expectedRow]
    expect(row).toBeDefined()
  })
})
