import type { MaterialNode } from '@easyink/schema'
import { resolvePropertyAccessor } from '@easyink/core'
import { assertValidTableModel, getTableMaterialModel } from '@easyink/material-table-kernel'
import { describe, expect, it } from 'vitest'
import { tableDataDesignerPropSchemas } from './prop-schemas'
import { createDefaultDataTableModel } from './schema'

function node(): MaterialNode<unknown> {
  return {
    id: 'data',
    type: 'table-data',
    x: 0,
    y: 0,
    width: 90,
    height: 30,
    modelVersion: 1,
    model: createDefaultDataTableModel(),
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}

function accessor(key: string) {
  return resolvePropertyAccessor(tableDataDesignerPropSchemas.find(descriptor => descriptor.key === key)!)
}

describe('table-data band descriptors', () => {
  it('removes and deterministically restores header/footer bands through the topology engine', () => {
    const source = node()
    accessor('showHeader').write(source as MaterialNode, false)
    accessor('showFooter').write(source as MaterialNode, false)
    expect(getTableMaterialModel(source).bands.map(band => band.role)).toEqual(['detail'])
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
})
