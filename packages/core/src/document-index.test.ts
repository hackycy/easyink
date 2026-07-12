import type { DocumentSchema } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { DocumentIndexSnapshot, DuplicateDocumentNodeIdError, forkDocumentIndexSnapshot } from './document-index'
import { createTestCompiledMaterialProfile } from './testing/material-profile'

describe('documentIndexSnapshot', () => {
  it('indexes root and nested slot nodes by stable ID', () => {
    const profile = createTestCompiledMaterialProfile()
    const child = profile.createNode('box', { id: 'child' })
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [child] } })
    const schema: DocumentSchema = { ...createDefaultSchema(), elements: [owner] }
    const index = DocumentIndexSnapshot.build(schema, profile, 4)

    expect(index.revision).toBe(4)
    expect(index.getNode('child')).toBe(owner.slots.content[0])
    expect(index.getAddress('child')?.ancestors.at(-1)).toMatchObject({ ownerNodeId: 'owner', slot: 'content', index: 0 })
    expect(index.getParentNodeId('child')).toBe('owner')
    expect(index.getSlot('owner', 'content')).toMatchObject({ coordinateSpace: 'owner', reparent: 'allowed' })
  })

  it('rejects duplicate node IDs before publishing a snapshot', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = { ...createDefaultSchema(), elements: [
      profile.createNode('box', { id: 'same' }),
      profile.createNode('box', { id: 'same' }),
    ] }
    expect(() => DocumentIndexSnapshot.build(schema, profile, 0))
      .toThrow(DuplicateDocumentNodeIdError)
  })

  it('forks a non-structural patch without rebuilding unaffected index records', () => {
    const profile = createTestCompiledMaterialProfile()
    const child = profile.createNode('box', { id: 'child', model: { value: 1 } })
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [child] } })
    const schema = { ...createDefaultSchema(), elements: [owner] }
    const before = DocumentIndexSnapshot.build(schema, profile, 4)
    const ownerAddress = before.getAddress('owner')
    const next = structuredClone(schema)
    next.elements[0]!.slots.content[0]!.model.value = 2
    const path = ['elements', 0, 'slots', 'content', 0, 'model', 'value'] as const
    const forward = [{ op: 'replace' as const, path: [...path], value: 2 }]
    const inverse = [{ op: 'replace' as const, path: [...path], value: 1 }]

    const result = forkDocumentIndexSnapshot(before, next, profile, 5, forward, inverse)

    expect(result.index.revision).toBe(5)
    expect(result.index.getNode('child')!.model.value).toBe(2)
    expect(result.index.getAddress('owner')).toBe(ownerAddress)
    expect(result.impact.affectedNodeIds).toEqual(['child'])
    expect(result.impact.changedPathsByNodeId.get('child')).toEqual(['/model/value'])
  })
})
