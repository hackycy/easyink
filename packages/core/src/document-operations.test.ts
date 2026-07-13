import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { removeDocumentNode } from './document-operations'

function node(id: string, slots: Record<string, MaterialNode[]> = {}): MaterialNode {
  return {
    id,
    type: 'box',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: {},
    slots,
    bindings: {},
    output: { visibility: 'include' },
  }
}

describe('removeDocumentNode', () => {
  it('removes a node from an arbitrary nested slot and prunes its group membership', () => {
    const nested = node('nested', { content: [node('descendant')] })
    const sibling = node('sibling')
    const owner = node('owner', { header: [sibling], content: [nested] })
    const document: DocumentSchema = {
      ...createDefaultSchema(),
      elements: [owner],
      groups: [
        { id: 'keep', name: 'Keep', memberIds: ['owner', 'sibling'] },
        { id: 'prune', name: 'Prune', memberIds: ['nested', 'descendant'] },
      ],
    }

    const removed = removeDocumentNode(document, 'nested')

    expect(removed).toBe(nested)
    expect(document.elements).toEqual([owner])
    expect(owner.slots.content).toEqual([])
    expect(owner.slots.header).toEqual([sibling])
    expect(document.groups).toEqual([{ id: 'keep', name: 'Keep', memberIds: ['owner', 'sibling'] }])
  })

  it('throws without changing the document when the node is missing', () => {
    const document: DocumentSchema = { ...createDefaultSchema(), elements: [node('existing')] }
    const before = structuredClone(document)

    expect(() => removeDocumentNode(document, 'missing')).toThrow('Document node "missing" not found')
    expect(document).toEqual(before)
  })
})
