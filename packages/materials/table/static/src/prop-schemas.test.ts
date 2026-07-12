import type { MaterialNode } from '@easyink/schema'
import { resolvePropertyAccessor } from '@easyink/core'
import { assertValidTableModel } from '@easyink/material-table-kernel'
import { describe, expect, it } from 'vitest'
import { tableStaticDesignerPropSchemas } from './prop-schemas'
import { createDefaultStaticTableModel } from './schema'

describe('table property descriptors', () => {
  it('write valid TableModel style paths and translate logical alignment', () => {
    const node: MaterialNode<unknown> = {
      id: 'table',
      type: 'table-static',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      modelVersion: 1,
      model: createDefaultStaticTableModel(),
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }
    const borderWidth = tableStaticDesignerPropSchemas.find(descriptor => descriptor.key === 'borderWidth')!
    const textAlign = tableStaticDesignerPropSchemas.find(descriptor => descriptor.key === 'typography.textAlign')!

    const textAlignAccessor = resolvePropertyAccessor(textAlign)
    const model = node.model as ReturnType<typeof createDefaultStaticTableModel>

    expect(textAlignAccessor.read(node as MaterialNode)).toBe('center')
    model.style.typography = { textAlign: 'start' }
    expect(textAlignAccessor.read(node as MaterialNode)).toBe('left')
    resolvePropertyAccessor(borderWidth).write(node as MaterialNode, 2)
    textAlignAccessor.write(node as MaterialNode, 'right')

    expect(model.style.border?.blockStart?.width).toBe(2)
    expect(model.style.typography?.textAlign).toBe('end')
    expect(textAlignAccessor.read(node as MaterialNode)).toBe('right')
    assertValidTableModel(model)
  })
})
