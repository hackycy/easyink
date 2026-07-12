import type { MaterialNode } from '@easyink/schema'
import type { TableEditingDelegate } from './types'
import { describe, expect, it } from 'vitest'
import { createTableModel } from '../model'
import { computeCellRectWithPlaceholders, createTableGeometry, hitTestWithPlaceholders } from './geometry'

function node(): MaterialNode<unknown> {
  return {
    id: 'table',
    type: 'table-static',
    x: 10,
    y: 20,
    width: 90,
    height: 30,
    modelVersion: 1,
    model: createTableModel({ kind: 'static', columnCount: 3, rowCount: 3 }),
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

const delegate: TableEditingDelegate = {
  getNode: () => undefined,
  getTableKind: () => 'static',
  getPlaceholderRowCount: () => 0,
  getUnit: () => 'mm',
  screenToDoc: value => value,
  getZoom: () => 1,
  getPageEl: () => null,
  t: key => key,
}

describe('canonical table editing geometry', () => {
  it('resolves projected cell rectangles and hit tests', () => {
    const source = node()
    expect(computeCellRectWithPlaceholders(source, 0, 0, 0)).toMatchObject({ x: 0, y: 0, w: 30, h: 10 })
    expect(hitTestWithPlaceholders(source, 45, 15, 0)).toEqual({ row: 1, col: 1 })
  })

  it('registers table.cell geometry in document coordinates', () => {
    const source = node()
    const geometry = createTableGeometry(delegate)
    expect(geometry.resolveLocation!({ type: 'table.cell', nodeId: source.id, payload: { row: 0, col: 0 } }, source))
      .toEqual([{ x: 10, y: 20, width: 30, height: 10 }])
  })
})
