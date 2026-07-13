import type { MaterialNode } from '@easyink/schema'
import type { Matrix2D } from './matrix-chain'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { combineStableOperationDescriptors } from './document-change-set'
import { requireDocumentNode } from './document-index'
import { DocumentStore } from './document-store'
import { DocumentTransactionEngine } from './document-transaction-engine'
import { applyMatrixToPoint, IDENTITY_MATRIX, multiplyMatrix, nodeLocalMatrix } from './matrix-chain'
import { createSlotReparentPlan, reparentNode } from './slot-reparent'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'

function worldCorners(node: MaterialNode, world: Matrix2D) {
  return [
    { x: 0, y: 0 },
    { x: node.width, y: 0 },
    { x: node.width, y: node.height },
    { x: 0, y: node.height },
  ].map(point => applyMatrixToPoint(world, point))
}

function expectSameWorldPose(actual: readonly { x: number, y: number }[], expected: readonly { x: number, y: number }[]): void {
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index]!.x)
    expect(point.y).toBeCloseTo(expected[index]!.y)
  })
}

function documentWith(elements: MaterialNode[]) {
  const schema = createDefaultSchema()
  delete (schema.page.pagination as { pageCount?: number }).pageCount
  schema.elements = elements
  return schema
}

describe('slot reparent plans', () => {
  it('moves a root node into a rotated owner slot without changing all world-space corners', () => {
    const profile = createTestCompiledMaterialProfile()
    const owner = profile.createNode('container', { id: 'owner', x: 100, y: 50, width: 50, height: 50, rotation: 90, slots: { content: [] } })
    const child = profile.createNode('box', { id: 'child', x: 120, y: 60, width: 10, height: 6, rotation: 20 })
    const before = worldCorners(child, nodeLocalMatrix(child))
    const store = new DocumentStore(documentWith([owner, child]), profile)
    const engine = new DocumentTransactionEngine(store)

    reparentNode(engine, 'child', { kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', atEnd: true })

    const nestedOwner = store.document.elements[0]!
    const nested = nestedOwner.slots.content[0]!
    expectSameWorldPose(worldCorners(nested, multiplyMatrix(nodeLocalMatrix(nestedOwner), nodeLocalMatrix(nested))), before)
    engine.undo()
    expect(store.document.elements.map(node => node.id)).toEqual(['owner', 'child'])
  })

  it('uses document coordinates without consulting slot geometry', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'document-container', slots: [{
        id: 'content',
        key: { kind: 'exact', value: 'content' },
        coordinateSpace: 'document',
        layoutParticipation: 'owner',
        reparent: 'allowed',
      }] }),
    ])
    const owner = profile.createNode('document-container', { id: 'owner', x: 100, y: 40, rotation: 35, slots: { content: [] } })
    const child = profile.createNode('box', { id: 'child', x: 30, y: 20, width: 12, height: 8, rotation: 10 })
    const before = worldCorners(child, nodeLocalMatrix(child))
    const resolveSlotContentTransform = vi.fn(() => {
      throw new Error('must not resolve slot geometry')
    })
    const store = new DocumentStore(documentWith([owner, child]), profile)

    reparentNode(new DocumentTransactionEngine(store), 'child', {
      kind: 'node-slot',
      ownerNodeId: 'owner',
      slot: 'content',
      atEnd: true,
    }, { geometry: { resolveSlotContentTransform } })

    const nested = store.document.elements[0]!.slots.content[0]!
    expectSameWorldPose(worldCorners(nested, nodeLocalMatrix(nested)), before)
    expect(resolveSlotContentTransform).not.toHaveBeenCalled()
  })

  it('uses committed padded slot geometry under a rotated scaled owner and undoes exactly', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'slot-container', slots: [{
        id: 'content',
        key: { kind: 'exact', value: 'content' },
        coordinateSpace: 'slot',
        layoutParticipation: 'owner',
        reparent: 'allowed',
      }] }),
    ])
    const owner = profile.createNode('slot-container', { id: 'owner', x: 40, y: 25, width: 80, height: 50, rotation: 30, slots: { content: [] } })
    const child = profile.createNode('box', { id: 'child', x: 170, y: 90, width: 24, height: 12, rotation: 15 })
    const before = worldCorners(child, nodeLocalMatrix(child))
    const slotWorld = multiplyMatrix(
      multiplyMatrix({ a: 1.5, b: 0, c: 0, d: 1.5, e: 12, f: -4 }, nodeLocalMatrix(owner)),
      { a: 1, b: 0, c: 0, d: 1, e: 8, f: 6 },
    )
    const resolveSlotContentTransform = vi.fn((_owner: string, _slot: string, expected: number) => ({
      worldMatrix: slotWorld,
      ownerRevision: expected,
      layoutRevision: 7,
    }))
    const store = new DocumentStore(documentWith([owner, child]), profile)
    const engine = new DocumentTransactionEngine(store)

    reparentNode(engine, 'child', { kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', atEnd: true }, {
      geometry: { resolveSlotContentTransform },
    })

    const nested = store.document.elements[0]!.slots.content[0]!
    expectSameWorldPose(worldCorners(nested, multiplyMatrix(slotWorld, nodeLocalMatrix(nested))), before)
    expect(nested.width).toBeCloseTo(child.width / 1.5)
    expect(nested.height).toBeCloseTo(child.height / 1.5)
    expect(resolveSlotContentTransform).toHaveBeenCalledTimes(2)
    engine.undo()
    expect(store.document.elements.find(node => node.id === 'child')).toMatchObject({
      x: child.x,
      y: child.y,
      width: child.width,
      height: child.height,
      rotation: child.rotation,
    })
  })

  it('fails closed for missing, invalid, or changed slot geometry', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'slot-container', slots: [{
        id: 'content',
        key: { kind: 'exact', value: 'content' },
        coordinateSpace: 'slot',
        layoutParticipation: 'owner',
        reparent: 'allowed',
      }] }),
    ])
    const store = new DocumentStore(documentWith([
      profile.createNode('slot-container', { id: 'owner', slots: { content: [] } }),
      profile.createNode('box', { id: 'child' }),
    ]), profile)
    const engine = new DocumentTransactionEngine(store)
    const target = { kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', atEnd: true } as const

    expect(() => createSlotReparentPlan(store, { nodeId: 'child', target, preserveWorldPose: true }))
      .toThrow(/SLOT_CONTENT_TRANSFORM_MISSING/)
    expect(() => createSlotReparentPlan(store, {
      nodeId: 'child',
      target,
      preserveWorldPose: true,
      geometry: { resolveSlotContentTransform: (_owner, _slot, expected) => ({ worldMatrix: IDENTITY_MATRIX, ownerRevision: expected + 1, layoutRevision: 1 }) },
    })).toThrow(/SLOT_CONTENT_TRANSFORM_STALE/)
    expect(() => createSlotReparentPlan(store, {
      nodeId: 'child',
      target,
      preserveWorldPose: true,
      geometry: { resolveSlotContentTransform: (_owner, _slot, expected) => ({ worldMatrix: { ...IDENTITY_MATRIX, e: Number.NaN }, ownerRevision: expected, layoutRevision: 1 }) },
    })).toThrow(/SLOT_CONTENT_TRANSFORM_STALE/)

    let layoutRevision = 2
    const geometry = { resolveSlotContentTransform: (_owner: string, _slot: string, expected: number) => ({
      worldMatrix: IDENTITY_MATRIX,
      ownerRevision: expected,
      layoutRevision,
    }) }
    const plan = createSlotReparentPlan(store, { nodeId: 'child', target, preserveWorldPose: true, geometry })
    const before = store.committedDocument
    layoutRevision = 3
    expect(() => engine.transact(draft => plan.apply(draft), { label: 'Stale slot move', operation: plan.operation }))
      .toThrow(/SLOT_CONTENT_TRANSFORM_STALE/)
    expect(store.committedDocument).toBe(before)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)
  })

  it('rejects a plan after an unrelated committed revision', () => {
    const profile = createTestCompiledMaterialProfile()
    const store = new DocumentStore(documentWith([
      profile.createNode('container', { id: 'owner', slots: { content: [] } }),
      profile.createNode('box', { id: 'child' }),
      profile.createNode('box', { id: 'other' }),
    ]), profile)
    const engine = new DocumentTransactionEngine(store)
    const plan = createSlotReparentPlan(store, {
      nodeId: 'child',
      preserveWorldPose: true,
      target: { kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', atEnd: true },
    })
    engine.run('other', (draft) => {
      draft.x += 1
    })
    const revision = store.revision
    const count = engine.totalCount
    expect(() => engine.transact(draft => plan.apply(draft), { label: 'Stale', operation: plan.operation })).toThrow(/stale/)
    expect(store.revision).toBe(revision)
    expect(engine.totalCount).toBe(count)
  })

  it.each([
    ['before', { beforeNodeId: 'c' }, ['b', 'a', 'c']],
    ['after', { afterNodeId: 'c' }, ['b', 'c', 'a']],
  ] as const)('reorders within one slot using a stable %s anchor post-removal', (_name, anchor, expected) => {
    const profile = createTestCompiledMaterialProfile()
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [
      profile.createNode('box', { id: 'a' }),
      profile.createNode('box', { id: 'b' }),
      profile.createNode('box', { id: 'c' }),
    ] } })
    const store = new DocumentStore(documentWith([owner]), profile)
    reparentNode(new DocumentTransactionEngine(store), 'a', {
      kind: 'node-slot',
      ownerNodeId: 'owner',
      slot: 'content',
      ...anchor,
    })
    expect(store.document.elements[0]!.slots.content.map(node => node.id)).toEqual(expected)
  })

  it('rejects self anchors, missing anchors, and descendant cycles', () => {
    const profile = createTestCompiledMaterialProfile()
    const child = profile.createNode('container', { id: 'child', slots: { content: [] } })
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [child] } })
    const store = new DocumentStore(documentWith([owner]), profile)
    const engine = new DocumentTransactionEngine(store)
    expect(() => reparentNode(engine, 'child', { kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', beforeNodeId: 'child' })).toThrow(/itself/)
    expect(() => reparentNode(engine, 'child', { kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', beforeNodeId: 'missing' })).toThrow(/not in the target slot/)
    expect(() => reparentNode(engine, 'owner', { kind: 'node-slot', ownerNodeId: 'child', slot: 'content', atEnd: true })).toThrow(/descendant/)
    expect(store.revision).toBe(0)
  })

  it('enforces forbidden policies in both directions and bypasses them only for same-slot reorder', () => {
    const slot = (id: string, reparent: 'allowed' | 'same-material' | 'forbidden') => ({
      id,
      key: { kind: 'exact' as const, value: id },
      coordinateSpace: 'owner' as const,
      layoutParticipation: 'owner' as const,
      reparent,
    })
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'locked', slots: [slot('content', 'forbidden')] }),
      createTestMaterialManifest({ type: 'peer', slots: [slot('content', 'same-material'), slot('alternate', 'same-material')] }),
      createTestMaterialManifest({ type: 'other', slots: [slot('content', 'allowed')] }),
    ])
    const locked = profile.createNode('locked', { id: 'locked', slots: { content: [
      profile.createNode('box', { id: 'locked-child' }),
      profile.createNode('box', { id: 'locked-sibling' }),
    ] } })
    const first = profile.createNode('peer', { id: 'first', slots: { content: [profile.createNode('box', { id: 'child' }), profile.createNode('box', { id: 'sibling' })], alternate: [] } })
    const second = profile.createNode('peer', { id: 'second', slots: { content: [], alternate: [] } })
    const other = profile.createNode('other', { id: 'other', slots: { content: [profile.createNode('box', { id: 'open-child' })] } })
    const store = new DocumentStore(documentWith([locked, first, second, other]), profile)
    const engine = new DocumentTransactionEngine(store)

    expect(() => reparentNode(engine, 'locked-child', { kind: 'node-slot', ownerNodeId: 'other', slot: 'content', atEnd: true })).toThrow(/forbids reparenting/)
    expect(() => reparentNode(engine, 'open-child', { kind: 'node-slot', ownerNodeId: 'locked', slot: 'content', atEnd: true })).toThrow(/forbids reparenting/)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)

    reparentNode(engine, 'child', { kind: 'node-slot', ownerNodeId: 'first', slot: 'alternate', atEnd: true })
    engine.undo()
    reparentNode(engine, 'child', { kind: 'node-slot', ownerNodeId: 'second', slot: 'content', atEnd: true })
    engine.undo()
    expect(() => reparentNode(engine, 'child', { kind: 'node-slot', ownerNodeId: 'other', slot: 'content', atEnd: true })).toThrow(/same material type/)
    expect(() => reparentNode(engine, 'child', { kind: 'root', slot: 'elements', atEnd: true })).toThrow(/document root/)

    reparentNode(engine, 'locked-child', { kind: 'node-slot', ownerNodeId: 'locked', slot: 'content', afterNodeId: 'locked-sibling' })
    expect(store.document.elements[0]!.slots.content.map(node => node.id)).toEqual(['locked-sibling', 'locked-child'])
  })

  it('ensures a prospective dynamic slot inside one composed transaction and one undo item', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'table', slots: [{
        id: 'cell',
        key: { kind: 'prefix', value: 'cell:' },
        coordinateSpace: 'slot',
        layoutParticipation: 'owner',
        reparent: 'allowed',
      }] }),
    ])
    const store = new DocumentStore(documentWith([
      profile.createNode('table', { id: 'table-1', model: { mode: 'text' } }),
      profile.createNode('box', { id: 'child' }),
    ]), profile)
    const engine = new DocumentTransactionEngine(store)
    const geometry = { resolveSlotContentTransform: vi.fn((owner: string, slotName: string, expected: number) => {
      expect(Object.hasOwn(store.committedDocument.elements[0]!.slots, 'cell:c-1')).toBe(false)
      expect([owner, slotName]).toEqual(['table-1', 'cell:c-1'])
      return { worldMatrix: { ...IDENTITY_MATRIX, e: 12, f: 8 }, ownerRevision: expected, layoutRevision: 1 }
    }) }
    const plan = createSlotReparentPlan(store, {
      nodeId: 'child',
      preserveWorldPose: true,
      ensureTargetSlot: true,
      geometry,
      target: { kind: 'node-slot', ownerNodeId: 'table-1', slot: 'cell:c-1', atEnd: true },
    })
    engine.transact((draft) => {
      requireDocumentNode(draft, profile, 'table-1').model.mode = 'materials'
      plan.apply(draft)
    }, {
      label: 'Move into table cell',
      operation: combineStableOperationDescriptors('table.cell.materials', [{
        kind: 'table.cell.materials',
        sessionPath: [],
        targetIds: ['node:table-1', 'table.cell:c-1'],
        fieldPaths: ['/model/mode'],
        selectionLineage: null,
        structural: true,
      }, plan.operation]),
    })
    expect(store.document.elements).toHaveLength(1)
    expect(store.document.elements[0]!.slots['cell:c-1']!.map(node => node.id)).toEqual(['child'])
    expect(engine.totalCount).toBe(1)
    engine.undo()
    expect(store.document.elements.map(node => node.id)).toEqual(['table-1', 'child'])
    expect(store.document.elements[0]!.model.mode).toBe('text')
    expect(Object.hasOwn(store.document.elements[0]!.slots, 'cell:c-1')).toBe(false)
  })

  it('rejects absent dynamic slots that match zero or multiple manifest policies', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'ambiguous' }),
    ])
    const store = new DocumentStore(documentWith([
      profile.createNode('ambiguous', { id: 'owner' }),
      profile.createNode('box', { id: 'child' }),
    ]), profile)
    const manifest = profile.getManifest('ambiguous')!
    const ambiguousManifest = Object.freeze({
      ...manifest,
      common: Object.freeze({
        ...manifest.common,
        structure: Object.freeze({ slots: Object.freeze([
          Object.freeze({ id: 'prefix', key: Object.freeze({ kind: 'prefix' as const, value: 'cell:' }), coordinateSpace: 'owner' as const, layoutParticipation: 'owner' as const, reparent: 'allowed' as const }),
          Object.freeze({ id: 'exact', key: Object.freeze({ kind: 'exact' as const, value: 'cell:c-1' }), coordinateSpace: 'owner' as const, layoutParticipation: 'owner' as const, reparent: 'allowed' as const }),
        ]) }),
      }),
    })
    Object.defineProperty(store, 'profile', {
      value: Object.freeze({ ...profile, getManifest: (type: string) => type === 'ambiguous' ? ambiguousManifest : profile.getManifest(type) }),
    })
    for (const slotName of ['cell:c-1', 'other']) {
      expect(() => createSlotReparentPlan(store, {
        nodeId: 'child',
        preserveWorldPose: true,
        ensureTargetSlot: true,
        target: { kind: 'node-slot', ownerNodeId: 'owner', slot: slotName, atEnd: true },
      })).toThrow(/exactly one manifest slot policy/)
    }
  })

  it.each([
    ['shear', { a: 1, b: 0, c: 0.25, d: 1, e: 0, f: 0 }, /shear/],
    ['reflection', { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }, /reflection/],
  ] as const)('rejects %s before revision or history publication', (_name, worldMatrix, error) => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'slot-container', slots: [{
        id: 'content',
        key: { kind: 'exact', value: 'content' },
        coordinateSpace: 'slot',
        layoutParticipation: 'owner',
        reparent: 'allowed',
      }] }),
    ])
    const store = new DocumentStore(documentWith([
      profile.createNode('slot-container', { id: 'owner', slots: { content: [] } }),
      profile.createNode('box', { id: 'child' }),
    ]), profile)
    const engine = new DocumentTransactionEngine(store)
    expect(() => reparentNode(engine, 'child', { kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', atEnd: true }, {
      geometry: { resolveSlotContentTransform: (_owner, _slot, expected) => ({ worldMatrix, ownerRevision: expected, layoutRevision: 1 }) },
    })).toThrow(error)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)
  })

  it('freezes stable operation metadata and escapes slot field paths', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'container', slots: [{
        id: 'dynamic',
        key: { kind: 'exact', value: 'a~/b' },
        coordinateSpace: 'owner',
        layoutParticipation: 'owner',
        reparent: 'allowed',
      }] }),
    ])
    const store = new DocumentStore(documentWith([
      profile.createNode('container', { id: 'owner', slots: { 'a~/b': [] } }),
      profile.createNode('box', { id: 'child' }),
    ]), profile)
    const sessionPath = ['designer', 'canvas']
    const plan = createSlotReparentPlan(store, {
      nodeId: 'child',
      preserveWorldPose: true,
      sessionPath,
      selectionLineage: 'selection-1',
      target: { kind: 'node-slot', ownerNodeId: 'owner', slot: 'a~/b', atEnd: true },
    })
    sessionPath.push('changed')
    expect(plan.operation).toEqual({
      kind: 'structure.reparent',
      sessionPath: ['designer', 'canvas'],
      targetIds: ['document', 'node:child', 'node:owner'],
      fieldPaths: ['/elements', '/slots/a~0~1b'],
      selectionLineage: 'selection-1',
      structural: true,
    })
    expect(Object.isFrozen(plan.operation)).toBe(true)
    expect(Object.isFrozen(plan.operation.sessionPath)).toBe(true)
  })
})
