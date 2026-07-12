import type { DocumentSchema } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { create } from 'mutative'
import { describe, expect, it } from 'vitest'
import { DocumentIndexSnapshot, DuplicateDocumentNodeIdError, forkDocumentIndexSnapshot } from './document-index'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'

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
    expect(Object.isFrozen(index)).toBe(true)
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
    const next = create(schema, (draft) => {
      draft.elements[0]!.slots.content[0]!.model.value = 2
    })
    const path = ['elements', 0, 'slots', 'content', 0, 'model', 'value'] as const
    const forward = [{ op: 'replace' as const, path: [...path], value: 2 }]
    const inverse = [{ op: 'replace' as const, path: [...path], value: 1 }]

    const result = forkDocumentIndexSnapshot(before, next, profile, 5, forward, inverse)

    expect(result.index.revision).toBe(5)
    expect(result.index.getNode('child')!.model.value).toBe(2)
    expect(result.index.getAddress('owner')).toBe(ownerAddress)
    expect(result.impact.affectedNodeIds).toEqual(['child'])
    expect(result.impact.changedPathsByNodeId.get('child')).toEqual(['/model/value'])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.index)).toBe(true)
    expect(Object.isFrozen(result.impact)).toBe(true)
    expect(Object.isFrozen(result.impact.affectedNodeIds)).toBe(true)
    expect(Object.isFrozen(result.impact.changedDocumentPaths)).toBe(true)
    expect(Object.isFrozen(result.impact.changedPathsByNodeId)).toBe(true)
  })

  it('updates a root node field without traversing unrelated candidate nodes', () => {
    const profile = createTestCompiledMaterialProfile()
    const changed = profile.createNode('box', { id: 'changed', x: 1 })
    const unrelated = profile.createNode('box', { id: 'unrelated' })
    const schema = { ...createDefaultSchema(), elements: [changed, unrelated] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    Object.defineProperty(unrelated, 'slots', {
      configurable: true,
      get: () => { throw new Error('unrelated subtree traversed') },
    })
    const next = { ...schema, elements: [{ ...changed, x: 2 }, unrelated] }

    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [
      { op: 'replace', path: ['elements', 0, 'x'], value: 2 },
    ], [
      { op: 'replace', path: ['elements', 0, 'x'], value: 1 },
    ])

    expect(result.index.getNode('changed')).toBe(next.elements[0])
    expect(result.index.getNode('unrelated')).toBe(unrelated)
    expect(result.impact.affectedNodeIds).toEqual(['changed'])
  })

  it('adds and deletes a profile-proven dynamic slot key locally', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'dynamic-container',
        slots: [{
          id: 'cell',
          key: { kind: 'prefix', value: 'cell:' },
          coordinateSpace: 'slot',
          layoutParticipation: 'owner',
          reparent: 'allowed',
        }],
      }),
      createTestMaterialManifest({ type: 'box' }),
    ])
    const owner = profile.createNode('dynamic-container', { id: 'owner', slots: {} })
    const schema = { ...createDefaultSchema(), elements: [owner] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const child = profile.createNode('box', { id: 'child' })
    const addedDocument = { ...schema, elements: [
      { ...owner, slots: { 'cell:a': [child] } },
    ] }
    const added = forkDocumentIndexSnapshot(before, addedDocument, profile, 2, [
      { op: 'add', path: ['elements', 0, 'slots', 'cell:a'], value: [child] },
    ], [
      { op: 'remove', path: ['elements', 0, 'slots', 'cell:a'] },
    ])

    expect(added.index.getSlot('owner', 'cell:a')).toMatchObject({ policyId: 'cell' })
    expect(added.index.getParentNodeId('child')).toBe('owner')

    const removedDocument = { ...schema, elements: [{ ...owner, slots: {} }] }
    const removed = forkDocumentIndexSnapshot(added.index, removedDocument, profile, 3, [
      { op: 'remove', path: ['elements', 0, 'slots', 'cell:a'] },
    ], [
      { op: 'add', path: ['elements', 0, 'slots', 'cell:a'], value: [child] },
    ])

    expect(removed.index.getSlot('owner', 'cell:a')).toBeUndefined()
    expect(removed.index.hasNode('child')).toBe(false)
  })

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid numeric patch segment %s', (segment) => {
    const profile = createTestCompiledMaterialProfile()
    const schema = { ...createDefaultSchema(), elements: [profile.createNode('box', { id: 'a' })] }
    const index = DocumentIndexSnapshot.build(schema, profile, 1)

    expect(() => forkDocumentIndexSnapshot(index, schema, profile, 2, [
      { op: 'replace', path: ['elements', segment], value: null },
    ], [])).toThrow(/unsafe/u)
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
    const inserted = profile.createNode('box', { id: 'inserted' })
    const clonedSecond = { ...second }
    const next = { ...schema, elements: [inserted, first, clonedSecond] }
    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [{ op: 'add', path: ['elements', 0], value: next.elements[0] }], [{ op: 'remove', path: ['elements', 0] }])
    expect(result.index.getAddress('second')).not.toBe(secondAddress)
    expect(result.index.getAddress('second')?.ancestors).toEqual([])
    expect(result.index.resolveNode(next, 'second')).toBe(next.elements[2])
    expect(result.index.getNode('second')).toBe(clonedSecond)
    expect(result.impact.affectedNodeIds).toEqual(['inserted'])
  })

  it('publishes cloned sibling nodes during reorder without marking them affected', () => {
    const profile = createTestCompiledMaterialProfile()
    const [a, b, c] = ['a', 'b', 'c'].map(id => profile.createNode('box', { id }))
    const schema = { ...createDefaultSchema(), elements: [a!, b!, c!] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const clonedC = { ...c! }
    const next = { ...schema, elements: [b!, a!, clonedC] }
    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [
      { op: 'replace', path: ['elements'], value: next.elements },
    ], [
      { op: 'replace', path: ['elements'], value: schema.elements },
    ])

    expect(result.index.getNode('c')).toBe(clonedC)
    expect(result.index.resolveNode(next, 'c')).toBe(clonedC)
    expect(result.impact.affectedNodeIds).toEqual(['a', 'b'])
  })

  it('marks only inversion participants in a large sibling group', () => {
    const profile = createTestCompiledMaterialProfile()
    const elements = Array.from({ length: 2_000 }, (_, index) => profile.createNode('box', { id: `node-${index}` }))
    const schema = { ...createDefaultSchema(), elements }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const nextElements = [...elements]
    const first = nextElements[999]!
    nextElements[999] = nextElements[1000]!
    nextElements[1000] = first
    const next = { ...schema, elements: nextElements }
    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [
      { op: 'replace', path: ['elements'], value: nextElements },
    ], [
      { op: 'replace', path: ['elements'], value: elements },
    ])

    expect(new Set(result.impact.affectedNodeIds)).toEqual(new Set(['node-999', 'node-1000']))
  })

  it('updates slot addresses after insertion without affecting shifted siblings', () => {
    const profile = createTestCompiledMaterialProfile()
    const a = profile.createNode('box', { id: 'a' })
    const b = profile.createNode('box', { id: 'b' })
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [a, b] } })
    const schema = { ...createDefaultSchema(), elements: [owner] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const inserted = profile.createNode('box', { id: 'inserted-slot' })
    const next = create(schema, (draft) => {
      draft.elements[0]!.slots.content!.splice(0, 0, inserted)
    })
    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [{ op: 'add', path: ['elements', 0, 'slots', 'content', 0], value: next.elements[0]!.slots.content[0] }], [{ op: 'remove', path: ['elements', 0, 'slots', 'content', 0] }])
    expect(result.index.getAddress('b')?.ancestors.at(-1)?.index).toBe(2)
    expect(result.index.resolveNode(next, 'b')).toBe(next.elements[0]!.slots.content[2])
    expect(result.impact.affectedNodeIds).toEqual(['inserted-slot'])
  })

  it('reuses records outside a touched slot subtree', () => {
    const profile = createTestCompiledMaterialProfile()
    const changedOwner = profile.createNode('container', { id: 'changed-owner', slots: { content: [] } })
    const untouchedChild = profile.createNode('box', { id: 'untouched-child' })
    const untouchedOwner = profile.createNode('container', { id: 'untouched-owner', slots: { content: [untouchedChild] } })
    const schema = { ...createDefaultSchema(), elements: [changedOwner, untouchedOwner] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const untouchedNode = before.getNode('untouched-child')
    const untouchedAddress = before.getAddress('untouched-child')
    const inserted = profile.createNode('box', { id: 'inserted' })
    const next = { ...schema, elements: [
      { ...changedOwner, slots: { ...changedOwner.slots, content: [inserted] } },
      untouchedOwner,
    ] }

    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [
      { op: 'add', path: ['elements', 0, 'slots', 'content', 0], value: inserted },
    ], [
      { op: 'remove', path: ['elements', 0, 'slots', 'content', 0] },
    ])

    expect(result.index.getNode('untouched-child')).toBe(untouchedNode)
    expect(result.index.getAddress('untouched-child')).toBe(untouchedAddress)
  })

  it('rejects a touched subtree ID that duplicates an unchanged base record', () => {
    const profile = createTestCompiledMaterialProfile()
    const existing = profile.createNode('box', { id: 'duplicate' })
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [] } })
    const schema = { ...createDefaultSchema(), elements: [existing, owner] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const duplicate = profile.createNode('box', { id: 'duplicate' })
    const next = { ...schema, elements: [
      existing,
      { ...owner, slots: { ...owner.slots, content: [duplicate] } },
    ] }

    expect(() => forkDocumentIndexSnapshot(before, next, profile, 2, [
      { op: 'add', path: ['elements', 1, 'slots', 'content', 0], value: duplicate },
    ], [
      { op: 'remove', path: ['elements', 1, 'slots', 'content', 0] },
    ])).toThrow(DuplicateDocumentNodeIdError)
  })

  it('preserves real ancestor owner IDs when reindexing a nested slot', () => {
    const profile = createTestCompiledMaterialProfile()
    const inner = profile.createNode('container', { id: 'inner', slots: { content: [] } })
    const outer = profile.createNode('container', { id: 'outer', slots: { content: [inner] } })
    const schema = { ...createDefaultSchema(), elements: [outer] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const inserted = profile.createNode('box', { id: 'nested' })
    const nextInner = { ...inner, slots: { ...inner.slots, content: [inserted] } }
    const next = { ...schema, elements: [
      { ...outer, slots: { ...outer.slots, content: [nextInner] } },
    ] }

    const result = forkDocumentIndexSnapshot(before, next, profile, 2, [
      { op: 'add', path: ['elements', 0, 'slots', 'content', 0, 'slots', 'content', 0], value: inserted },
    ], [
      { op: 'remove', path: ['elements', 0, 'slots', 'content', 0, 'slots', 'content', 0] },
    ])

    expect(result.index.getAddress('nested')?.ancestors).toEqual([
      { ownerNodeId: 'outer', slot: 'content', index: 0 },
      { ownerNodeId: 'inner', slot: 'content', index: 0 },
    ])
  })

  it('does not treat a moved node as an inversion against former siblings', () => {
    const profile = createTestCompiledMaterialProfile()
    const children = ['a', 'b', 'c'].map(id => profile.createNode('box', { id }))
    const left = profile.createNode('container', { id: 'left', slots: { content: children } })
    const right = profile.createNode('container', { id: 'right', slots: { content: [] } })
    const schema = { ...createDefaultSchema(), elements: [left, right] }
    const before = DocumentIndexSnapshot.build(schema, profile, 1)
    const next = create(schema, (draft) => {
      draft.elements[1]!.slots.content.push(draft.elements[0]!.slots.content.pop()!)
    })
    const moved = next.elements[1]!.slots.content[0]!
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
    const next = create(schema, (draft) => {
      draft.elements[0]!.x = 9
    })
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
