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
  return resolvePropertyAccessor(showHeaderDescriptor())
}

function showHeaderDescriptor() {
  return tableDataDesignerPropSchemas.find(schema => schema.key === 'showHeader')!
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

    preview.preview(node, showHeaderDescriptor(), draft => accessor.write(draft, false))
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

    preview.preview(first, showHeaderDescriptor(), draft => accessor.write(draft, false))
    preview.preview(second, showHeaderDescriptor(), draft => accessor.write(draft, false))
    expect(first).toEqual(firstBefore)
    expect(bandRoles(second)).toEqual(['detail'])

    preview.cancel()
    expect(second).toEqual(secondBefore)
  })

  it('keeps simple property preview, commit, and undo behavior', () => {
    const node = createTableNode()
    const preview = new MaterialPropertyPreviewSession()
    const accessor = createNodePropertyAccessor<number>('/width')
    const descriptor = { key: 'width', label: 'Width', type: 'number' as const, accessor }
    const commands = new CommandManager()
    const tx = createTransactionService(id => id === node.id ? node : undefined, commands)

    preview.preview(node, descriptor, draft => accessor.write(draft, 120))
    expect(node.width).toBe(120)
    commitMaterialPropertyPreview(preview, node, 'width', () =>
      tx.run(node.id, draft => accessor.write(draft, 140)))
    expect(node.width).toBe(140)

    commands.undo()
    expect(node.width).toBe(90)
  })

  it('preserves concurrent editor, output, and unrelated model updates on cancel and commit', () => {
    const node = createTableNode()
    node.model.sibling = 'before'
    const accessor = showHeaderAccessor()
    const descriptor = showHeaderDescriptor()
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, descriptor, draft => accessor.write(draft, false))
    node.editorState = { locked: true }
    node.output.visibility = 'reserve'
    node.model.sibling = 'concurrent-cancel'
    preview.cancel()

    expect(bandRoles(node)).toEqual(['header', 'detail'])
    expect(node.editorState).toEqual({ locked: true })
    expect(node.output.visibility).toBe('reserve')
    expect(node.model.sibling).toBe('concurrent-cancel')

    preview.preview(node, descriptor, draft => accessor.write(draft, false))
    node.editorState.hidden = true
    node.output.visibility = 'remove'
    node.model.sibling = 'concurrent-commit'
    commitMaterialPropertyPreview(preview, node, 'showHeader', () => accessor.write(node, false))

    expect(bandRoles(node)).toEqual(['detail'])
    expect(node.editorState).toEqual({ locked: true, hidden: true })
    expect(node.output.visibility).toBe('remove')
    expect(node.model.sibling).toBe('concurrent-commit')
  })

  it('restores a previously missing property as missing', () => {
    const node = createTableNode()
    const accessor = createNodePropertyAccessor<string>('/model/temporary')
    const descriptor = { key: 'temporary', label: 'Temporary', type: 'string' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, descriptor, draft => accessor.write(draft, 'preview'))
    expect(node.model).toHaveProperty('temporary', 'preview')
    preview.cancel()

    expect(node.model).not.toHaveProperty('temporary')
  })

  it('restores declared array index paths without replacing the array', () => {
    const node = createTableNode()
    node.model.items = ['first', 'second']
    const items = node.model.items
    const accessor = {
      paths: Object.freeze(['/model/items/1'] as const),
      read: (draft: MaterialNode) => (draft.model.items as string[])[1] ?? '',
      write: (draft: MaterialNode, value: string) => { (draft.model.items as unknown[])[1] = value },
    }
    const descriptor = { key: 'item', label: 'Item', type: 'string' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, descriptor, draft => accessor.write(draft, 'preview-one'))
    preview.preview(node, descriptor, draft => accessor.write(draft, 'preview-two'))
    expect(node.model.items).toBe(items)
    expect(node.model.items).toEqual(['first', 'preview-two'])

    preview.cancel()
    expect(node.model.items).toBe(items)
    expect(node.model.items).toEqual(['first', 'second'])
  })

  it('removes multiple preview-created array indices in descending order', () => {
    const node = createTableNode()
    node.model.items = []
    const accessor = {
      paths: Object.freeze(['/model/items/0', '/model/items/1'] as const),
      read: () => undefined,
      write: (draft: MaterialNode) => {
        const items = draft.model.items as unknown[]
        items[0] = 'first'
        items[1] = 'second'
      },
    }
    const descriptor = { key: 'items', label: 'Items', type: 'array' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, descriptor, draft => accessor.write(draft))
    preview.cancel()

    expect(node.model.items).toEqual([])
  })

  it('preserves sparse array length and holes when restoring missing indices', () => {
    const node = createTableNode()
    const items: unknown[] = []
    items.length = 3
    items[2] = 'tail'
    node.model.items = items
    const accessor = {
      paths: Object.freeze(['/model/items/1'] as const),
      read: (draft: MaterialNode) => (draft.model.items as string[])[1] ?? '',
      write: (draft: MaterialNode, value: string) => { (draft.model.items as unknown[])[1] = value },
    }
    const descriptor = { key: 'item', label: 'Item', type: 'string' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, descriptor, draft => accessor.write(draft, 'preview'))
    preview.cancel()

    expect(node.model.items).toHaveLength(3)
    expect(Object.hasOwn(node.model.items as unknown[], 0)).toBe(false)
    expect(Object.hasOwn(node.model.items as unknown[], 1)).toBe(false)
    expect((node.model.items as unknown[])[2]).toBe('tail')
  })

  it('restores the exact original length after previewing beyond an empty array', () => {
    const node = createTableNode()
    node.model.items = []
    const accessor = {
      paths: Object.freeze(['/model/items/5'] as const),
      read: () => '',
      write: (draft: MaterialNode, value: string) => { (draft.model.items as unknown[])[5] = value },
    }
    const descriptor = { key: 'item', label: 'Item', type: 'string' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, descriptor, draft => accessor.write(draft, 'preview'))
    expect(node.model.items).toHaveLength(6)
    preview.cancel()

    expect(node.model.items).toHaveLength(0)
    expect(Object.hasOwn(node.model.items as unknown[], 5)).toBe(false)
  })

  it('restores an empty array after commit and transaction undo at a distant index', () => {
    const node = createTableNode()
    node.model.items = []
    const accessor = {
      paths: Object.freeze(['/model/items/5'] as const),
      read: () => '',
      write: (draft: MaterialNode, value: string) => { (draft.model.items as unknown[])[5] = value },
    }
    const descriptor = { key: 'item', label: 'Item', type: 'string' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()
    const commands = new CommandManager()
    const tx = createTransactionService(id => id === node.id ? node : undefined, commands)

    preview.preview(node, descriptor, draft => accessor.write(draft, 'preview'))
    commitMaterialPropertyPreview(preview, node, 'item', () =>
      tx.run(node.id, draft => accessor.write(draft, 'committed')))
    expect(node.model.items).toHaveLength(6)

    commands.undo()
    expect(node.model.items).toHaveLength(0)
    expect(Object.hasOwn(node.model.items as unknown[], 5)).toBe(false)
  })

  it('retains concurrent indices beyond the original length while removing the preview index', () => {
    const node = createTableNode()
    node.model.items = []
    const accessor = {
      paths: Object.freeze(['/model/items/5'] as const),
      read: () => '',
      write: (draft: MaterialNode, value: string) => { (draft.model.items as unknown[])[5] = value },
    }
    const descriptor = { key: 'item', label: 'Item', type: 'string' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, descriptor, draft => accessor.write(draft, 'preview'))
    ;(node.model.items as unknown[])[6] = 'concurrent'
    preview.cancel()

    expect(node.model.items).toHaveLength(7)
    expect(Object.hasOwn(node.model.items as unknown[], 5)).toBe(false)
    expect((node.model.items as unknown[])[6]).toBe('concurrent')
  })

  it('removes multiple distant preview-owned indices without leaving array length behind', () => {
    const node = createTableNode()
    node.model.items = []
    const accessor = {
      paths: Object.freeze(['/model/items/5', '/model/items/8'] as const),
      read: () => undefined,
      write: (draft: MaterialNode) => {
        const items = draft.model.items as unknown[]
        items[5] = 'five'
        items[8] = 'eight'
      },
    }
    const descriptor = { key: 'items', label: 'Items', type: 'array' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, descriptor, draft => accessor.write(draft))
    preview.cancel()

    expect(node.model.items).toHaveLength(0)
    expect(Object.hasOwn(node.model.items as unknown[], 5)).toBe(false)
    expect(Object.hasOwn(node.model.items as unknown[], 8)).toBe(false)
  })

  it('deduplicates overlapping parent and child paths while retaining concurrent siblings', () => {
    const node = createTableNode()
    node.model = {}
    const accessor = {
      paths: Object.freeze(['/model/style', '/model/style/color', '/model/style/color'] as const),
      read: () => undefined,
      write: (draft: MaterialNode) => { draft.model.style = { color: '#fff' } },
    }
    const descriptor = { key: 'style', label: 'Style', type: 'object' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, descriptor, draft => accessor.write(draft))
    ;(node.model.style as Record<string, unknown>).other = 'concurrent'
    preview.cancel()

    expect(node.model).toEqual({ style: { other: 'concurrent' } })
  })

  it('prunes missing object ancestors on cancel and transaction undo', () => {
    const node = createTableNode()
    node.model = {}
    const accessor = createNodePropertyAccessor<string>('/model/style/color')
    const descriptor = { key: 'color', label: 'Color', type: 'color' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()
    const commands = new CommandManager()
    const tx = createTransactionService(id => id === node.id ? node : undefined, commands)

    preview.preview(node, descriptor, draft => accessor.write(draft, '#fff'))
    preview.cancel()
    expect(node.model).toEqual({})

    preview.preview(node, descriptor, draft => accessor.write(draft, '#eee'))
    commitMaterialPropertyPreview(preview, node, 'color', () =>
      tx.run(node.id, draft => accessor.write(draft, '#000')))
    expect(node.model).toEqual({ style: { color: '#000' } })

    commands.undo()
    expect(node.model).toEqual({})
  })

  it('keeps concurrent siblings in preview-created ancestors', () => {
    const node = createTableNode()
    node.model = {}
    const accessor = createNodePropertyAccessor<string>('/model/style/color')
    const descriptor = { key: 'color', label: 'Color', type: 'color' as const, accessor }
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, descriptor, draft => accessor.write(draft, '#fff'))
    const style = node.model.style as Record<string, unknown>
    style.other = 'concurrent'
    preview.cancel()

    expect(node.model).toEqual({ style: { other: 'concurrent' } })
  })

  it('prunes multilevel missing array entries but retains pre-existing empty containers', () => {
    const node = createTableNode()
    node.model = { rows: [], style: {} }
    const rows = node.model.rows
    const style = node.model.style
    const arrayAccessor = createNodePropertyAccessor<string>('/model/rows/0/style/color')
    const arrayDescriptor = { key: 'rowColor', label: 'Row Color', type: 'color' as const, accessor: arrayAccessor }
    const styleAccessor = createNodePropertyAccessor<string>('/model/style/color')
    const styleDescriptor = { key: 'styleColor', label: 'Style Color', type: 'color' as const, accessor: styleAccessor }
    const preview = new MaterialPropertyPreviewSession()

    preview.preview(node, arrayDescriptor, draft => arrayAccessor.write(draft, '#fff'))
    preview.cancel()
    expect(node.model.rows).toBe(rows)
    expect(node.model.rows).toEqual([])

    preview.preview(node, styleDescriptor, draft => styleAccessor.write(draft, '#fff'))
    preview.cancel()
    expect(node.model.style).toBe(style)
    expect(node.model.style).toEqual({})
  })
})
