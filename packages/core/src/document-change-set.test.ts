import type { DocumentOperationDescriptor } from './document-change-set'
import { describe, expect, it } from 'vitest'
import { canCoalesceDocumentChanges, combineStableOperationDescriptors, createDocumentChangeSet, mergeDocumentChangeSets } from './document-change-set'

const operation: DocumentOperationDescriptor = {
  kind: 'geometry.move',
  sessionPath: [],
  targetIds: ['node:a'],
  fieldPaths: ['/x', '/y'],
  selectionLineage: 'selection-1',
  structural: false,
}

function change(id: string, overrides: Partial<Parameters<typeof createDocumentChangeSet>[0]> = {}) {
  const sequence = id === 'a' ? 0 : id === 'b' ? 1 : 2
  return createDocumentChangeSet({ id, label: 'Move', baseRevision: sequence, committedRevision: sequence + 1, startedAt: 100 + sequence * 80, updatedAt: 100 + sequence * 80, mergeKey: 'move', mergeWindowMs: 300, barrierGeneration: 0, affectedNodeIds: ['a'], operation, ...overrides })
}

describe('documentChangeSet', () => {
  it('normalizes, deduplicates, sorts, and freezes stable metadata', () => {
    const result = createDocumentChangeSet({ ...change('a'), affectedNodeIds: ['b', 'a', 'b'], operation: {
      ...operation,
      targetIds: ['node:b', 'node:a', 'node:b'],
      fieldPaths: ['/y', '/x', '/x'],
    } })
    expect(result.affectedNodeIds).toEqual(['a', 'b'])
    expect(result.operation.targetIds).toEqual(['node:a', 'node:b'])
    expect(result.operation.fieldPaths).toEqual(['/x', '/y'])
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.operation)).toBe(true)
    expect(Object.isFrozen(result.operation.targetIds)).toBe(true)
  })

  it('rejects invalid pointers and incomplete metadata', () => {
    expect(() => createDocumentChangeSet({ ...change('a'), operation: { ...operation, fieldPaths: ['/bad~2path'] } })).toThrow()
    expect(() => createDocumentChangeSet({ ...change('a'), operation: { ...operation, fieldPaths: ['/bad~'] } })).toThrow()
    expect(() => createDocumentChangeSet({ ...change('a'), operation: { ...operation, kind: ' ' } })).toThrow()
    expect(() => createDocumentChangeSet({ ...change('a'), operation: { ...operation, targetIds: [] } })).toThrow()
  })

  it('coalesces only when every stable operation identity field matches', () => {
    const merged = mergeDocumentChangeSets(change('a'), change('b'))!
    expect(merged).toMatchObject({ baseRevision: 0, committedRevision: 2, affectedNodeIds: ['a'] })
    expect(Object.isFrozen(merged.operation.targetIds)).toBe(true)
    for (const operationOverride of [
      { kind: 'geometry.resize' },
      { sessionPath: ['owner'] },
      { targetIds: ['node:b'] },
      { fieldPaths: ['/x'] },
      { selectionLineage: 'selection-2' },
      { structural: true },
    ] satisfies ReadonlyArray<Partial<DocumentOperationDescriptor>>) {
      expect(canCoalesceDocumentChanges(change('a'), change('b', { operation: { ...operation, ...operationOverride } }))).toBe(false)
    }
  })

  it('requires matching key/window/barrier, contiguous revisions, and forward adjacent time', () => {
    expect(canCoalesceDocumentChanges(change('a', { mergeKey: undefined }), change('b'))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { mergeKey: 'other' }))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { mergeWindowMs: 301 }))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { baseRevision: 5, committedRevision: 6 }))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { barrierGeneration: 1 }))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { startedAt: 50, updatedAt: 50 }))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { startedAt: 401, updatedAt: 401 }))).toBe(false)
  })

  it('uses the previous update time and combines stable recipes', () => {
    const first = change('a', { startedAt: 0, updatedAt: 0 })
    const second = change('b', { startedAt: 250, updatedAt: 250 })
    const third = change('c', { startedAt: 500, updatedAt: 500 })
    expect(mergeDocumentChangeSets(mergeDocumentChangeSets(first, second)!, third)).toMatchObject({ startedAt: 0, updatedAt: 500 })
    const combined = combineStableOperationDescriptors('table.cell.materials', [operation, { ...operation, kind: 'structure.reparent', targetIds: ['node:b'], fieldPaths: ['/slots/cell~11'], structural: true }])
    expect(combined).toEqual({ kind: 'table.cell.materials', sessionPath: [], targetIds: ['node:a', 'node:b'], fieldPaths: ['/slots/cell~11', '/x', '/y'], selectionLineage: 'selection-1', structural: true })
    expect(Object.isFrozen(combined.targetIds)).toBe(true)
  })
})
