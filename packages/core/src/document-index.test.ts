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

  it('rejects patches outside the canonical elements graph', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = { ...createDefaultSchema(), elements: [profile.createNode('box', { id: 'a' })] }
    const index = DocumentIndexSnapshot.build(schema, profile, 1)
    expect(() => forkDocumentIndexSnapshot(index, schema, profile, 2, [{ op: 'replace', path: ['datasources', 0, 'name'], value: 'x' }], [])).toThrow(/canonical elements/u)
  })

  it('keeps unaffected sibling records by identity when a root insertion shifts indexes', () => {
    const profile = createTestCompiledMaterialProfile()
    const first = profile.createNode('box', { id: 'first' })
    const second = profile.createNode('box', { id: 'second' })
    const schema = { ...createDefaultSchema(), elements: [first, second] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const secondAddress = before.getAddress('second')
    const next = structuredClone(schema)
    next.elements.unshift(profile.createNode('box', { id: 'inserted' }))
    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [{ op: 'add', path: ['elements', 0], value: next.elements[0] }], [{ op: 'remove', path: ['elements', 0] }])
    expect(result.index.getAddress('second')).not.toBe(secondAddress)
    expect(result.index.getAddress('second')?.ancestors).toEqual([])
    expect(result.index.resolveNode(next, 'second')).toBe(next.elements[2])
    expect(result.impact.affectedNodeIds).toEqual(['inserted'])
  })

  it('updates slot addresses after insertion without affecting shifted siblings', () => {
    const profile = createTestCompiledMaterialProfile()
    const a = profile.createNode('box', { id: 'a' })
    const b = profile.createNode('box', { id: 'b' })
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [a, b] } })
    const schema = { ...createDefaultSchema(), elements: [owner] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const next = structuredClone(schema)
    next.elements[0]!.slots.content!.splice(0, 0, profile.createNode('box', { id: 'inserted-slot' }))
    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [{ op: 'add', path: ['elements', 0, 'slots', 'content', 0], value: next.elements[0]!.slots.content[0] }], [{ op: 'remove', path: ['elements', 0, 'slots', 'content', 0] }])
    expect(result.index.getAddress('b')?.ancestors.at(-1)?.index).toBe(2)
    expect(result.index.resolveNode(next, 'b')).toBe(next.elements[0]!.slots.content[2])
    expect(result.impact.affectedNodeIds).toEqual(['inserted-slot'])
  })

  it('does not treat a moved node as an inversion against former siblings', () => {
    const profile = createTestCompiledMaterialProfile()
    const children = ['a', 'b', 'c'].map(id => profile.createNode('box', { id }))
    const left = profile.createNode('container', { id: 'left', slots: { content: children } })
    const right = profile.createNode('container', { id: 'right', slots: { content: [] } })
    const schema = { ...createDefaultSchema(), elements: [left, right] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const next = structuredClone(schema)
    const moved = next.elements[0]!.slots.content.pop()!
    next.elements[1]!.slots.content.push(moved)
    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [
      { op: 'remove', path: ['elements', 0, 'slots', 'content', 2] },
      { op: 'add', path: ['elements', 1, 'slots', 'content', 0], value: moved },
    ], [
      { op: 'remove', path: ['elements', 1, 'slots', 'content', 0] },
      { op: 'add', path: ['elements', 0, 'slots', 'content', 2], value: moved },
    ])
    expect(result.impact.affectedNodeIds).toEqual(['c'])
  })

  it('records legal document metadata patches outside the material graph', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = { ...createDefaultSchema(), elements: [profile.createNode('box', { id: 'a' })] }
    const index = DocumentIndexSnapshot.build(schema, profile, 1)
    const result = forkDocumentIndexSnapshot(index, schema, profile, 2, [{ op: 'replace', path: ['page', 'width'], value: 200 }], [{ op: 'replace', path: ['page', 'width'], value: 100 }])
    expect(result.impact.changedDocumentPaths).toEqual(['/page/width'])
    expect(result.impact.affectedNodeIds).toEqual([])
  })

  it('updates and affects a stable node replaced as a whole', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = { ...createDefaultSchema(), elements: [profile.createNode('box', { id: 'stable', x: 1 })] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const next = structuredClone(schema)
    next.elements[0]!.x = 9
    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [{ op: 'replace', path: ['elements', 0], value: next.elements[0] }], [{ op: 'replace', path: ['elements', 0], value: schema.elements[0] }])
    expect(result.index.getNode('stable')).toBe(next.elements[0])
    expect(result.impact.affectedNodeIds).toEqual(['stable'])
  })

  it.each([
    ['elements', 0, 'slots', 'missing', 0],
    ['elements', 0, 'slots', 'content', 'oops'],
    ['elements', 0, 'bogus', 'x'],
  ])('rejects unprovable canonical ownership at %j', (...path) => {
    const profile = createTestCompiledMaterialProfile()
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [] } })
    const schema = { ...createDefaultSchema(), elements: [owner] }
    const index = DocumentIndexSnapshot.build(schema, profile, 1)
    expect(() => forkDocumentIndexSnapshot(index, schema, profile, 2, [{ op: 'replace', path, value: null }], [])).toThrow(/ownership|non-canonical/u)
  })
})
