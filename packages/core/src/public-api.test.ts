import type {
  DocumentChangeSet,
  DocumentSlotPolicySnapshot,
  DocumentSlotTarget,
  DocumentStoreEvent,
  DocumentTransactionOptions,
  EditingSessionPath,
  SlotContentTransformSnapshot,
  SlotGeometrySidecarResolver,
  SlotReparentPlan,
  SlotReparentPlanInput,
  StableIdSelectionRegion,
} from '@easyink/core'
import {
  combineStableOperationDescriptors,
  createSlotReparentPlan,
  DocumentIndexSnapshot,
  DocumentStore,
  DocumentTransactionEngine,
  PreviewTransaction,
  reparentNode,
} from '@easyink/core'
import { describe, expect, it } from 'vitest'

void DocumentIndexSnapshot
void DocumentStore
void DocumentTransactionEngine
void PreviewTransaction
void combineStableOperationDescriptors
void createSlotReparentPlan
void reparentNode
type PublicContracts = DocumentChangeSet | DocumentStoreEvent | DocumentTransactionOptions | EditingSessionPath | SlotReparentPlan | SlotReparentPlanInput | StableIdSelectionRegion
function acceptsPublicContracts(_value: PublicContracts): void {}
void acceptsPublicContracts

type ForbiddenPatchKeys = Extract<keyof DocumentChangeSet, 'forward' | 'inverse' | 'patches' | 'patchPath'>
const noPublicPatchKeys: ForbiddenPatchKeys extends never ? true : never = true
void noPublicPatchKeys
type ForbiddenInsertionIndex = Extract<keyof DocumentSlotTarget, 'index'>
const noPublicInsertionIndex: ForbiddenInsertionIndex extends never ? true : never = true
void noPublicInsertionIndex

type ExpectedCoordinateSpace = 'document' | 'owner' | 'slot'
type PublicCoordinateSpace = DocumentSlotPolicySnapshot['coordinateSpace']
const coordinateSpaceIsExact: [PublicCoordinateSpace, ExpectedCoordinateSpace] extends [ExpectedCoordinateSpace, PublicCoordinateSpace]
  ? true
  : never = true
void coordinateSpaceIsExact
const slotGeometrySnapshot: SlotContentTransformSnapshot = {
  worldMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
  ownerRevision: 4,
  layoutRevision: 9,
}
const slotGeometryResolver: SlotGeometrySidecarResolver = {
  resolveSlotContentTransform: (_ownerNodeId, _slot, expectedNodeRevision) => ({
    ...slotGeometrySnapshot,
    ownerRevision: expectedNodeRevision,
  }),
}
void slotGeometryResolver

describe('@easyink/core document editing exports', () => {
  it('exports the stable transaction surface', () => {
    expect(DocumentIndexSnapshot).toBeTypeOf('function')
    expect(DocumentStore).toBeTypeOf('function')
    expect(DocumentTransactionEngine).toBeTypeOf('function')
    expect(PreviewTransaction).toBeTypeOf('function')
    expect(combineStableOperationDescriptors).toBeTypeOf('function')
    expect(createSlotReparentPlan).toBeTypeOf('function')
    expect(reparentNode).toBeTypeOf('function')
  })
})
