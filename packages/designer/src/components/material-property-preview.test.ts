import type { MaterialNode } from '@easyink/schema'
import { CommandManager, createNodePropertyAccessor, resolvePropertyAccessor } from '@easyink/core'
import { deepClone } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import { tableDataDesignerPropSchemas } from '../../../materials/table/data/src/prop-schemas'
import { createTransactionService } from '../editing/transaction-service'
import { commitMaterialPropertyPreview, MaterialPropertyPreviewSession } from './material-property-preview'

function createTableNode(id = 'data'): MaterialNode {
  const model = structuredClone({
    kind: 'data' as const,
    columns: [
      { id: 'column:a', track: { kind: 'fr' as const, weight: 1 }, minWidth: 8 },
      { id: 'column:b', track: { kind: 'fr' as const, weight: 1 }, minWidth: 8 },
    ],
    bands: [
      {
        id: 'band:header',
        role: 'header' as const,
        rows: [{
          id: 'row:header',
          minHeight: 8,
          cells: [
            { id: 'cell:header-a', columnId: 'column:a', content: { kind: 'text' as const, text: 'Header', bindingPort: 'header:value' } },
            { id: 'cell:header-b', columnId: 'column:b', content: { kind: 'materials' as const, slotId: 'cell:cell:header-b' } },
          ],
        }],
      },
      {
        id: 'band:detail',
        role: 'detail' as const,
        rows: [{
          id: 'row:detail',
          minHeight: 8,
          cells: [
            { id: 'cell:detail-a', columnId: 'column:a', content: { kind: 'text' as const, text: 'Detail' } },
            { id: 'cell:detail-b', columnId: 'column:b', content: { kind: 'text' as const, text: '' } },
          ],
        }],
      },
    ],
    merges: [],
    style: {},
    data: { collectionPort: 'records' },
  })
  const child: MaterialNode = {
    id: `${id}-child`,
    type: 'text',
    x: 0,
    y: 0,
    width: 10,
    height: 5,
    modelVersion: 1,
    model: { text: 'nested child' },
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
  return {
    id,
    type: 'table-data',
    x: 1,
    y: 2,
    width: 90,
    height: 30,
    modelVersion: 1,
    model: model as unknown as Record<string, unknown>,
    slots: { 'cell:cell:header-b': [child] },
    bindings: {
      'records': { sourceId: 'source', fieldPath: 'rows' },
      'header:value': { sourceId: 'source', fieldPath: 'title' },
    },
    editorState: { locked: false, hidden: false },
    output: { visibility: 'include' },
  }
}

function showHeaderAccessor() {
  return resolvePropertyAccessor(tableDataDesignerPropSchemas.find(schema => schema.key === 'showHeader')!)
}

function bandRoles(node: MaterialNode): string[] {
  return (node.model as { bands: Array<{ role: string }> }).bands.map(band => band.role)
}

describe('propertiesPanel material property preview lifecycle', () => {
  it('restores the complete topology baseline before commit so undo recovers it exactly', () => {
    const node = reactive(createTableNode()) as MaterialNode
    const before = deepClone(node)
    const preview = new MaterialPropertyPreviewSession()
    const accessor = showHeaderAccessor()
    const commands = new CommandManager()
    const tx = createTransactionService(id => id === node.id ? node : undefined, commands)

    preview.preview(node, 'showHeader', draft => accessor.write(draft, false))
    expect(bandRoles(node)).toEqual(['detail'])
    expect(node.bindings['header:value']).toBeUndefined()
    expect(node.slots['cell:cell:header-b']).toBeUndefined()

    const committed = commitMaterialPropertyPreview(preview, node, 'showHeader', () =>
      tx.run(node.id, draft => accessor.write(draft, false)))
    expect(committed.before).toEqual(before)
    expect(bandRoles(node)).toEqual(['detail'])

    commands.undo()
    expect(node).toEqual(before)
  })

  it('restores previews on node change and cancellation', () => {
    const first = createTableNode('first')
    const second = createTableNode('second')
    const firstBefore = deepClone(first)
    const secondBefore = deepClone(second)
    const preview = new MaterialPropertyPreviewSession()
    const accessor = showHeaderAccessor()

    preview.preview(first, 'showHeader', draft => accessor.write(draft, false))
    preview.preview(second, 'showHeader', draft => accessor.write(draft, false))
    expect(first).toEqual(firstBefore)
    expect(bandRoles(second)).toEqual(['detail'])

    preview.cancel()
    expect(second).toEqual(secondBefore)
  })

  it('keeps simple property preview, commit, and undo behavior', () => {
    const node = createTableNode()
    const preview = new MaterialPropertyPreviewSession()
    const accessor = createNodePropertyAccessor<number>('/width')
    const commands = new CommandManager()
    const tx = createTransactionService(id => id === node.id ? node : undefined, commands)

    preview.preview(node, 'width', draft => accessor.write(draft, 120))
    expect(node.width).toBe(120)
    commitMaterialPropertyPreview(preview, node, 'width', () =>
      tx.run(node.id, draft => accessor.write(draft, 140)))
    expect(node.width).toBe(140)

    commands.undo()
    expect(node.width).toBe(90)
  })
})
