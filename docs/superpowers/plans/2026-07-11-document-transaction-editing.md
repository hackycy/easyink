# Document Transaction and Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-writer, immutable document editing pipeline with atomic change sets, preview transactions, coordinated gestures, nested editing sessions, stable selection rebasing, and slot-safe reparenting.

**Architecture:** `DocumentStore` owns the frozen committed document, the optional preview view, an immutable revision-keyed `DocumentIndexSnapshot`, and private validation caches; only `DocumentTransactionEngine` receives the internal write capability. Private `mutative` patches fork copy-on-write indexes and derive the authoritative affected-node set without deep-comparing opaque models. Every persistent edit becomes a patch-free public `DocumentChangeSet`, while `PreviewTransaction` publishes disposable incrementally checked views and commits one fully validated change set. Designer gestures, editing sessions, slot reparenting, and property previews consume this pipeline; this is intentionally a single-process writer with no CRDT or remote merge behavior.

**Tech Stack:** TypeScript strict mode, `mutative` patches, Vue 3 reactivity adapters, Vitest with happy-dom, pnpm workspace, existing `@easyink/schema`, `@easyink/core`, `@easyink/shared`, and `@easyink/designer` packages.

---

## Scope And Prerequisites

Execute `docs/superpowers/plans/2026-07-11-material-platform-foundation.md` first. This plan consumes, but does not redefine:

- Canonical required `MaterialNode.slots`, `bindings`, and `output` fields from `packages/schema/src/types.ts`; the profile-aware loader materializes their defaults during admission.
- `CompiledMaterialProfile` from `packages/core/src/material-profile.ts`.
- `MaterialSlotAddress`, `MaterialNodeAddress`, and `walkMaterialNodes()` from `packages/core/src/material-introspection.ts`.
- `MaterialStructureSlot.coordinateSpace: 'document' | 'owner' | 'slot'`; slot-local children use the committed padded slot content box as their origin, supplied to editing through an immutable layout geometry sidecar rather than material-private model inspection.
- `JsonValue`, `assertJsonValue()`, `cloneJsonValue()`, and `JsonValueValidationError` from `packages/shared/src/json-value.ts`.
- The discriminated `validateDocumentWithProfile()` options from `packages/core/src/schema-adapter.ts`: edit mode accepts `{ baselineNodeStates, affectedNodeIds }`, while history restore accepts `{ mode: 'history-restore', targetNodeStates }`. `MaterialDocumentValidationReport`, `MaterialNodeLoadState`, and `MaterialLoadDiagnostic` come from the same module. Authoritative commit/history validation checks the canonical envelope and complete graph, preserves untouched quarantine sidecars, and limits node-level semantic validation/read-only checks to affected stable IDs. Task 6 adds an optional patch-scoped `SchemaAdapter.validatePreview` hook and a distinct provisional report; it never weakens the commit gate.
- `PropertyDescriptor`, `resolvePropertyAccessor()`, and `PropertyAccessor.paths` as canonical node-relative RFC 6901 pointers from `packages/core/src/material-properties.ts`.
- `createTestCompiledMaterialProfile()` from `@easyink/core/testing`; its no-argument fixture includes `box` and a `container.content` slot.
- Registry-first Designer initialization: `DesignerStore` receives a frozen `CompiledMaterialProfile` in its constructor options before it loads the document.

This plan does not change material manifests, schema adapters, Viewer layout, pagination, measurement, or table-private topology. A later table plan supplies stable row/cell IDs and a table-specific selection rebaser using the generic contracts implemented here.

## File Map

| File | Responsibility |
| --- | --- |
| `packages/core/src/document-index.ts` | Immutable node/address/slot-policy lookup for a document revision. |
| `packages/core/src/document-store.ts` | Frozen committed/preview snapshots and subscription events. |
| `packages/core/src/document-store-internal.ts` | Non-public write capability shared only with the transaction engine. |
| `packages/core/src/document-change-set.ts` | Public stable operation/affected-ID metadata and strict coalescing identity. |
| `packages/core/src/document-transaction-engine.ts` | Single writer, private patches/sidecars, history, undo/redo, node transactions, and batches. |
| `packages/core/src/preview-transaction.ts` | Replaceable preview state with commit/cancel semantics. |
| `packages/core/src/document-operations.ts` | Pure draft operations reused by UI and Assistant transaction callers. |
| `packages/core/src/selection-region.ts` | Stable-ID region shape and generic rebase helpers. |
| `packages/core/src/matrix-chain.ts` | Affine matrix composition, inversion, and node-local transforms. |
| `packages/core/src/slot-reparent.ts` | Composable cycle-safe slot plan with stable anchors and world-pose preservation. |
| `packages/designer/src/editing/gesture-coordinator.ts` | One active pointer mutation gesture and preview ownership. |
| `packages/designer/src/editing/property-preview-controller.ts` | Property gesture to preview/commit/cancel bridge. |
| `packages/designer/src/editing/editing-session-manager.ts` | `EditingSessionPath` stack and document-change rebasing. |
| `packages/designer/src/store/designer-store.ts` | Vue-facing ownership of store, engine, history, gestures, and immutable reads. |

### Prerequisite Gate: Verify The Foundation JSON Boundary

**Files:**
- Test: `packages/shared/src/json-value.test.ts` (created by the material-platform foundation plan)
- Test later integrations in `packages/core/src/document-change-set.test.ts`, `packages/core/src/document-transaction-engine.test.ts`, and `packages/designer/src/editing/selection-store.test.ts`

This is a read-only entry gate, not a TDD mutation task. It changes and commits no files in this plan: PASS is required before Task 2 starts; any failure is fixed and committed in the material-platform foundation plan before returning here.

- [ ] **Step 1: Run the foundation JSON-value contract tests**

Run: `pnpm exec vitest run packages/shared/src/json-value.test.ts`

Expected: PASS; `assertJsonValue()` rejects undefined, functions, symbols, bigint, non-finite numbers, cycles, non-plain objects, unsafe keys, and any value JSON cloning would silently discard, with RFC 6901 diagnostic paths.

- [ ] **Step 2: Confirm this plan has one JSON implementation owner**

Run: `rg -n "export (function|class) (assertJsonValue|cloneJsonValue|JsonValueValidationError)" packages`

Expected: matches only `packages/shared/src/json-value.ts`. This plan imports that API for change-set metadata, selection payloads, store admission, preview publication, and commit validation; it does not add a second validator or use `structuredClone`.

### Task 2: Immutable Document Index Snapshot

**Files:**
- Create: `packages/core/src/document-index.ts`
- Create: `packages/core/src/document-index.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing index tests**

```ts
import type { DocumentSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createDefaultSchema } from '@easyink/schema'
import { create } from 'mutative'
import { createTestCompiledMaterialProfile } from './testing/material-profile'
import { DocumentIndexSnapshot, DuplicateDocumentNodeIdError, forkDocumentIndexSnapshot } from './document-index'

describe('DocumentIndexSnapshot', () => {
  it('indexes root and nested slot nodes by stable ID', () => {
    const profile = createTestCompiledMaterialProfile()
    const child = profile.createNode('box', { id: 'child' })
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [child] } })
    const schema: DocumentSchema = { ...createDefaultSchema(), elements: [owner] }
    const index = DocumentIndexSnapshot.build(schema, profile, 4)

    expect(index.revision).toBe(4)
    expect(index.getNode('child')).toBe(child)
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
    const [next, forward, inverse] = create(schema, (draft) => {
      draft.elements[0]!.slots.content[0]!.model.value = 2
    }, { enablePatches: true, enableAutoFreeze: true })

    const result = forkDocumentIndexSnapshot(before, next, profile, 5, forward, inverse)

    expect(result.index.revision).toBe(5)
    expect(result.index.getNode('child')!.model.value).toBe(2)
    expect(result.index.getAddress('owner')).toBe(ownerAddress)
    expect(result.impact.affectedNodeIds).toEqual(['child'])
    expect(result.impact.changedPathsByNodeId.get('child')).toEqual(['/model/value'])
  })
})
```

- [ ] **Step 2: Run the index test to verify it fails**

Run: `pnpm exec vitest run --dom packages/core/src/document-index.test.ts`

Expected: FAIL because `DocumentIndexSnapshot` is not exported.

- [ ] **Step 3: Implement the immutable index wrapper**

```ts
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { Patch } from 'mutative'
import type { CompiledMaterialProfile } from './material-profile'
import type { MaterialNodeAddress, MaterialStructureSlot } from './material-introspection'
import { walkMaterialNodes } from './material-introspection'

export interface DocumentSlotPolicySnapshot {
  readonly ownerNodeId: string
  readonly slot: string
  readonly policyId: string
  readonly coordinateSpace: MaterialStructureSlot['coordinateSpace']
  readonly layoutParticipation: MaterialStructureSlot['layoutParticipation']
  readonly reparent: MaterialStructureSlot['reparent']
}

export class DuplicateDocumentNodeIdError extends Error {
  constructor(readonly nodeId: string) {
    super(`Duplicate material node id "${nodeId}"`)
    this.name = 'DuplicateDocumentNodeIdError'
  }
}

interface DocumentPatchImpact {
  readonly baseRevision: number
  readonly candidateRevision: number
  readonly affectedNodeIds: readonly string[]
  readonly changedPathsByNodeId: ReadonlyMap<string, readonly `/${string}`[]>
  readonly changedDocumentPaths: readonly `/${string}`[]
  readonly structural: boolean
}

interface DocumentIndexForkResult {
  readonly index: DocumentIndexSnapshot
  readonly impact: DocumentPatchImpact
}

export class DocumentIndexSnapshot {
  private constructor(
    readonly revision: number,
    private readonly nodes: ReadonlyMap<string, MaterialNode>,
    private readonly addresses: ReadonlyMap<string, MaterialNodeAddress>,
    private readonly slots: ReadonlyMap<string, DocumentSlotPolicySnapshot>,
    private readonly paths: ReadonlyMap<string, readonly (string | number)[]>,
  ) {}

  static build(document: DocumentSchema, profile: CompiledMaterialProfile, revision: number): DocumentIndexSnapshot {
    const nodes = new Map<string, MaterialNode>()
    const addresses = new Map<string, MaterialNodeAddress>()
    const slots = new Map<string, DocumentSlotPolicySnapshot>()
    const paths = collectCanonicalNodePaths(document)
    walkMaterialNodes(document, profile, (node, address, introspection) => {
      if (nodes.has(node.id))
        throw new DuplicateDocumentNodeIdError(node.id)
      nodes.set(node.id, node)
      addresses.set(node.id, Object.freeze({ ...address, ancestors: Object.freeze([...address.ancestors]) }))
      for (const structure of introspection.structures) {
        slots.set(slotKey(node.id, structure.slot), Object.freeze({
          ownerNodeId: node.id,
          slot: structure.slot,
          policyId: structure.policyId,
          coordinateSpace: structure.coordinateSpace,
          layoutParticipation: structure.layoutParticipation,
          reparent: structure.reparent,
        }))
      }
    })
    return new DocumentIndexSnapshot(revision, nodes, addresses, slots, paths)
  }

  hasNode(nodeId: string): boolean {
    return this.nodes.has(nodeId)
  }

  getNode(nodeId: string): MaterialNode | undefined {
    return this.nodes.get(nodeId)
  }

  resolveNode(document: DocumentSchema, nodeId: string): MaterialNode {
    const path = this.paths.get(nodeId)
    if (!path)
      throw new Error(`Document node "${nodeId}" not found`)
    let value: unknown = document
    for (const segment of path)
      value = (value as Record<string | number, unknown>)[segment]
    if (!value || typeof value !== 'object' || (value as MaterialNode).id !== nodeId)
      throw new Error(`Indexed path for document node "${nodeId}" is stale`)
    return value as MaterialNode
  }

  getAddress(nodeId: string): MaterialNodeAddress | undefined {
    return this.addresses.get(nodeId)
  }

  getParentNodeId(nodeId: string): string | null {
    return this.addresses.get(nodeId)?.ancestors.at(-1)?.ownerNodeId ?? null
  }

  getSlot(ownerNodeId: string, slot: string): DocumentSlotPolicySnapshot | undefined {
    return this.slots.get(slotKey(ownerNodeId, slot))
  }

  nodeIds(): readonly string[] {
    return Object.freeze([...this.nodes.keys()])
  }
}

/** @internal Imported only by the transaction engine and relative-path tests. */
export declare function forkDocumentIndexSnapshot(
  base: DocumentIndexSnapshot,
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  revision: number,
  forward: readonly Patch[],
  inverse: readonly Patch[],
): DocumentIndexForkResult

export function requireDocumentNode(
  document: DocumentSchema,
  _profile: CompiledMaterialProfile,
  nodeId: string,
): MaterialNode {
  const pending = [...document.elements]
  while (pending.length > 0) {
    const node = pending.pop()!
    if (node.id === nodeId)
      return node
    for (const children of Object.values(node.slots))
      pending.push(...children)
  }
  throw new Error(`Document node "${nodeId}" not found`)
}

function collectCanonicalNodePaths(document: DocumentSchema): Map<string, readonly (string | number)[]> {
  const paths = new Map<string, readonly (string | number)[]>()
  const visit = (nodes: readonly MaterialNode[], parent: readonly (string | number)[]) => {
    nodes.forEach((node, index) => {
      const path = Object.freeze([...parent, index])
      paths.set(node.id, path)
      for (const slot of Object.keys(node.slots).sort())
        visit(node.slots[slot]!, [...path, 'slots', slot])
    })
  }
  visit(document.elements, ['elements'])
  return paths
}

function slotKey(ownerNodeId: string, slot: string): string {
  return `${ownerNodeId}\u0000${slot}`
}
```

Implement `forkDocumentIndexSnapshot()` in the same module as the only patch-path-to-node ownership analyzer. It parses canonical `elements -> node -> slots -> slot -> node` structure without descending into `model`, `bindings`, `extensions`, or other opaque values. It consumes both forward and inverse private patches: the before side resolves removals and old parents, while the candidate side resolves additions and new parents. A patch below a node-owned non-structural field marks that stable node ID and records a node-relative RFC 6901 path without comparing the field value. A patch that intersects `id`, `type`, a slot key, a material-node array, or an entire node is structural and locally reindexes the touched before/after slot subtrees.

The index internals are persistent read-only overlay maps keyed by the committed revision. A preview fork retains the base revision; an authoritative commit/history fork uses `base.revision + 1`. A non-structural fork overlays only the changed node reference and reuses address/policy/order records by identity. A structural fork overlays records for the touched source/target slots and moved/inserted/deleted subtrees; it must check duplicates against both unchanged base records and new records. Compact an overlay chain only on a committed write when its depth/changed fraction crosses a fixed threshold, never during pointer preview. Array index shifts are address maintenance, not semantic edits.

`DocumentPatchImpact.affectedNodeIds` is authoritative and deterministic: include inserted/deleted IDs, nodes whose own canonical fields or slot-key set changed, nodes whose parent owner/slot changed, and surviving siblings participating in a relative-order inversion. Do not mark siblings merely because an insertion/deletion shifted their array index. Do not read `DocumentOperationDescriptor.targetIds` while deriving impact; operation metadata is only public description/coalescing data. Reject unsafe patch segments, paths that cross a non-canonical container, and structural patches whose before/after ownership cannot be proven. Export only `DocumentIndexSnapshot`, `DocumentSlotPolicySnapshot`, `DuplicateDocumentNodeIdError`, and `requireDocumentNode` from `packages/core/src/index.ts`; keep `DocumentPatchImpact`, `mutative.Patch`, changed paths, probes, and the fork helper out of the public barrel and generated entry declaration.

- [ ] **Step 4: Run the index tests**

Run: `pnpm exec vitest run --dom packages/core/src/document-index.test.ts`

Expected: PASS with 3 tests; the fork reports the stable owner of the changed opaque path and reuses unaffected address records.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/document-index.ts packages/core/src/document-index.test.ts packages/core/src/index.ts
git commit -m "feat(core): add immutable document index snapshots"
```

### Task 3: Frozen Document Store And Internal Writer Capability

**Files:**
- Create: `packages/core/src/document-store-internal.ts`
- Create: `packages/core/src/document-store.ts`
- Create: `packages/core/src/document-store.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing cloned/frozen initial snapshot test**

```ts
import { describe, expect, it } from 'vitest'
import { createDefaultSchema } from '@easyink/schema'
import { createTestCompiledMaterialProfile } from './testing/material-profile'
import { DocumentStore } from './document-store'

describe('DocumentStore', () => {
  it('clones and recursively freezes the initial canonical document', () => {
    const profile = createTestCompiledMaterialProfile()
    const source = createDefaultSchema()
    source.elements = [profile.createNode('box', { id: 'a', x: 1 })]
    const store = new DocumentStore(source, profile)

    source.elements[0]!.x = 99
    expect(store.document.elements[0]!.x).toBe(1)
    expect(store.revision).toBe(0)
    expect(Object.isFrozen(store.document)).toBe(true)
    expect(Object.isFrozen(store.document.elements[0]!.model)).toBe(true)
    expect(() => { store.document.elements[0]!.x = 2 }).toThrow()
  })
})
```

- [ ] **Step 2: Run the store test to verify it fails**

Run: `pnpm exec vitest run --dom packages/core/src/document-store.test.ts`

Expected: FAIL because the store modules do not exist.

- [ ] **Step 3: Implement the internal symbol and store**

`packages/core/src/document-store-internal.ts`:

```ts
export const DOCUMENT_STORE_WRITER: unique symbol = Symbol('easyink.document-store-writer')
```

`packages/core/src/document-store.ts`:

```ts
import type { DocumentSchema } from '@easyink/schema'
import type { CompiledMaterialProfile } from './material-profile'
import type { MaterialDocumentValidationReport, MaterialNodeLoadState } from './schema-adapter'
import type { JsonValueValidationOptions } from '@easyink/shared'
import { assertJsonValue, cloneJsonValue } from '@easyink/shared'
import { DocumentIndexSnapshot } from './document-index'
import { DOCUMENT_STORE_WRITER } from './document-store-internal'
import { validateDocumentWithProfile } from './schema-adapter'

export type DocumentStoreEventKind = 'commit' | 'preview' | 'preview-cancel' | 'undo' | 'redo' | 'reset'

export interface DocumentStoreEvent {
  kind: DocumentStoreEventKind
  previousDocument: DocumentSchema
  previousIndex: DocumentIndexSnapshot
  document: DocumentSchema
  index: DocumentIndexSnapshot
  validationReport?: MaterialDocumentValidationReport
}

export type DocumentStoreWrite
  = { kind: 'preview', document: DocumentSchema, index: DocumentIndexSnapshot }
    | { kind: 'preview-cancel' }
    | {
      kind: Exclude<DocumentStoreEventKind, 'preview' | 'preview-cancel'>
      document: DocumentSchema
      index: DocumentIndexSnapshot
      validationReport: MaterialDocumentValidationReport
    }

export interface DocumentStoreOptions {
  nodeStates?: ReadonlyMap<string, MaterialNodeLoadState>
  jsonValidation?: JsonValueValidationOptions
}

export class DocumentStore {
  private committed: DocumentSchema
  private committedIndexValue: DocumentIndexSnapshot
  private preview: DocumentSchema | null = null
  private previewIndexValue: DocumentIndexSnapshot | null = null
  private materialNodeStatesValue: ReadonlyMap<string, MaterialNodeLoadState>
  private listeners = new Set<(event: DocumentStoreEvent) => void>()
  private revisionValue = 0
  readonly jsonValidation: Readonly<JsonValueValidationOptions>

  constructor(initial: DocumentSchema, readonly profile: CompiledMaterialProfile, options: DocumentStoreOptions = {}) {
    this.jsonValidation = Object.freeze({ ...options.jsonValidation })
    assertJsonValue(initial, this.jsonValidation)
    this.committed = freezeDocument(cloneJsonValue(initial, this.jsonValidation))
    const report = options.nodeStates
      ? validateDocumentWithProfile(this.committed, profile, {
          mode: 'history-restore', targetNodeStates: options.nodeStates,
        })
      : validateDocumentWithProfile(this.committed, profile, { affectedNodeIds: 'all' })
    if (!report.valid)
      throw new TypeError(report.diagnostics.map(item => `${item.code} ${item.path}: ${item.message}`).join('\n'))
    this.materialNodeStatesValue = report.nodeStates
    this.committedIndexValue = DocumentIndexSnapshot.build(this.committed, profile, 0)
  }

  get document(): DocumentSchema { return this.preview ?? this.committed }
  get committedDocument(): DocumentSchema { return this.committed }
  get index(): DocumentIndexSnapshot { return this.previewIndexValue ?? this.committedIndexValue }
  get committedIndex(): DocumentIndexSnapshot { return this.committedIndexValue }
  get materialNodeStates(): ReadonlyMap<string, MaterialNodeLoadState> { return this.materialNodeStatesValue }
  get revision(): number { return this.revisionValue }

  createIndex(document: DocumentSchema, revision: number): DocumentIndexSnapshot {
    return DocumentIndexSnapshot.build(document, this.profile, revision)
  }

  subscribe(listener: (event: DocumentStoreEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  [DOCUMENT_STORE_WRITER](write: DocumentStoreWrite): void {
    const isCommittedWrite = write.kind !== 'preview' && write.kind !== 'preview-cancel'
    const previousDocument = isCommittedWrite ? this.committed : this.document
    const previousIndex = isCommittedWrite ? this.committedIndexValue : this.index
    if (write.kind === 'preview') {
      this.preview = acceptFrozenCandidate(write.document)
      this.previewIndexValue = write.index
    }
    else if (write.kind === 'preview-cancel') {
      this.preview = null
      this.previewIndexValue = null
    }
    else {
      this.revisionValue = write.kind === 'reset' ? 0 : this.revisionValue + 1
      this.committed = write.kind === 'reset'
        ? freezeDocument(cloneJsonValue(write.document, this.jsonValidation))
        : acceptFrozenCandidate(write.document)
      this.committedIndexValue = write.index
      this.preview = null
      this.previewIndexValue = null
      this.materialNodeStatesValue = write.validationReport.nodeStates
    }
    const event: DocumentStoreEvent = {
      kind: write.kind,
      previousDocument,
      previousIndex,
      document: this.document,
      index: this.index,
    }
    if ('validationReport' in write)
      event.validationReport = write.validationReport
    for (const listener of this.listeners)
      listener(event)
  }
}

function freezeDocument<T extends object>(value: T): T {
  if (!Object.isFrozen(value))
    Object.freeze(value)
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object')
      freezeDocument(child)
  }
  return value
}

function acceptFrozenCandidate<T extends object>(value: T): T {
  if (!Object.isFrozen(value))
    throw new TypeError('Internal document candidate must be auto-frozen')
  return value
}
```

When `nodeStates` is supplied it is an already-admitted, complete sidecar, not a touched-node cache. Constructor validation therefore uses `history-restore` mode to require exact live-ID/state correspondence and to preserve every state object, including quarantine diagnostics, without re-admitting any node. When it is omitted, the canonical input is validated as a fresh all-node edit. `jsonValidation` is a document-level admission budget and is reused by reset, commit, history, and patch-scoped preview checks; deployments that admit very large static table models must raise it explicitly rather than disabling limits. Preview/commit/history candidates come only from internal `mutative`/`apply` calls with auto-freeze enabled, so the store performs an O(1) frozen-root assertion and never recursively freezes a 100k-cell preview again; reset remains a cloned, fully validated, recursively frozen admission path. Export only `DocumentStore` and its public event/option types from `packages/core/src/index.ts`; do not export `DOCUMENT_STORE_WRITER` from the package entry.

- [ ] **Step 4: Run the store tests**

Run: `pnpm exec vitest run --dom packages/core/src/document-store.test.ts`

Expected: PASS with 1 test.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/document-store-internal.ts packages/core/src/document-store.ts packages/core/src/document-store.test.ts packages/core/src/index.ts
git commit -m "feat(core): add frozen document store"
```

### Task 4: Document Change Sets And Coalescing

**Files:**
- Create: `packages/core/src/document-change-set.ts`
- Create: `packages/core/src/document-change-set.test.ts`
- Modify: `packages/core/src/document-store.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing stable-operation and strict-coalescing tests**

```ts
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
  const sequence = id === 'a' ? 0 : 1
  return createDocumentChangeSet({
    id,
    label: 'Move',
    baseRevision: sequence,
    committedRevision: sequence + 1,
    startedAt: 100 + sequence * 80,
    updatedAt: 100 + sequence * 80,
    mergeKey: 'move',
    mergeWindowMs: 300,
    barrierGeneration: 0,
    affectedNodeIds: ['a'],
    operation,
    ...overrides,
  })
}

describe('DocumentChangeSet', () => {
  it('coalesces metadata only when every stable operation identity field matches', () => {
    const merged = mergeDocumentChangeSets(change('a'), change('b'))
    expect(merged).toMatchObject({ baseRevision: 0, committedRevision: 2, affectedNodeIds: ['a'] })
    expect(Object.isFrozen(merged?.operation.targetIds)).toBe(true)
  })

  it.each([
    ['kind', { kind: 'geometry.resize' }],
    ['session path', { sessionPath: ['owner'] }],
    ['target IDs', { targetIds: ['node:b'] }],
    ['field paths', { fieldPaths: ['/x'] }],
    ['selection lineage', { selectionLineage: 'selection-2' }],
    ['structural operation', { structural: true }],
  ] satisfies ReadonlyArray<readonly [string, Partial<DocumentOperationDescriptor>]>)
  ('does not coalesce when %s differs', (_label, operationOverride) => {
    const next = change('b', { operation: { ...operation, ...operationOverride } })
    expect(canCoalesceDocumentChanges(change('a'), next)).toBe(false)
  })

  it('does not cross an intermediate history barrier generation', () => {
    expect(canCoalesceDocumentChanges(change('a'), change('b', { barrierGeneration: 1 }))).toBe(false)
  })

  it('requires one merge key/window, contiguous revisions, and forward adjacent time', () => {
    expect(canCoalesceDocumentChanges(change('a', { mergeKey: undefined }), change('b'))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { mergeKey: 'other' }))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { mergeWindowMs: 301 }))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { baseRevision: 5, committedRevision: 6 }))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { startedAt: 50, updatedAt: 50 }))).toBe(false)
    expect(canCoalesceDocumentChanges(change('a'), change('b', { startedAt: 401, updatedAt: 401 }))).toBe(false)
  })

  it('uses the previous adjacent update time instead of the start of a long input sequence', () => {
    const first = change('a', { startedAt: 0, updatedAt: 0 })
    const second = change('b', { startedAt: 250, updatedAt: 250 })
    const firstTwo = mergeDocumentChangeSets(first, second)!
    const third = change('b', { id: 'c', baseRevision: 2, committedRevision: 3, startedAt: 500, updatedAt: 500 })
    expect(mergeDocumentChangeSets(firstTwo, third)).toMatchObject({ startedAt: 0, updatedAt: 500 })
  })

  it('never merges different nodes that accidentally share a merge key', () => {
    const next = change('b', {
      affectedNodeIds: ['b'],
      operation: { ...operation, targetIds: ['node:b'] },
    })
    expect(mergeDocumentChangeSets(change('a'), next)).toBeNull()
  })

  it('combines composable recipes without exposing transient patch paths', () => {
    const combined = combineStableOperationDescriptors('table.cell.materials', [
      operation,
      { ...operation, kind: 'structure.reparent', targetIds: ['node:b'], fieldPaths: ['/slots/cell~11'], structural: true },
    ])
    expect(combined).toEqual({
      kind: 'table.cell.materials', sessionPath: [], targetIds: ['node:a', 'node:b'],
      fieldPaths: ['/slots/cell~11', '/x', '/y'], selectionLineage: 'selection-1', structural: true,
    })
    expect(Object.isFrozen(combined.targetIds)).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run --dom packages/core/src/document-change-set.test.ts`

Expected: FAIL because the change-set module does not exist.

- [ ] **Step 3: Implement public stable-operation metadata without exporting patches**

```ts
import { assertJsonValue } from '@easyink/shared'

export type DocumentFieldPath = '' | `/${string}`

export interface DocumentOperationDescriptor {
  readonly kind: string
  readonly sessionPath: readonly string[]
  readonly targetIds: readonly string[]
  readonly fieldPaths: readonly DocumentFieldPath[]
  readonly selectionLineage: string | null
  readonly structural: boolean
}

export interface DocumentChangeSet {
  readonly id: string
  readonly label: string
  readonly baseRevision: number
  readonly committedRevision: number
  readonly startedAt: number
  readonly updatedAt: number
  readonly mergeKey?: string
  readonly mergeWindowMs: number
  readonly barrierGeneration: number
  readonly affectedNodeIds: readonly string[]
  readonly operation: DocumentOperationDescriptor
}

export function createDocumentChangeSet(input: DocumentChangeSet): DocumentChangeSet {
  if (!input.id || !input.label)
    throw new TypeError('Document change id and label cannot be empty')
  if (!Number.isInteger(input.baseRevision) || !Number.isInteger(input.committedRevision) || input.committedRevision <= input.baseRevision)
    throw new TypeError('Document change revisions must be increasing integers')
  if (!Number.isFinite(input.startedAt) || !Number.isFinite(input.updatedAt) || input.updatedAt < input.startedAt)
    throw new TypeError('Document change timestamps are invalid')
  if (!Number.isInteger(input.barrierGeneration) || input.barrierGeneration < 0)
    throw new TypeError('Document history barrier generation must be a non-negative integer')
  if (!Number.isFinite(input.mergeWindowMs) || input.mergeWindowMs < 0)
    throw new TypeError('Document merge window must be a non-negative finite number')
  if (!input.operation.kind.trim())
    throw new TypeError('Document operation kind cannot be empty')
  if (input.operation.targetIds.length === 0)
    throw new TypeError('Document operation requires at least one stable target ID')
  if (input.operation.fieldPaths.some(path => !isCanonicalJsonPointer(path)))
    throw new TypeError('Document operation field paths must be RFC 6901 pointers')
  assertJsonValue(input.operation)
  return Object.freeze({
    ...input,
    affectedNodeIds: Object.freeze([...new Set(input.affectedNodeIds)].sort()),
    operation: Object.freeze({
      ...input.operation,
      sessionPath: Object.freeze([...input.operation.sessionPath]),
      targetIds: Object.freeze([...new Set(input.operation.targetIds)].sort()),
      fieldPaths: Object.freeze([...new Set(input.operation.fieldPaths)].sort()),
    }),
  })
}

export function canCoalesceDocumentChanges(previous: DocumentChangeSet, next: DocumentChangeSet): boolean {
  if (!previous.mergeKey || previous.mergeKey !== next.mergeKey)
    return false
  if (previous.mergeWindowMs !== next.mergeWindowMs)
    return false
  if (next.startedAt < previous.updatedAt || next.startedAt - previous.updatedAt > previous.mergeWindowMs)
    return false
  if (next.baseRevision !== previous.committedRevision)
    return false
  if (previous.barrierGeneration !== next.barrierGeneration)
    return false
  const left = previous.operation
  const right = next.operation
  if (left.structural || right.structural)
    return false
  return left.kind === right.kind
    && left.selectionLineage === right.selectionLineage
    && sameStrings(left.sessionPath, right.sessionPath)
    && sameStrings(left.targetIds, right.targetIds)
    && sameStrings(left.fieldPaths, right.fieldPaths)
}

export function mergeDocumentChangeSets(previous: DocumentChangeSet, next: DocumentChangeSet): DocumentChangeSet | null {
  if (!canCoalesceDocumentChanges(previous, next))
    return null
  return createDocumentChangeSet({
    id: next.id,
    label: next.label,
    baseRevision: previous.baseRevision,
    committedRevision: next.committedRevision,
    startedAt: previous.startedAt,
    updatedAt: next.updatedAt,
    mergeKey: previous.mergeKey,
    mergeWindowMs: previous.mergeWindowMs,
    barrierGeneration: previous.barrierGeneration,
    affectedNodeIds: [...previous.affectedNodeIds, ...next.affectedNodeIds],
    operation: next.operation,
  })
}

export function combineStableOperationDescriptors(
  kind: string,
  operations: readonly DocumentOperationDescriptor[],
): DocumentOperationDescriptor {
  if (!kind.trim() || operations.length === 0)
    throw new TypeError('A combined operation requires a kind and at least one operation')
  if (operations.some(operation => operation.targetIds.length === 0 || operation.fieldPaths.some(path => !isCanonicalJsonPointer(path))))
    throw new TypeError('Combined operations require stable target IDs and canonical RFC 6901 paths')
  const first = operations[0]!
  const sessionPath = operations.every(operation => sameStrings(operation.sessionPath, first.sessionPath))
    ? first.sessionPath
    : []
  const selectionLineage = operations.every(operation => operation.selectionLineage === first.selectionLineage)
    ? first.selectionLineage
    : null
  const combined = {
    kind,
    sessionPath: Object.freeze([...sessionPath]),
    targetIds: Object.freeze([...new Set(operations.flatMap(operation => operation.targetIds))].sort()),
    fieldPaths: Object.freeze([...new Set(operations.flatMap(operation => operation.fieldPaths))].sort()),
    selectionLineage,
    structural: operations.some(operation => operation.structural),
  } satisfies DocumentOperationDescriptor
  assertJsonValue(combined)
  return Object.freeze(combined)
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isCanonicalJsonPointer(path: string): path is DocumentFieldPath {
  return path === '' || (path.startsWith('/') && path.slice(1).split('/').every(token => !/~(?:[^01]|$)/.test(token)))
}
```

Export the public types and functions, including `combineStableOperationDescriptors(kind, operations)`, from `packages/core/src/index.ts`. The combiner accepts only stable semantic descriptors and is the composition boundary for a material-private recipe plus a core structural recipe. `mutative.Patch`, patch paths, and the engine's inverse data remain private to `document-transaction-engine.ts` and must not appear in `DocumentChangeSet` or the generated package declarations.

Now that the type exists, import `DocumentChangeSet` as a type in `packages/core/src/document-store.ts`, add `changeSet?: DocumentChangeSet` to `DocumentStoreEvent` and the committed `DocumentStoreWrite` branch, and copy it into the emitted event only when present:

```ts
if ('changeSet' in write && write.changeSet)
  event.changeSet = write.changeSet
```

- [ ] **Step 4: Run the change-set tests**

Run: `pnpm exec vitest run --dom packages/core/src/document-change-set.test.ts`

Expected: PASS; all operation-identity, revision, adjacent-time, merge-window, and barrier-generation cases behave independently, and descriptor composition exposes only stable metadata.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/document-change-set.ts packages/core/src/document-change-set.test.ts packages/core/src/document-store.ts packages/core/src/index.ts
git commit -m "feat(core): define document change sets"
```

### Task 5: Single-Writer Document Transaction Engine

**Files:**
- Create: `packages/core/src/document-transaction-engine.ts`
- Create: `packages/core/src/document-transaction-engine.test.ts`
- Modify: `packages/core/src/editing-session.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing atomic edit, coalescing, undo, and batch tests**

```ts
import { describe, expect, it } from 'vitest'
import { createDefaultSchema } from '@easyink/schema'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'
import { DocumentStore } from './document-store'
import { loadDocumentWithProfile, recordSchemaAdapter } from './schema-adapter'
import { DocumentTransactionEngine, DocumentValidationError } from './document-transaction-engine'

const moveOperation = {
  kind: 'geometry.move', sessionPath: [], targetIds: ['node:a', 'node:b'], fieldPaths: ['/x'],
  selectionLineage: 'selection-1', structural: false,
} as const

describe('DocumentTransactionEngine', () => {
  it('edits multiple nodes atomically and undoes the resulting data change set', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createDefaultSchema()
    schema.elements = [
      profile.createNode('box', { id: 'a', x: 0 }),
      profile.createNode('box', { id: 'b', x: 5 }),
    ]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store, { now: () => 100, createId: () => 'change-1' })

    engine.transact((draft) => {
      draft.elements[0]!.x = 20
      draft.elements[1]!.x = 25
    }, { label: 'Move selection', operation: moveOperation })

    expect(store.document.elements.map(node => node.x)).toEqual([20, 25])
    expect(engine.historyEntries).toEqual([{ id: 'change-1', type: 'document-change', description: 'Move selection' }])
    engine.undo()
    expect(store.document.elements.map(node => node.x)).toEqual([0, 5])
    engine.redo()
    expect(store.document.elements.map(node => node.x)).toEqual([20, 25])
  })

  it('derives affected nodes from private patches even when operation metadata lies', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'box' })])
    const loaded = loadDocumentWithProfile({ ...createDefaultSchema(), elements: [
      { id: 'unknown-1', type: 'vendor/missing', props: { opaque: 1 } },
      profile.createNode('box', { id: 'healthy-1' }),
    ] }, profile)
    const store = new DocumentStore(loaded.schema, profile, { nodeStates: loaded.nodeStates })
    const engine = new DocumentTransactionEngine(store)

    expect(() => engine.transact((draft) => {
      draft.elements[0]!.model.opaque = 2
    }, {
      label: 'Misdescribed edit',
      operation: {
        kind: 'material.property', sessionPath: [], targetIds: ['node:healthy-1'], fieldPaths: ['/model/opaque'],
        selectionLineage: null, structural: false,
      },
    })).toThrow(/MATERIAL_NODE_READ_ONLY/)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)
  })

  it('coalesces only adjacent changes with the same key', () => {
    let now = 10
    const profile = createTestCompiledMaterialProfile()
    const schema = createDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store, { now: () => now, createId: () => `c-${now}` })
    const initialNodeState = store.materialNodeStates.get('a')
    const operation = { ...moveOperation, targetIds: ['node:a'] }
    engine.run('a', draft => { draft.x = 1 }, { label: 'Move', mergeKey: 'move:a', operation })
    now = 20
    engine.run('a', draft => { draft.x = 2 }, { label: 'Move', mergeKey: 'move:a', operation })
    const coalescedNodeState = store.materialNodeStates.get('a')
    expect(engine.totalCount).toBe(1)
    engine.markHistoryBarrier()
    now = 30
    engine.run('a', draft => { draft.x = 3 }, { label: 'Move', mergeKey: 'move:a', operation })
    expect(engine.totalCount).toBe(2)
    engine.undo()
    expect(store.document.elements[0]!.x).toBe(2)
    expect(store.materialNodeStates.get('a')).toBe(coalescedNodeState)
    engine.undo()
    expect(store.document.elements[0]!.x).toBe(0)
    expect(store.materialNodeStates.get('a')).toBe(initialNodeState)
    engine.redo()
    expect(store.document.elements[0]!.x).toBe(2)
    expect(store.materialNodeStates.get('a')).toBe(coalescedNodeState)
  })

  it('rejects an invalid adapter result atomically with stable diagnostic code and path', () => {
    const baseAdapter = recordSchemaAdapter(1)
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'box',
      schemaAdapter: {
        ...baseAdapter,
        validate: node => typeof node.model.value === 'number' && node.model.value < 0
          ? [{ code: 'BOX_VALUE_NEGATIVE', severity: 'error', path: '/model/value', message: 'value must be non-negative' }]
          : [],
      },
    })])
    const schema = createDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', model: { value: 1 } })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const before = store.committedDocument

    expect(() => engine.run('a', draft => { draft.model.value = -1 }, {
      label: 'Invalid value',
      operation: {
        kind: 'material.property', sessionPath: [], targetIds: ['node:a'], fieldPaths: ['/model/value'],
        selectionLineage: null, structural: false,
      },
    })).toThrowError(DocumentValidationError)
    try {
      engine.run('a', draft => { draft.model.value = -1 }, {
        label: 'Invalid value',
        operation: {
          kind: 'material.property', sessionPath: [], targetIds: ['node:a'], fieldPaths: ['/model/value'],
          selectionLineage: null, structural: false,
        },
      })
    }
    catch (error) {
      expect((error as DocumentValidationError).diagnostics).toContainEqual(expect.objectContaining({
        code: 'BOX_VALUE_NEGATIVE', path: '/elements/0/model/value',
      }))
    }
    expect(store.committedDocument).toBe(before)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)
  })

  it('edits beside quarantine, rejects quarantine mutation, permits deletion, and restores its exact sidecar', () => {
    const profile = createTestCompiledMaterialProfile()
    const unknown = { ...profile.createNode('box', { id: 'unknown-1', model: { opaque: 1 } }), type: 'vendor/missing' }
    const unknownNeighbor = { ...profile.createNode('box', { id: 'unknown-2', model: { opaque: 2 } }), type: 'vendor/other' }
    const healthy = profile.createNode('box', { id: 'box-1', model: { value: 1 } })
    const loaded = loadDocumentWithProfile({ ...createDefaultSchema(), elements: [unknown, unknownNeighbor, healthy] }, profile)
    const quarantineState = loaded.nodeStates.get('unknown-1')!
    const neighborState = loaded.nodeStates.get('unknown-2')!
    const store = new DocumentStore(loaded.schema, profile, { nodeStates: loaded.nodeStates })
    const engine = new DocumentTransactionEngine(store)

    engine.run('box-1', draft => { draft.model.value = 2 }, {
      label: 'Healthy edit',
      operation: {
        kind: 'material.property', sessionPath: [], targetIds: ['node:box-1'], fieldPaths: ['/model/value'],
        selectionLineage: null, structural: false,
      },
    })
    expect(store.materialNodeStates.get('unknown-1')).toBe(quarantineState)
    expect(store.document.elements.find(node => node.id === 'box-1')!.model.value).toBe(2)

    const beforeRejectedEdit = store.committedDocument
    let rejection: unknown
    try {
      engine.run('unknown-1', draft => { draft.model.opaque = 2 }, {
        label: 'Forbidden quarantine edit',
        operation: {
          kind: 'material.property', sessionPath: [], targetIds: ['node:unknown-1'], fieldPaths: ['/model/opaque'],
          selectionLineage: null, structural: false,
        },
      })
    }
    catch (error) {
      rejection = error
    }
    expect(rejection).toBeInstanceOf(DocumentValidationError)
    expect((rejection as DocumentValidationError).diagnostics).toContainEqual(expect.objectContaining({
      code: 'MATERIAL_NODE_READ_ONLY', nodeId: 'unknown-1',
    }))
    expect(store.committedDocument).toBe(beforeRejectedEdit)
    expect(store.revision).toBe(1)
    expect(engine.totalCount).toBe(1)

    engine.transact((draft) => {
      draft.elements.splice(draft.elements.findIndex(node => node.id === 'unknown-1'), 1)
    }, {
      label: 'Delete unavailable material',
      operation: {
        kind: 'structure.delete', sessionPath: [], targetIds: ['node:unknown-1'], fieldPaths: ['/elements'],
        selectionLineage: null, structural: true,
      },
    })
    expect(store.materialNodeStates.has('unknown-1')).toBe(false)
    expect(store.materialNodeStates.get('unknown-2')).toBe(neighborState)

    engine.undo()
    expect(store.document.elements.some(node => node.id === 'unknown-1')).toBe(true)
    expect(store.materialNodeStates.get('unknown-1')).toBe(quarantineState)
    expect(store.materialNodeStates.get('unknown-2')).toBe(neighborState)
    engine.redo()
    expect(store.materialNodeStates.has('unknown-1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the engine test to verify it fails**

Run: `pnpm exec vitest run --dom packages/core/src/document-transaction-engine.test.ts`

Expected: FAIL because `DocumentTransactionEngine` is not exported.

- [ ] **Step 3: Implement the engine and update `TransactionAPI` comments**

Implement `packages/core/src/document-transaction-engine.ts` with this public surface:

```ts
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { Patch } from 'mutative'
import type { DocumentChangeSet, DocumentOperationDescriptor } from './document-change-set'
import type { DocumentStore } from './document-store'
import type { TransactionAPI, TxOptions } from './editing-session'
import type { MaterialLoadDiagnostic, MaterialDocumentValidationReport, MaterialNodeLoadState } from './schema-adapter'
import { assertJsonValue, generateId } from '@easyink/shared'
import { apply, create } from 'mutative'
import { combineStableOperationDescriptors, createDocumentChangeSet, mergeDocumentChangeSets } from './document-change-set'
import { forkDocumentIndexSnapshot, requireDocumentNode } from './document-index'
import { DOCUMENT_STORE_WRITER } from './document-store-internal'
import { validateDocumentWithProfile } from './schema-adapter'

export type DocumentRecipe = (draft: DocumentSchema) => void | DocumentSchema

export interface DocumentTransactionOptions extends TxOptions {
  label: string
  operation: DocumentOperationDescriptor
}

export interface DocumentTransactionEngineOptions {
  now?: () => number
  createId?: () => string
}

export class DocumentValidationError extends Error {
  constructor(readonly diagnostics: readonly MaterialLoadDiagnostic[]) {
    super(diagnostics.map(item => `${item.code} ${item.path}: ${item.message}`).join('\n'))
    this.name = 'DocumentValidationError'
  }
}

interface DocumentHistoryEntry {
  readonly changeSet: DocumentChangeSet
  readonly forward: readonly Patch[]
  readonly inverse: readonly Patch[]
  readonly beforeNodeStates: ReadonlyMap<string, MaterialNodeLoadState>
  readonly afterNodeStates: ReadonlyMap<string, MaterialNodeLoadState>
}

export class DocumentTransactionEngine implements TransactionAPI {
  private undoStack: DocumentHistoryEntry[] = []
  private redoStack: DocumentHistoryEntry[] = []
  private listeners = new Set<() => void>()
  private batchRecipes: Array<{ recipe: DocumentRecipe, options: DocumentTransactionOptions }> | null = null
  private barrierGeneration = 0
  private readonly now: () => number
  private readonly createId: () => string

  constructor(readonly store: DocumentStore, options: DocumentTransactionEngineOptions = {}) {
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? (() => generateId('change'))
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }
  get cursor(): number { return this.undoStack.length }
  get totalCount(): number { return this.undoStack.length + this.redoStack.length }
  get historyEntries() {
    return [...this.undoStack, ...[...this.redoStack].reverse()].map(entry => ({
      id: entry.changeSet.id,
      type: 'document-change',
      description: entry.changeSet.label,
    }))
  }

  transact(recipe: DocumentRecipe, options: DocumentTransactionOptions): DocumentChangeSet | null {
    const base = this.store.committedDocument
    const [next, forward, inverse] = create(base, recipe, { enablePatches: true, enableAutoFreeze: true })
    if (forward.length === 0)
      return null
    return this.commitCandidate(next, forward, inverse, options)
  }

  run<TNode extends MaterialNode = MaterialNode>(nodeId: string, mutator: (draft: TNode) => void, options?: TxOptions): void {
    if (!options?.operation)
      this.markHistoryBarrier()
    const transactionOptions: DocumentTransactionOptions = {
      label: options?.label ?? 'Edit',
      mergeKey: options?.mergeKey,
      mergeWindowMs: options?.mergeWindowMs,
      operation: options?.operation ?? opaqueNodeOperation(nodeId),
    }
    const recipe: DocumentRecipe = (draft) => {
      mutator(requireDocumentNode(draft, this.store.profile, nodeId) as TNode)
    }
    if (this.batchRecipes) {
      this.batchRecipes.push({ recipe, options: transactionOptions })
      return
    }
    this.transact(recipe, transactionOptions)
  }

  batch<T>(fn: () => T): T {
    if (this.batchRecipes)
      return fn()
    this.batchRecipes = []
    try {
      const result = fn()
      const entries = this.batchRecipes!
      this.batchRecipes = null
      if (entries.length > 0) {
        this.transact((draft) => {
          for (const entry of entries)
            entry.recipe(draft)
        }, {
          label: entries.at(-1)!.options.label,
          operation: combineStableOperationDescriptors('batch', entries.map(entry => entry.options.operation)),
        })
      }
      return result
    }
    catch (error) {
      this.batchRecipes = null
      throw error
    }
  }

  undo(): void { this.applyHistory('undo') }
  redo(): void { this.applyHistory('redo') }

  markHistoryBarrier(): void {
    this.barrierGeneration += 1
  }

  goTo(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index > this.totalCount)
      throw new RangeError(`History index ${index} is out of range`)
    while (this.cursor > index)
      this.undo()
    while (this.cursor < index)
      this.redo()
  }

  clear(): void {
    this.undoStack = []
    this.redoStack = []
    this.notify()
  }

  reset(document: DocumentSchema, nodeStates?: ReadonlyMap<string, MaterialNodeLoadState>): void {
    this.markHistoryBarrier()
    assertJsonValue(document, this.store.jsonValidation)
    const report = nodeStates
      ? validateDocumentWithProfile(document, this.store.profile, {
          mode: 'history-restore', targetNodeStates: nodeStates,
        })
      : validateDocumentWithProfile(document, this.store.profile, { affectedNodeIds: 'all' })
    assertValidReport(report)
    const index = this.store.createIndex(document, 0)
    this.store[DOCUMENT_STORE_WRITER]({ kind: 'reset', document, index, validationReport: report })
    this.clear()
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private commitCandidate(
    next: DocumentSchema,
    forward: readonly Patch[],
    inverse: readonly Patch[],
    options: DocumentTransactionOptions,
  ): DocumentChangeSet {
    const beforeNodeStates = this.store.materialNodeStates
    const { nextIndex, affectedNodeIds, report } = this.validateCandidate(next, forward, inverse)
    const nextRevision = this.store.revision + 1
    const timestamp = this.now()
    const change = createDocumentChangeSet({
      id: this.createId(),
      label: options.label,
      baseRevision: this.store.revision,
      committedRevision: nextRevision,
      startedAt: timestamp,
      updatedAt: timestamp,
      mergeKey: options.mergeKey,
      mergeWindowMs: options.mergeWindowMs ?? 300,
      barrierGeneration: this.barrierGeneration,
      affectedNodeIds,
      operation: options.operation,
    })
    this.store[DOCUMENT_STORE_WRITER]({
      kind: 'commit', document: next, index: nextIndex, changeSet: change, validationReport: report,
    })
    this.recordHistory({
      changeSet: change,
      forward: freezePatches(forward),
      inverse: freezePatches(inverse),
      beforeNodeStates,
      afterNodeStates: report.nodeStates,
    })
    this.redoStack = []
    this.notify()
    return change
  }

  private validateCandidate(
    next: DocumentSchema,
    forward: readonly Patch[],
    inverse: readonly Patch[],
  ) {
    const fork = forkDocumentIndexSnapshot(
      this.store.committedIndex,
      next,
      this.store.profile,
      this.store.revision + 1,
      forward,
      inverse,
    )
    assertJsonValue(next, this.store.jsonValidation)
    const affectedNodeIds = fork.impact.affectedNodeIds
    const report = validateDocumentWithProfile(next, this.store.profile, {
      baselineNodeStates: this.store.materialNodeStates,
      affectedNodeIds: new Set(affectedNodeIds),
    })
    assertValidReport(report)
    return { nextIndex: fork.index, affectedNodeIds, report }
  }

  private recordHistory(next: DocumentHistoryEntry): void {
    const previous = this.undoStack.at(-1)
    const merged = previous ? mergeDocumentChangeSets(previous.changeSet, next.changeSet) : null
    if (!previous || !merged) {
      this.undoStack.push(next)
      return
    }
    this.undoStack[this.undoStack.length - 1] = {
      changeSet: merged,
      forward: freezePatches([...previous.forward, ...next.forward]),
      inverse: freezePatches([...next.inverse, ...previous.inverse]),
      beforeNodeStates: previous.beforeNodeStates,
      afterNodeStates: next.afterNodeStates,
    }
  }

  private applyHistory(direction: 'undo' | 'redo'): void {
    const source = direction === 'undo' ? this.undoStack : this.redoStack
    const destination = direction === 'undo' ? this.redoStack : this.undoStack
    const entry = source.at(-1)
    if (!entry)
      return
    const patches = direction === 'undo' ? entry.inverse : entry.forward
    const next = apply(this.store.committedDocument, patches as Patch[], { enableAutoFreeze: true })
    assertJsonValue(next, this.store.jsonValidation)
    const targetNodeStates = direction === 'undo' ? entry.beforeNodeStates : entry.afterNodeStates
    const report = validateDocumentWithProfile(next, this.store.profile, {
      mode: 'history-restore', targetNodeStates,
    })
    assertValidReport(report)
    const nextIndex = forkDocumentIndexSnapshot(
      this.store.committedIndex,
      next,
      this.store.profile,
      this.store.revision + 1,
      patches,
      direction === 'undo' ? entry.forward : entry.inverse,
    ).index
    this.store[DOCUMENT_STORE_WRITER]({
      kind: direction, document: next, index: nextIndex, changeSet: entry.changeSet, validationReport: report,
    })
    source.pop()
    destination.push(entry)
    this.notify()
  }

  private notify(): void {
    for (const listener of this.listeners)
      listener()
  }
}

function opaqueNodeOperation(nodeId: string): DocumentOperationDescriptor {
  return {
    kind: 'material.edit',
    sessionPath: [],
    targetIds: [`node:${nodeId}`],
    fieldPaths: [''],
    selectionLineage: null,
    structural: false,
  }
}

function freezePatches(patches: readonly Patch[]): readonly Patch[] {
  return Object.freeze(patches.map((patch) => {
    const clone: Patch = { ...patch, path: [...patch.path] }
    return Object.freeze(clone)
  }))
}

function assertValidReport(report: MaterialDocumentValidationReport): void {
  if (!report.valid)
    throw new DocumentValidationError(report.diagnostics)
}

```

Import `DocumentOperationDescriptor` as a type in `packages/core/src/editing-session.ts` and use this final option contract:

```ts
export interface TxOptions {
  mergeKey?: string
  mergeWindowMs?: number
  label?: string
  operation?: DocumentOperationDescriptor
}
```

`forkDocumentIndexSnapshot()` derives the candidate index and affected stable IDs from the engine-owned forward/inverse patches before publication. It never compares opaque model values and never consumes caller-supplied operation targets. The one authoritative commit pass then recursively asserts JSON, validates the canonical envelope and complete material graph, validates adapters only for that patch-derived affected set, carries untouched quarantine state objects, rejects a changed quarantine as `MATERIAL_NODE_READ_ONLY`, and drops a deleted quarantine from the complete returned map. Insert/delete index shifts remain non-semantic; a changed quarantine's own value, parent slot, slot-key set, or relative-order inversion is still affected. Any patch-analysis ambiguity, duplicate ID, JSON failure, graph failure, or adapter failure aborts before the store/index/history/cache changes.

Each private history entry captures the complete `beforeNodeStates` and `afterNodeStates`. Coalescing retains the first entry's before sidecar and the last entry's after sidecar, in addition to the first inverse/last forward patch chain. Undo/redo use `mode: 'history-restore'` with that exact target sidecar, so restoring a deleted quarantine does not look like an edit; a live-ID/state mismatch fails atomically with `MATERIAL_HISTORY_NODE_STATE_MISMATCH`. `barrierGeneration` remains monotonic across selection/session/modal/reset/preview boundaries, and both change-set identity and generation must match before history can coalesce.

An omitted operation becomes a stable node-targeted history barrier, so old material calls remain correct but never coalesce accidentally. Update `TransactionAPI` documentation to state that `run()` edits through the single engine and `batch()` produces one barriered `DocumentChangeSet`. Export the engine, `DocumentValidationError`, and public option types from `packages/core/src/index.ts`; do not export `DocumentHistoryEntry`, sidecars, `freezePatches()`, or any `Patch` value.

- [ ] **Step 4: Run engine and existing command tests**

Run: `pnpm exec vitest run --dom packages/core/src/document-transaction-engine.test.ts packages/core/src/command.test.ts packages/core/src/patch-command.test.ts`

Expected: PASS; existing command tests remain green while Designer migration proceeds later.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/document-transaction-engine.ts packages/core/src/document-transaction-engine.test.ts packages/core/src/editing-session.ts packages/core/src/index.ts
git commit -m "feat(core): add document transaction engine"
```

### Task 6: Preview Transaction

**Files:**
- Create: `packages/core/src/preview-transaction.ts`
- Create: `packages/core/src/document-preview-validation.ts`
- Create: `packages/core/src/preview-transaction.test.ts`
- Modify: `packages/core/src/schema-adapter.ts`
- Modify: `packages/core/src/document-transaction-engine.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing preview lifecycle tests**

```ts
import { describe, expect, it, vi } from 'vitest'
import { createDefaultSchema } from '@easyink/schema'
import { create } from 'mutative'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'
import { assertPatchScopedJsonCandidate } from './document-preview-validation'
import { DocumentStore } from './document-store'
import { recordSchemaAdapter } from './schema-adapter'
import { DocumentTransactionEngine, DocumentValidationError } from './document-transaction-engine'

const moveOperation = {
  kind: 'geometry.move', sessionPath: [], targetIds: ['node:a'], fieldPaths: ['/x'],
  selectionLineage: 'selection-1', structural: false,
} as const

describe('PreviewTransaction', () => {
  it('replaces preview from the committed base and commits one history entry', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', x: 0 })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({ label: 'Move', mergeKey: 'move:a', operation: moveOperation })

    preview.replace(draft => { draft.elements[0]!.x = 10 })
    preview.replace(draft => { draft.elements[0]!.x = 20 })
    expect(store.document.elements[0]!.x).toBe(20)
    expect(store.committedDocument.elements[0]!.x).toBe(0)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)

    preview.commit()
    expect(store.committedDocument.elements[0]!.x).toBe(20)
    expect(engine.totalCount).toBe(1)
  })

  it('cancels without changing the committed document', () => {
    const store = new DocumentStore(createDefaultSchema(), createTestCompiledMaterialProfile())
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({
      label: 'Page width',
      operation: {
        kind: 'document.property', sessionPath: [], targetIds: ['document'], fieldPaths: ['/page/width'],
        selectionLineage: null, structural: false,
      },
    })
    preview.replace(draft => { draft.page.width = 500 })
    preview.cancel()
    expect(store.document.page.width).toBe(store.committedDocument.page.width)
    expect(engine.totalCount).toBe(0)
  })

  it('shows adapter-invalid values but keeps the preview open when commit validation fails', () => {
    const adapter = recordSchemaAdapter(1)
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({
      type: 'box',
      schemaAdapter: {
        ...adapter,
        validate: node => typeof node.model.value === 'number' && node.model.value < 0
          ? [{ code: 'BOX_VALUE_NEGATIVE', severity: 'error', path: '/model/value', message: 'value must be non-negative' }]
          : [],
        validatePreview: (node, context) => context.changedPaths.includes('/model/value')
          && typeof node.model.value === 'number' && node.model.value < 0
          ? [{ code: 'BOX_VALUE_NEGATIVE', severity: 'error', path: '/model/value', message: 'value must be non-negative' }]
          : [],
      },
    })])
    const schema = createDefaultSchema()
    schema.elements = [profile.createNode('box', { id: 'a', model: { value: 1 } })]
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const preview = engine.beginPreview({
      label: 'Value',
      operation: {
        kind: 'material.property', sessionPath: [], targetIds: ['node:a'], fieldPaths: ['/model/value'],
        selectionLineage: null, structural: false,
      },
    })

    preview.run('a', draft => { draft.model.value = -1 })
    expect(store.document.elements[0]!.model.value).toBe(-1)
    expect(preview.validationReport?.valid).toBe(false)
    expect(() => preview.commit()).toThrowError(DocumentValidationError)
    expect(preview.isOpen).toBe(true)
    expect(store.committedDocument.elements[0]!.model.value).toBe(1)
    expect(engine.totalCount).toBe(0)

    preview.run('a', draft => { draft.model.value = 2 })
    preview.commit()
    expect(store.committedDocument.elements[0]!.model.value).toBe(2)
    expect(engine.totalCount).toBe(1)
  })

  it('does not traverse a 100k-cell opaque model on every slider preview', () => {
    const fullValidate = vi.fn(() => [])
    const previewValidate = vi.fn(() => [])
    const introspect = vi.fn(() => ({ identities: [], structures: [], references: [], resources: [], bindings: [] }))
    const adapter = {
      ...recordSchemaAdapter(1), validate: fullValidate, validatePreview: previewValidate, introspect,
    }
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'large-table', schemaAdapter: adapter })])
    const schema = createDefaultSchema()
    schema.elements = [profile.createNode('large-table', {
      id: 'table-1', model: { cells: Array.from({ length: 100_000 }, (_, index) => index) },
    })]
    const store = new DocumentStore(schema, profile, { jsonValidation: { maxNodes: 500_000 } })
    const engine = new DocumentTransactionEngine(store)
    fullValidate.mockClear()
    previewValidate.mockClear()
    introspect.mockClear()

    const [candidate, forward] = create(store.committedDocument, (draft) => {
      draft.elements[0]!.model.cells[99_999] = 42
    }, { enablePatches: true, enableAutoFreeze: true })
    let visited = 0
    assertPatchScopedJsonCandidate(candidate, forward, store.jsonValidation, { onVisit: () => { visited += 1 } })
    expect(visited).toBeLessThan(32)

    const preview = engine.beginPreview({
      label: 'Cell value', mergeKey: 'table-cell:table-1:cell-99999',
      operation: {
        kind: 'table.cell.value', sessionPath: ['node:table-1'], targetIds: ['node:table-1', 'table.cell:cell-99999'],
        fieldPaths: ['/model/cells/99999'], selectionLineage: 'selection-table-cell', structural: false,
      },
    })
    for (let value = 1; value <= 20; value += 1)
      preview.replace(draft => { draft.elements[0]!.model.cells[99_999] = value })

    expect(fullValidate).not.toHaveBeenCalled()
    expect(introspect).not.toHaveBeenCalled()
    expect(previewValidate).toHaveBeenCalledTimes(20)
    expect(previewValidate.mock.calls.every(([, context]) => context.changedPaths.join() === '/model/cells/99999')).toBe(true)
    preview.commit()
    expect(fullValidate).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the preview test to verify it fails**

Run: `pnpm exec vitest run --dom packages/core/src/preview-transaction.test.ts`

Expected: FAIL because `beginPreview()` is missing.

- [ ] **Step 3: Implement `PreviewTransaction` and engine ownership**

Add the optional fast-path hook to `SchemaAdapter`; it is advisory for the preview view only and never replaces `validate()` at commit:

```ts
export interface SchemaAdapterPreviewContext extends SchemaAdapterContext {
  readonly previousNode: MaterialNode | undefined
  readonly changedPaths: readonly `/${string}`[]
}

export interface SchemaAdapter {
  validatePreview?: (
    node: AdaptableMaterialNode,
    context: SchemaAdapterPreviewContext,
  ) => readonly MaterialSchemaIssue[]
}
```

Create `packages/core/src/document-preview-validation.ts` as an internal module (do not re-export it from `@easyink/core`):

```ts
import type { DocumentSchema } from '@easyink/schema'
import type { JsonValueValidationOptions } from '@easyink/shared'
import type { Patch } from 'mutative'
import type { MaterialLoadDiagnostic } from './schema-adapter'
import { assertJsonValue } from '@easyink/shared'

export interface PreviewValidationReport {
  readonly valid: boolean
  readonly complete: false
  readonly affectedNodeIds: readonly string[]
  readonly diagnostics: readonly MaterialLoadDiagnostic[]
}

export interface DocumentPreviewWorkProbe {
  onVisit(kind: 'path-container' | 'patch-value' | 'material-node'): void
}

export function assertPatchScopedJsonCandidate(
  document: DocumentSchema,
  patches: readonly Patch[],
  limits: Readonly<JsonValueValidationOptions>,
  probe?: DocumentPreviewWorkProbe,
): void {
  const aggregate = createPatchJsonBudget(limits)
  for (const patch of patches) {
    assertSafePatchPathAndCandidateContainers(document, patch.path, aggregate, probe)
    if ('value' in patch) {
      assertJsonValue(patch.value, limits)
      consumeChangedJsonValue(patch.value, patch.path.length, aggregate, probe)
    }
  }
}

export class RevisionPreviewValidationCache {
  private revision = -1
  private values = new WeakMap<object, Map<string, readonly MaterialLoadDiagnostic[]>>()

  reset(revision: number): void {
    if (revision === this.revision)
      return
    this.revision = revision
    this.values = new WeakMap()
  }

  get(node: object, changedPaths: readonly string[]): readonly MaterialLoadDiagnostic[] | undefined {
    return this.values.get(node)?.get(JSON.stringify(changedPaths))
  }

  set(node: object, changedPaths: readonly string[], diagnostics: readonly MaterialLoadDiagnostic[]): void {
    let byPath = this.values.get(node)
    if (!byPath) {
      byPath = new Map()
      this.values.set(node, byPath)
    }
    byPath.set(JSON.stringify(changedPaths), Object.freeze([...diagnostics]))
  }
}
```

`assertSafePatchPathAndCandidateContainers()` permits only own safe string keys and in-range integer array indices, walks only the path ancestors, and rejects accessors/non-plain containers. `consumeChangedJsonValue()` iteratively counts only added/replaced patch values, including aggregate node/depth/string-byte budgets across all patches; a root or whole-model replacement necessarily visits that whole replacement. Every visited path container/value must call the probe, so the large-model regression is a deterministic work-count test rather than a wall-clock assertion.

Add a private `validatePreviewWithProfile()` beside these helpers. It receives the patch-derived `DocumentPatchImpact`, committed/candidate indexes, the committed node-state sidecar, and `RevisionPreviewValidationCache`. For each affected live node, reject a baseline quarantine immediately; otherwise call only `schemaAdapter.validatePreview` with sorted, deduplicated node-relative changed paths and cache its frozen diagnostics by committed revision, candidate node identity, and path set. Deleted nodes need no adapter call. Added nodes get `previousNode: undefined`. Adapters without the hook are deferred to commit rather than running full `validate()` on every pointer move. Return `PreviewValidationReport { complete: false }`; `valid: true` means only that provisional checks passed, never that commit is guaranteed.

Create `packages/core/src/preview-transaction.ts`:

```ts
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { Patch } from 'mutative'
import type { PreviewValidationReport } from './document-preview-validation'
import type { DocumentRecipe, DocumentTransactionOptions } from './document-transaction-engine'
import type { DocumentIndexSnapshot } from './document-index'
import type { TransactionAPI, TxOptions } from './editing-session'
import { create } from 'mutative'

export interface PreviewPublishPayload {
  document: DocumentSchema
  forward: readonly Patch[]
  inverse: readonly Patch[]
}

export interface PreviewCommitPayload extends PreviewPublishPayload {
  options: DocumentTransactionOptions
}

export class PreviewTransaction implements TransactionAPI {
  private current: DocumentSchema
  private forward: readonly Patch[] = []
  private inverse: readonly Patch[] = []
  private closed = false
  private report: PreviewValidationReport | null = null
  private queuedRecipes: DocumentRecipe[] | null = null

  constructor(
    private readonly base: DocumentSchema,
    private readonly baseIndex: DocumentIndexSnapshot,
    private readonly options: DocumentTransactionOptions,
    private readonly publish: (payload: PreviewPublishPayload) => PreviewValidationReport,
    private readonly finalize: (payload: PreviewCommitPayload | null) => void,
  ) {
    this.current = base
  }

  get isOpen(): boolean { return !this.closed }
  get validationReport(): PreviewValidationReport | null { return this.report }

  replace(recipe: DocumentRecipe): void {
    this.assertOpen()
    const [next, forward, inverse] = create(this.base, recipe, { enablePatches: true, enableAutoFreeze: true })
    const report = this.publish({ document: next, forward, inverse })
    this.current = next
    this.forward = forward
    this.inverse = inverse
    this.report = report
  }

  run<TNode extends MaterialNode = MaterialNode>(nodeId: string, mutator: (draft: TNode) => void, _options?: TxOptions): void {
    const recipe: DocumentRecipe = draft => mutator(this.baseIndex.resolveNode(draft, nodeId) as TNode)
    if (this.queuedRecipes)
      this.queuedRecipes.push(recipe)
    else
      this.replace(recipe)
  }

  batch<T>(fn: () => T): T {
    if (this.queuedRecipes)
      return fn()
    this.queuedRecipes = []
    try {
      const result = fn()
      const recipes = this.queuedRecipes!
      this.queuedRecipes = null
      if (recipes.length > 0) {
        this.replace((draft) => {
          for (const recipe of recipes)
            recipe(draft)
        })
      }
      return result
    }
    catch (error) {
      this.queuedRecipes = null
      throw error
    }
  }

  commit(): void {
    this.assertOpen()
    this.finalize(this.forward.length === 0 ? null : {
      document: this.current,
      forward: this.forward,
      inverse: this.inverse,
      options: this.options,
    })
    this.closed = true
  }

  cancel(): void {
    if (this.closed)
      return
    this.finalize(null)
    this.closed = true
  }

  private assertOpen(): void {
    if (this.closed)
      throw new Error('PreviewTransaction is closed')
  }
}
```

Add these imports, field, guards, and methods to `DocumentTransactionEngine`:

```ts
import type { PreviewValidationReport } from './document-preview-validation'
import type { PreviewCommitPayload, PreviewPublishPayload } from './preview-transaction'
import { assertPatchScopedJsonCandidate, RevisionPreviewValidationCache, validatePreviewWithProfile } from './document-preview-validation'
import { PreviewTransaction } from './preview-transaction'

private activePreview: PreviewTransaction | null = null
private readonly previewValidationCache = new RevisionPreviewValidationCache()

beginPreview(options: DocumentTransactionOptions): PreviewTransaction {
  this.assertNoActivePreview()
  this.markHistoryBarrier()
  let preview!: PreviewTransaction
  preview = new PreviewTransaction(
    this.store.committedDocument,
    this.store.committedIndex,
    options,
    payload => this.publishPreview(preview, payload),
    payload => this.finalizePreview(preview, payload),
  )
  this.activePreview = preview
  return preview
}

private publishPreview(owner: PreviewTransaction, payload: PreviewPublishPayload): PreviewValidationReport {
  this.assertPreviewOwner(owner)
  assertPatchScopedJsonCandidate(
    payload.document, payload.forward, this.store.jsonValidation,
  )
  const fork = forkDocumentIndexSnapshot(
    this.store.committedIndex,
    payload.document,
    this.store.profile,
    this.store.revision,
    payload.forward,
    payload.inverse,
  )
  this.previewValidationCache.reset(this.store.revision)
  const report = validatePreviewWithProfile({
    document: payload.document,
    beforeIndex: this.store.committedIndex,
    index: fork.index,
    impact: fork.impact,
    profile: this.store.profile,
    baselineNodeStates: this.store.materialNodeStates,
    cache: this.previewValidationCache,
  })
  this.store[DOCUMENT_STORE_WRITER]({ kind: 'preview', document: payload.document, index: fork.index })
  return report
}

private finalizePreview(owner: PreviewTransaction, payload: PreviewCommitPayload | null): void {
  this.assertPreviewOwner(owner)
  if (!payload) {
    this.activePreview = null
    this.store[DOCUMENT_STORE_WRITER]({ kind: 'preview-cancel' })
    return
  }

  const { nextIndex, affectedNodeIds, report } = this.validateCandidate(
    payload.document, payload.forward, payload.inverse,
  )
  const beforeNodeStates = this.store.materialNodeStates
  const timestamp = this.now()
  const change = createDocumentChangeSet({
    id: this.createId(),
    label: payload.options.label,
    baseRevision: this.store.revision,
    committedRevision: this.store.revision + 1,
    startedAt: timestamp,
    updatedAt: timestamp,
    mergeKey: payload.options.mergeKey,
    mergeWindowMs: payload.options.mergeWindowMs ?? 300,
    barrierGeneration: this.barrierGeneration,
    affectedNodeIds,
    operation: payload.options.operation,
  })
  const entry = {
    changeSet: change,
    forward: freezePatches(payload.forward),
    inverse: freezePatches(payload.inverse),
    beforeNodeStates,
    afterNodeStates: report.nodeStates,
  }

  this.activePreview = null
  this.store[DOCUMENT_STORE_WRITER]({
    kind: 'commit', document: payload.document, index: nextIndex, changeSet: change, validationReport: report,
  })
  this.recordHistory(entry)
  this.redoStack = []
  this.notify()
}

private assertPreviewOwner(owner: PreviewTransaction): void {
  if (this.activePreview !== owner)
    throw new Error('PreviewTransaction is not owned by this engine')
}

private assertNoActivePreview(): void {
  if (this.activePreview)
    throw new Error('A preview transaction is active')
}

undo(): void {
  this.assertNoActivePreview()
  this.markHistoryBarrier()
  this.applyHistory('undo')
}

redo(): void {
  this.assertNoActivePreview()
  this.markHistoryBarrier()
  this.applyHistory('redo')
}
```

Call `assertNoActivePreview()` at the start of `transact()`, `reset()`, and `clear()`, and replace the one-line undo/redo methods with the versions above. Call `markHistoryBarrier()` on selection replacement, editing-session enter/push/pop/exit, modal command completion, and document reset. `beginPreview()` increments `barrierGeneration`, so a pointer/property gesture cannot coalesce across an intervening UI boundary.

Every `replace()` starts from the same frozen committed base. Its private patches are the sole impact source: patch-scoped JSON/finite/container checks run first, then a same-revision copy-on-write index fork derives affected IDs/paths, then quarantine checks and optional `validatePreview` hooks run through the revision cache. The store accepts the already auto-frozen candidate without a recursive freeze. A malformed patch or unprovable structural fork throws before replacing the last good preview; an adapter-preview diagnostic may publish a visible invalid candidate with `complete: false` so the user can correct it. Neither path changes committed revision, node-state sidecars, or history.

`finalizePreview()` does not trust the provisional report/cache or `operation.targetIds`. It re-forks from the committed index using the private forward/inverse patches and runs the same recursive JSON, canonical-envelope, complete-graph, affected-adapter, and quarantine gate as `transact()` before changing `activePreview`, committed snapshot/index, revision, sidecar, or history. Therefore a failed commit leaves the preview open for correction or cancellation. Reset/commit invalidates the revision cache; preview cancellation releases candidate references through weak keys.

- [ ] **Step 4: Run preview and transaction tests**

Run: `pnpm exec vitest run --dom packages/core/src/preview-transaction.test.ts packages/core/src/document-transaction-engine.test.ts`

Expected: PASS with no committed revision increment during preview, one increment/full adapter validation on commit, and fewer than 32 patch-scope visits per late-cell update in the 100k-cell opaque model.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/document-preview-validation.ts packages/core/src/preview-transaction.ts packages/core/src/preview-transaction.test.ts packages/core/src/schema-adapter.ts packages/core/src/document-transaction-engine.ts packages/core/src/index.ts
git commit -m "feat(core): add preview transactions"
```

### Task 7: Designer Store And Transaction API Cutover

**Files:**
- Modify: `packages/designer/src/store/designer-store.ts`
- Modify: `packages/designer/src/store/designer-store.test.ts`
- Delete: `packages/designer/src/editing/transaction-service.ts`
- Modify: `packages/designer/src/materials/extension-context.ts`
- Modify: `packages/designer/src/components/EasyInkDesigner.vue`

- [ ] **Step 1: Write failing Designer single-writer tests**

```ts
import { describe, expect, it } from 'vitest'
import { createDefaultSchema } from '@easyink/schema'
import { createTestCompiledMaterialProfile } from '@easyink/core/testing'
import { DesignerStore } from './designer-store'

describe('DesignerStore document ownership', () => {
  it('exposes a frozen view and updates by replacing the document snapshot', () => {
    const profile = createTestCompiledMaterialProfile()
    const store = new DesignerStore({ profile, schema: {} })
    const before = store.schema
    expect(() => store.schema.elements.push(profile.createNode('box', { id: 'x', width: 1, height: 1 })))
      .toThrow()

    store.documentTransactions.transact((draft) => {
      draft.elements.push(profile.createNode('box', { id: 'x', width: 1, height: 1 }))
    }, {
      label: 'Add box',
      operation: {
        kind: 'structure.insert', sessionPath: [], targetIds: ['node:x'], fieldPaths: ['/elements'],
        selectionLineage: null, structural: true,
      },
    })

    expect(store.schema).not.toBe(before)
    expect(store.getElementById('x')?.id).toBe('x')
  })

  it('passes the complete admitted node-state sidecar through construction and schema reset', () => {
    const profile = createTestCompiledMaterialProfile()
    const unknown = { ...profile.createNode('box', { id: 'unknown-1' }), type: 'vendor/missing' }
    const healthy = profile.createNode('box', { id: 'box-1', model: { value: 1 } })
    const store = new DesignerStore({
      profile, schema: { ...createDefaultSchema(), elements: [unknown, healthy] },
    })
    const initialQuarantine = store.getMaterialNodeState('unknown-1')
    expect(initialQuarantine?.status).toBe('quarantined')

    store.documentTransactions.run('box-1', draft => { draft.model.value = 2 }, {
      label: 'Healthy edit',
      operation: {
        kind: 'material.property', sessionPath: [], targetIds: ['node:box-1'], fieldPaths: ['/model/value'],
        selectionLineage: null, structural: false,
      },
    })
    expect(store.getMaterialNodeState('unknown-1')).toBe(initialQuarantine)

    const replacement = { ...profile.createNode('box', { id: 'unknown-2' }), type: 'vendor/other' }
    store.setSchema({ ...createDefaultSchema(), elements: [replacement] })
    expect(store.getMaterialNodeState('unknown-2')?.status).toBe('quarantined')
  })
})
```

- [ ] **Step 2: Run the Designer store test to verify it fails**

Run: `pnpm exec vitest run --dom packages/designer/src/store/designer-store.test.ts`

Expected: FAIL because `documentTransactions` does not exist and the current schema is mutable.

- [ ] **Step 3: Replace mutable schema ownership with `DocumentStore`**

Make these exact ownership changes in `DesignerStore`:

```ts
readonly documentStore: DocumentStore
readonly documentTransactions: DocumentTransactionEngine
private documentViewRevision = 0
private _materialLoadDiagnostics: readonly MaterialLoadDiagnostic[] = []
private _materialNodeStates: ReadonlyMap<string, MaterialNodeLoadState> = new Map()

constructor(options: DesignerStoreOptions) {
  const loaded = loadDocumentWithProfile(options.schema, options.profile)
  this.materialProfile = options.profile
  this._materialLoadDiagnostics = loaded.diagnostics
  this._materialNodeStates = loaded.nodeStates
  this.documentStore = markRaw(new DocumentStore(loaded.schema, options.profile, { nodeStates: loaded.nodeStates }))
  this.documentTransactions = markRaw(new DocumentTransactionEngine(this.documentStore))
  this.documentStore.subscribe((event) => {
    this.documentViewRevision += 1
    if (event.kind !== 'preview' && event.kind !== 'preview-cancel')
      this.selection.reconcile(this.documentStore.index.nodeIds())
    if (event.validationReport) {
      this._materialLoadDiagnostics = event.validationReport.diagnostics
      this._materialNodeStates = event.validationReport.nodeStates
    }
  })
  this.selection.onChange(() => this.documentTransactions.markHistoryBarrier())
}

get schema(): DocumentSchema {
  void this.documentViewRevision
  return this.documentStore.document
}

setSchema(schema?: DocumentSchemaInput): void {
  const loaded = loadDocumentWithProfile(schema, this.materialProfile)
  this.documentTransactions.reset(loaded.schema, loaded.nodeStates)
  this._materialLoadDiagnostics = loaded.diagnostics
  this._materialNodeStates = loaded.nodeStates
  this.selection.clear()
  this.editingSession.exitAll()
  void this.preloadDocumentFonts()
}

get materialLoadDiagnostics(): readonly MaterialLoadDiagnostic[] {
  return this._materialLoadDiagnostics
}

get materialNodeStates(): ReadonlyMap<string, MaterialNodeLoadState> {
  return this._materialNodeStates
}

getMaterialNodeState(nodeId: string): MaterialNodeLoadState | undefined {
  return this._materialNodeStates.get(nodeId)
}

getElementById(id: string): MaterialNode | undefined {
  return this.documentStore.index.getNode(id)
}
```

Import `loadDocumentWithProfile`, `MaterialLoadDiagnostic`, and `MaterialNodeLoadState` from `@easyink/core`. Change `SelectionModel.reconcile()` in `packages/core/src/selection.ts` to accept `readonly string[]` IDs instead of mutable nodes, and change `isInteractable()` to read `node.editorState?.locked/hidden`. Remove `_schema`, `CommandManager`, and all direct `addElement/removeElement/updateElement/setExtension/deleteExtension` mutation bodies; replace extension writes with `documentTransactions.transact()` recipes carrying stable operation descriptors. Delete `createTransactionService()` rather than retaining an alias, and provide `tx: store.documentTransactions` directly in extension/session contexts. `EasyInkDesigner.vue` continues the registry-first constructor shape supplied by the material-platform plan and no longer retargets sessions to a Vue proxy for in-place mutation. Initial admission and `setSchema()` pass the loader's schema and complete `nodeStates` into the store/reset atomically; assigning `_materialNodeStates` afterward mirrors that same admitted sidecar rather than reconstructing it. Normal transactions validate canonical drafts and never normalize or migrate them.

- [ ] **Step 4: Run Designer store, transaction service, and extension tests**

Run: `pnpm exec vitest run --dom packages/designer/src/store/designer-store.test.ts packages/designer/src/editing/editing-session.test.ts`

Expected: PASS; schema references change after commits, and direct mutation throws.

- [ ] **Step 5: Commit**

```bash
git add packages/designer/src/store/designer-store.ts packages/designer/src/store/designer-store.test.ts packages/designer/src/editing/transaction-service.ts packages/designer/src/materials/extension-context.ts packages/designer/src/components/EasyInkDesigner.vue packages/core/src/selection.ts
git commit -m "refactor(designer): adopt immutable document transactions"
```

### Task 8: Stable-ID Selection Regions And Rebase

**Files:**
- Create: `packages/core/src/selection-region.ts`
- Create: `packages/core/src/selection-region.test.ts`
- Modify: `packages/core/src/editing-session.ts`
- Modify: `packages/designer/src/editing/selection-store.ts`
- Modify: `packages/designer/src/editing/selection-store.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing stable region and selection-store tests**

```ts
import { describe, expect, it } from 'vitest'
import { rebaseStableIdSelectionRegion } from './selection-region'

describe('rebaseStableIdSelectionRegion', () => {
  it('keeps stable order, removes deleted IDs, and repairs anchor/focus', () => {
    const result = rebaseStableIdSelectionRegion({
      regionId: 'cells',
      itemIds: ['a', 'b', 'c'],
      anchorId: 'a',
      focusId: 'c',
    }, id => id !== 'a')
    expect(result).toEqual({ regionId: 'cells', itemIds: ['b', 'c'], anchorId: 'b', focusId: 'c' })
  })

  it('returns null when every selected stable ID was deleted', () => {
    expect(rebaseStableIdSelectionRegion({ regionId: 'cells', itemIds: ['a'], anchorId: 'a', focusId: 'a' }, () => false))
      .toBeNull()
  })
})
```

- [ ] **Step 2: Run the region tests to verify they fail**

Run: `pnpm exec vitest run --dom packages/core/src/selection-region.test.ts packages/designer/src/editing/selection-store.test.ts`

Expected: FAIL because the stable region contract and `SelectionStore.rebase()` are absent.

- [ ] **Step 3: Implement the region contract and rebase hook**

```ts
import type { JsonValue } from '@easyink/shared'

export interface StableIdSelectionRegion<T extends JsonValue = JsonValue> {
  regionId: string
  itemIds: readonly string[]
  anchorId: string
  focusId: string
  data?: T
}

export function rebaseStableIdSelectionRegion<T extends JsonValue>(
  region: StableIdSelectionRegion<T>,
  exists: (itemId: string) => boolean,
): StableIdSelectionRegion<T> | null {
  const itemIds = region.itemIds.filter(exists)
  if (itemIds.length === 0)
    return null
  return {
    ...region,
    itemIds,
    anchorId: exists(region.anchorId) ? region.anchorId : itemIds[0]!,
    focusId: exists(region.focusId) ? region.focusId : itemIds[itemIds.length - 1]!,
  }
}
```

Add this optional hook to `SelectionType<T>`:

```ts
rebase?: (
  selection: Selection<T>,
  context: {
    changeSet: DocumentChangeSet
    before: DocumentIndexSnapshot
    after: DocumentIndexSnapshot
  },
) => Selection<T> | null
```

Add `readonly lineageId: string` to the core `SelectionStore` contract. In `createSelectionStore()`, initialize it with `generateId('selection')`; every accepted user/programmatic `set()` that changes the selection assigns a new lineage before notifying, while an internal `rebase()` that preserves at least one selected stable ID keeps the existing lineage. Expose the top-level `SelectionModel.lineageId` with the same rule. Canvas and material operations copy the applicable lineage into `DocumentOperationDescriptor.selectionLineage`; this is the value used by strict coalescing.

Constrain `Selection<T>` to `T extends JsonValue = JsonValue`. Add `SelectionStore.rebase(context, type)` with this implementation order: if `after` lacks `selection.nodeId`, clear and create a new lineage; otherwise call `type.rebase` when present, recursively validate the returned payload and anchor with `assertJsonValue`, preserve the lineage when a non-null selection survives, and create a new lineage when it becomes null. Replace the local JSON stringify/parse validator in `selection-store.ts` with `assertJsonValue`; rejected values keep both the last valid selection and its lineage. Use `event.previousIndex` and `event.index` from `DocumentStoreEvent` as the exact before/after context.

- [ ] **Step 4: Run region and selection tests**

Run: `pnpm exec vitest run --dom packages/core/src/selection-region.test.ts packages/designer/src/editing/selection-store.test.ts`

Expected: PASS, including rejection of nested functions, `undefined`, class instances, cycles, and non-finite numbers.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/selection-region.ts packages/core/src/selection-region.test.ts packages/core/src/editing-session.ts packages/designer/src/editing/selection-store.ts packages/designer/src/editing/selection-store.test.ts packages/core/src/index.ts
git commit -m "feat(core): rebase stable selection regions"
```

### Task 9: Editing Session Path Stack

**Files:**
- Modify: `packages/core/src/editing-session.ts`
- Modify: `packages/designer/src/editing/editing-session.ts`
- Modify: `packages/designer/src/editing/editing-session-manager.ts`
- Modify: `packages/designer/src/editing/editing-session.test.ts`
- Modify: `packages/designer/src/interactions/canvas-interaction-controller.ts`
- Modify: `packages/designer/src/interactions/canvas-interaction-controller.test.ts`

- [ ] **Step 1: Write failing nested enter/pop/rebase tests**

```ts
it('pushes a child session, pops one level on Escape, and exits when the root is deleted', () => {
  const root = store.editingSession.enter('owner', ownerExtension)
  expect(root).not.toBeNull()
  const child = store.editingSession.push('child', childExtension)
  expect(child?.path.map(entry => entry.nodeId)).toEqual(['owner', 'child'])

  store.editingSession.pop()
  expect(store.editingSession.activeNodeId).toBe('owner')

  store.documentTransactions.transact((draft) => {
    draft.elements.splice(0, 1)
  }, {
    label: 'Delete owner',
    operation: {
      kind: 'structure.remove', sessionPath: ['owner', 'child'], targetIds: ['node:owner'], fieldPaths: ['/elements'],
      selectionLineage: store.editingSession.selectionStore.lineageId, structural: true,
    },
  })
  expect(store.editingSession.isActive).toBe(false)
})
```

- [ ] **Step 2: Run editing-session tests to verify they fail**

Run: `pnpm exec vitest run --dom packages/designer/src/editing/editing-session.test.ts packages/designer/src/interactions/canvas-interaction-controller.test.ts`

Expected: FAIL because sessions have no path or push/pop lifecycle.

- [ ] **Step 3: Implement `EditingSessionPath` and stack reconciliation**

Add to `packages/core/src/editing-session.ts`:

```ts
export interface EditingSessionPathEntry {
  nodeId: string
  parentNodeId: string | null
  slot: string | null
}

export type EditingSessionPath = readonly EditingSessionPathEntry[]
```

Expose `readonly path: EditingSessionPath` on `EditingSessionRef`. Change `EditingSession` construction to receive a frozen path. In `EditingSessionManager`, replace `_activeSession` with `shallowRef<readonly EditingSession[]>([])`; implement `enter()` as reset-to-root, `push()` as descendant-only append, `pop()` as one-frame destroy, and `exitAll()` as reverse-order destroy. Derive each path from the current `DocumentIndexSnapshot` addresses, never from array indices cached by the session.

Subscribe the manager to `documentStore`. On each committed/undo/redo event, pass `event.previousIndex`, `event.index`, and `event.changeSet` to selection rebasing:

1. Keep the longest frame prefix whose node IDs still exist and whose parent relationship matches the new index.
2. Destroy removed suffix frames.
3. Rebase each surviving frame's selection through its registered `SelectionType.rebase`.
4. Recompute and freeze every surviving `EditingSessionPath`.

Change Canvas Escape handling to `pop()`; clicking the canvas background and replacing the document call `exitAll()`. `enter()`, `push()`, `pop()`, and `exitAll()` cancel any active gesture and call `documentTransactions.markHistoryBarrier()` before changing frames, which prevents otherwise identical operations on opposite sides of a session transition from coalescing.

- [ ] **Step 4: Run session and controller tests**

Run: `pnpm exec vitest run --dom packages/designer/src/editing/editing-session.test.ts packages/designer/src/interactions/canvas-interaction-controller.test.ts`

Expected: PASS; one Escape exits one nested level, and deletion/reparenting rebases the stack by stable IDs.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/editing-session.ts packages/designer/src/editing/editing-session.ts packages/designer/src/editing/editing-session-manager.ts packages/designer/src/editing/editing-session.test.ts packages/designer/src/interactions/canvas-interaction-controller.ts packages/designer/src/interactions/canvas-interaction-controller.test.ts
git commit -m "feat(designer): support editing session paths"
```

### Task 10: Matrix Chain Primitives

**Files:**
- Create: `packages/core/src/matrix-chain.ts`
- Create: `packages/core/src/matrix-chain.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing matrix composition tests**

```ts
import { describe, expect, it } from 'vitest'
import { createTestCompiledMaterialProfile } from './testing/material-profile'
import { applyMatrixToPoint, invertMatrix, matrixToNodeGeometry, multiplyMatrix, nodeLocalMatrix } from './matrix-chain'

describe('matrix chain', () => {
  it('round-trips a point through a rotated node matrix', () => {
    const node = createTestCompiledMaterialProfile().createNode('box', {
      id: 'n', x: 20, y: 30, width: 10, height: 20, rotation: 90,
    })
    const matrix = nodeLocalMatrix(node)
    const point = { x: 2, y: 3 }
    const world = applyMatrixToPoint(matrix, point)
    const local = applyMatrixToPoint(invertMatrix(matrix), world)
    expect(local.x).toBeCloseTo(point.x)
    expect(local.y).toBeCloseTo(point.y)
  })

  it('multiplies parent before child', () => {
    const parent = { a: 1, b: 0, c: 0, d: 1, e: 10, f: 0 }
    const child = { a: 1, b: 0, c: 0, d: 1, e: 5, f: 0 }
    expect(applyMatrixToPoint(multiplyMatrix(parent, child), { x: 0, y: 0 })).toEqual({ x: 15, y: 0 })
  })

  it('decomposes positive orthogonal scale into node dimensions around the transformed center', () => {
    expect(matrixToNodeGeometry(
      { a: 0, b: 0.5, c: -0.25, d: 0, e: 10, f: 20 }, 20, 40,
    )).toEqual({ x: 0, y: 20, width: 10, height: 10, rotation: 90 })
  })

  it('rejects shear and reflection that common node geometry cannot represent', () => {
    expect(() => matrixToNodeGeometry({ a: 1, b: 0, c: 0.2, d: 1, e: 0, f: 0 }, 10, 10))
      .toThrow(/shear/)
    expect(() => matrixToNodeGeometry({ a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }, 10, 10))
      .toThrow(/reflection/)
  })
})
```

- [ ] **Step 2: Run matrix tests to verify they fail**

Run: `pnpm exec vitest run --dom packages/core/src/matrix-chain.test.ts`

Expected: FAIL because the matrix module does not exist.

- [ ] **Step 3: Implement affine operations and center-origin node matrices**

```ts
import type { MaterialNode } from '@easyink/schema'
import type { Point } from './geometry'

export interface Matrix2D {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

export const IDENTITY_MATRIX: Matrix2D = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })

export function multiplyMatrix(left: Matrix2D, right: Matrix2D): Matrix2D {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  }
}

export function invertMatrix(matrix: Matrix2D): Matrix2D {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c
  if (Math.abs(determinant) <= Number.EPSILON)
    throw new Error('Cannot invert a singular transform matrix')
  return {
    a: matrix.d / determinant,
    b: -matrix.b / determinant,
    c: -matrix.c / determinant,
    d: matrix.a / determinant,
    e: (matrix.c * matrix.f - matrix.d * matrix.e) / determinant,
    f: (matrix.b * matrix.e - matrix.a * matrix.f) / determinant,
  }
}

export function applyMatrixToPoint(matrix: Matrix2D, point: Point): Point {
  return { x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f }
}

export function nodeLocalMatrix(node: MaterialNode): Matrix2D {
  const radians = ((node.rotation ?? 0) * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const cx = node.width / 2
  const cy = node.height / 2
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: node.x + cx - cos * cx + sin * cy,
    f: node.y + cy - sin * cx - cos * cy,
  }
}

export function matrixToNodeGeometry(matrix: Matrix2D, width: number, height: number) {
  const scaleX = Math.hypot(matrix.a, matrix.b)
  const scaleY = Math.hypot(matrix.c, matrix.d)
  if (scaleX <= Number.EPSILON || scaleY <= Number.EPSILON)
    throw new Error('Reparent transform is singular')
  const dot = matrix.a * matrix.c + matrix.b * matrix.d
  if (matrix.a * matrix.d - matrix.b * matrix.c < 0)
    throw new Error('Reparent transform reflection cannot be represented by common node geometry')
  if (Math.abs(dot / (scaleX * scaleY)) > 1e-8)
    throw new Error('Reparent transform shear cannot be represented by common node geometry')
  const rotation = Math.atan2(matrix.b, matrix.a) * 180 / Math.PI
  const cx = width / 2
  const cy = height / 2
  const nextWidth = width * scaleX
  const nextHeight = height * scaleY
  const transformedCenter = applyMatrixToPoint(matrix, { x: cx, y: cy })
  return {
    x: normalizeZero(transformedCenter.x - nextWidth / 2),
    y: normalizeZero(transformedCenter.y - nextHeight / 2),
    width: normalizeZero(nextWidth),
    height: normalizeZero(nextHeight),
    rotation: normalizeZero(rotation),
  }
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value
}
```

- [ ] **Step 4: Run matrix tests**

Run: `pnpm exec vitest run --dom packages/core/src/matrix-chain.test.ts`

Expected: PASS with 4 tests; positive orthogonal scale is represented through dimensions while shear/reflection fail closed.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/matrix-chain.ts packages/core/src/matrix-chain.test.ts packages/core/src/index.ts
git commit -m "feat(core): add document matrix chains"
```

### Task 11: Slot Reparent Preserving World Transform

**Files:**
- Create: `packages/core/src/slot-reparent.ts`
- Create: `packages/core/src/slot-reparent.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing reparent and cycle tests**

```ts
import type { MaterialNode } from '@easyink/schema'
import type { Matrix2D } from './matrix-chain'
import { describe, expect, it, vi } from 'vitest'
import { createDefaultSchema } from '@easyink/schema'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'
import { combineStableOperationDescriptors } from './document-change-set'
import { DocumentStore } from './document-store'
import { DocumentTransactionEngine } from './document-transaction-engine'
import { requireDocumentNode } from './document-index'
import { applyMatrixToPoint, IDENTITY_MATRIX, multiplyMatrix, nodeLocalMatrix } from './matrix-chain'
import { createSlotReparentPlan, reparentNode } from './slot-reparent'

function worldCorners(node: MaterialNode, world: Matrix2D) {
  return [
    { x: 0, y: 0 }, { x: node.width, y: 0 },
    { x: node.width, y: node.height }, { x: 0, y: node.height },
  ].map(point => applyMatrixToPoint(world, point))
}

function expectSameWorldPose(actual: readonly { x: number, y: number }[], expected: readonly { x: number, y: number }[]): void {
  actual.forEach((point, index) => {
    expect(point.x).toBeCloseTo(expected[index]!.x)
    expect(point.y).toBeCloseTo(expected[index]!.y)
  })
}

describe('slot reparent plans', () => {
  it('moves a root node into a rotated owner slot without changing world position', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createDefaultSchema()
    schema.elements = [
      profile.createNode('container', { id: 'owner', x: 100, y: 50, width: 50, height: 50, rotation: 90, slots: { content: [] } }),
      profile.createNode('box', { id: 'child', x: 120, y: 60, width: 10, height: 10 }),
    ]
    const beforeOrigin = applyMatrixToPoint(nodeLocalMatrix(schema.elements[1]!), { x: 0, y: 0 })
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    reparentNode(engine, 'child', { kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', atEnd: true })
    expect(store.document.elements.map(node => node.id)).toEqual(['owner'])
    const owner = store.document.elements[0]!
    const child = owner.slots.content[0]!
    const afterOrigin = applyMatrixToPoint(multiplyMatrix(nodeLocalMatrix(owner), nodeLocalMatrix(child)), { x: 0, y: 0 })
    expect(afterOrigin.x).toBeCloseTo(beforeOrigin.x)
    expect(afterOrigin.y).toBeCloseTo(beforeOrigin.y)
    engine.undo()
    expect(store.document.elements.map(node => node.id)).toEqual(['owner', 'child'])
  })

  it('uses document coordinates without consulting slot geometry', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'document-container', slots: [{
        id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'document',
        layoutParticipation: 'owner', reparent: 'allowed',
      }] }),
    ])
    const owner = profile.createNode('document-container', {
      id: 'owner', x: 100, y: 40, rotation: 35, slots: { content: [] },
    })
    const child = profile.createNode('box', { id: 'child', x: 30, y: 20, width: 12, height: 8, rotation: 10 })
    const before = worldCorners(child, nodeLocalMatrix(child))
    const resolveSlotContentTransform = vi.fn(() => { throw new Error('document coordinates must not resolve slot geometry') })
    const store = new DocumentStore({ ...createDefaultSchema(), elements: [owner, child] }, profile)
    reparentNode(new DocumentTransactionEngine(store), 'child', {
      kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', atEnd: true,
    }, { geometry: { resolveSlotContentTransform } })
    const nested = store.document.elements[0]!.slots.content[0]!
    expectSameWorldPose(worldCorners(nested, nodeLocalMatrix(nested)), before)
    expect(resolveSlotContentTransform).not.toHaveBeenCalled()
  })

  it('uses a committed padded slot world transform under a rotated and scaled owner and undoes exactly', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'slot-container', slots: [{
        id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'slot',
        layoutParticipation: 'owner', reparent: 'allowed',
      }] }),
    ])
    const owner = profile.createNode('slot-container', {
      id: 'owner', x: 40, y: 25, width: 80, height: 50, rotation: 30, slots: { content: [] },
    })
    const child = profile.createNode('box', {
      id: 'child', x: 170, y: 90, width: 24, height: 12, rotation: 15,
    })
    const before = worldCorners(child, nodeLocalMatrix(child))
    const scaledOwnerWorld = multiplyMatrix(
      { a: 1.5, b: 0, c: 0, d: 1.5, e: 12, f: -4 },
      nodeLocalMatrix(owner),
    )
    const slotWorld = multiplyMatrix(
      scaledOwnerWorld,
      { a: 1, b: 0, c: 0, d: 1, e: 8, f: 6 }, // committed padded content-box origin
    )
    const resolveSlotContentTransform = vi.fn((_ownerNodeId: string, _slot: string, expectedNodeRevision: number) => ({
      worldMatrix: slotWorld, ownerRevision: expectedNodeRevision, layoutRevision: 7,
    }))
    const store = new DocumentStore({ ...createDefaultSchema(), elements: [owner, child] }, profile)
    const engine = new DocumentTransactionEngine(store)
    reparentNode(engine, 'child', {
      kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', atEnd: true,
    }, { geometry: { resolveSlotContentTransform } })

    const nested = store.document.elements[0]!.slots.content[0]!
    expectSameWorldPose(worldCorners(nested, multiplyMatrix(slotWorld, nodeLocalMatrix(nested))), before)
    expect(nested.width).toBeCloseTo(child.width / 1.5)
    expect(nested.height).toBeCloseTo(child.height / 1.5)
    expect(resolveSlotContentTransform).toHaveBeenNthCalledWith(1, 'owner', 'content', 0)
    expect(resolveSlotContentTransform).toHaveBeenNthCalledWith(2, 'owner', 'content', 0)

    engine.undo()
    const restored = store.document.elements.find(node => node.id === 'child')!
    expect(restored).toMatchObject({ x: child.x, y: child.y, width: child.width, height: child.height, rotation: child.rotation })
    expectSameWorldPose(worldCorners(restored, nodeLocalMatrix(restored)), before)
  })

  it('fails closed for missing or stale slot geometry without publishing history', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'slot-container', slots: [{
        id: 'content', key: { kind: 'exact', value: 'content' }, coordinateSpace: 'slot',
        layoutParticipation: 'owner', reparent: 'allowed',
      }] }),
    ])
    const schema = { ...createDefaultSchema(), elements: [
      profile.createNode('slot-container', { id: 'owner', slots: { content: [] } }),
      profile.createNode('box', { id: 'child' }),
    ] }
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const target = { kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', atEnd: true } as const

    expect(() => createSlotReparentPlan(store, {
      nodeId: 'child', target, preserveWorldPose: true,
    })).toThrow(/SLOT_CONTENT_TRANSFORM_MISSING/)
    expect(() => createSlotReparentPlan(store, {
      nodeId: 'child', target, preserveWorldPose: true,
      geometry: { resolveSlotContentTransform: (_owner, _slot, expected) => ({
        worldMatrix: IDENTITY_MATRIX, ownerRevision: expected + 1, layoutRevision: 1,
      }) },
    })).toThrow(/SLOT_CONTENT_TRANSFORM_STALE/)

    let layoutRevision = 2
    const geometry = { resolveSlotContentTransform: (_owner: string, _slot: string, expected: number) => ({
      worldMatrix: IDENTITY_MATRIX, ownerRevision: expected, layoutRevision,
    }) }
    const plan = createSlotReparentPlan(store, {
      nodeId: 'child', target, preserveWorldPose: true, geometry,
    })
    const before = store.committedDocument
    layoutRevision = 3
    expect(() => engine.transact(draft => plan.apply(draft), {
      label: 'Stale slot move', operation: plan.operation,
    })).toThrow(/SLOT_CONTENT_TRANSFORM_STALE/)
    expect(store.committedDocument).toBe(before)
    expect(store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)
  })

  it('reorders within one slot by stable sibling anchor after removing the moving node', () => {
    const profile = createTestCompiledMaterialProfile()
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [
      profile.createNode('box', { id: 'a' }),
      profile.createNode('box', { id: 'b' }),
      profile.createNode('box', { id: 'c' }),
    ] } })
    const schema = { ...createDefaultSchema(), elements: [owner] }
    const store = new DocumentStore(schema, profile)
    reparentNode(new DocumentTransactionEngine(store), 'a', {
      kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', beforeNodeId: 'c',
    })
    expect(store.document.elements[0]!.slots.content.map(node => node.id)).toEqual(['b', 'a', 'c'])
  })

  it('resolves an after-node anchor against the post-removal target slot', () => {
    const profile = createTestCompiledMaterialProfile()
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [
      profile.createNode('box', { id: 'a' }),
      profile.createNode('box', { id: 'b' }),
      profile.createNode('box', { id: 'c' }),
    ] } })
    const store = new DocumentStore({ ...createDefaultSchema(), elements: [owner] }, profile)
    reparentNode(new DocumentTransactionEngine(store), 'a', {
      kind: 'node-slot', ownerNodeId: 'owner', slot: 'content', afterNodeId: 'c',
    })
    expect(store.document.elements[0]!.slots.content.map(node => node.id)).toEqual(['b', 'c', 'a'])
  })

  it('rejects moving an owner into its own descendant', () => {
    const profile = createTestCompiledMaterialProfile()
    const schema = createDefaultSchema()
    const child = profile.createNode('container', { id: 'child', slots: { content: [] } })
    schema.elements = [profile.createNode('container', { id: 'owner', slots: { content: [child] } })]
    const engine = new DocumentTransactionEngine(new DocumentStore(schema, profile))
    expect(() => reparentNode(engine, 'owner', {
      kind: 'node-slot', ownerNodeId: 'child', slot: 'content', atEnd: true,
    }))
      .toThrow(/descendant/)
  })

  it('enforces source and target reparent policies before publication', () => {
    const slot = (reparent: 'allowed' | 'same-material' | 'forbidden') => ({
      id: 'content', key: { kind: 'exact' as const, value: 'content' }, coordinateSpace: 'owner' as const,
      layoutParticipation: 'owner' as const, reparent,
    })
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'locked-container', slots: [slot('forbidden')] }),
      createTestMaterialManifest({ type: 'open-container', slots: [slot('allowed')] }),
    ])
    const child = profile.createNode('box', { id: 'child' })
    const source = profile.createNode('locked-container', { id: 'source', slots: { content: [child] } })
    const target = profile.createNode('open-container', { id: 'target', slots: { content: [] } })
    const engine = new DocumentTransactionEngine(new DocumentStore({ ...createDefaultSchema(), elements: [source, target] }, profile))
    expect(() => reparentNode(engine, 'child', {
      kind: 'node-slot', ownerNodeId: 'target', slot: 'content', atEnd: true,
    })).toThrow(/forbids reparenting/)
    expect(engine.store.revision).toBe(0)
    expect(engine.totalCount).toBe(0)
  })

  it('allows same-material across owner instances and rejects a different owner type', () => {
    const sameMaterialSlot = {
      id: 'content', key: { kind: 'exact' as const, value: 'content' }, coordinateSpace: 'owner' as const,
      layoutParticipation: 'owner' as const, reparent: 'same-material' as const,
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({ type: 'peer-container', slots: [sameMaterialSlot] }),
      createTestMaterialManifest({ type: 'other-container', slots: [{ ...sameMaterialSlot, reparent: 'allowed' }] }),
    ])
    const firstChild = profile.createNode('box', { id: 'first-child' })
    const first = profile.createNode('peer-container', { id: 'first', slots: { content: [firstChild] } })
    const second = profile.createNode('peer-container', { id: 'second', slots: { content: [] } })
    const other = profile.createNode('other-container', { id: 'other', slots: { content: [] } })
    const store = new DocumentStore({ ...createDefaultSchema(), elements: [first, second, other] }, profile)
    const engine = new DocumentTransactionEngine(store)
    reparentNode(engine, 'first-child', { kind: 'node-slot', ownerNodeId: 'second', slot: 'content', atEnd: true })
    engine.undo()
    expect(() => reparentNode(engine, 'first-child', {
      kind: 'node-slot', ownerNodeId: 'other', slot: 'content', atEnd: true,
    })).toThrow(/same material type/)
  })

  it('uses committed prospective-cell geometry while atomically ensuring the first materials slot', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({
        type: 'table',
        slots: [{
          id: 'cell', key: { kind: 'prefix', value: 'cell:' }, coordinateSpace: 'slot',
          layoutParticipation: 'owner', reparent: 'allowed',
        }],
      }),
    ])
    const schema = { ...createDefaultSchema(), elements: [
      profile.createNode('table', { id: 'table-1', model: { mode: 'text' } }),
      profile.createNode('box', { id: 'child' }),
    ] }
    const store = new DocumentStore(schema, profile)
    const engine = new DocumentTransactionEngine(store)
    const geometry = { resolveSlotContentTransform: vi.fn((owner: string, slot: string, expected: number) => {
      expect(Object.hasOwn(store.committedDocument.elements[0]!.slots, 'cell:c-1')).toBe(false)
      expect([owner, slot]).toEqual(['table-1', 'cell:c-1'])
      return {
        worldMatrix: { ...IDENTITY_MATRIX, e: 12, f: 8 }, ownerRevision: expected, layoutRevision: 1,
      }
    }) }
    const plan = createSlotReparentPlan(store, {
      nodeId: 'child',
      target: { kind: 'node-slot', ownerNodeId: 'table-1', slot: 'cell:c-1', atEnd: true },
      preserveWorldPose: true,
      ensureTargetSlot: true,
      geometry,
    })
    const tableOperation = {
      kind: 'table.cell.materials', sessionPath: [], targetIds: ['node:table-1', 'table.cell:c-1'],
      fieldPaths: ['/model/mode'], selectionLineage: null, structural: true,
    } as const

    engine.transact((draft) => {
      requireDocumentNode(draft, profile, 'table-1').model.mode = 'materials'
      plan.apply(draft)
    }, {
      label: 'Move into table cell',
      operation: combineStableOperationDescriptors('table.cell.materials', [tableOperation, plan.operation]),
    })

    expect(store.document.elements).toHaveLength(1)
    expect(store.document.elements[0]!.model.mode).toBe('materials')
    expect(store.document.elements[0]!.slots['cell:c-1']!.map(node => node.id)).toEqual(['child'])
    expect(geometry.resolveSlotContentTransform).toHaveBeenCalledTimes(2)
    expect(engine.totalCount).toBe(1)

    engine.undo()
    expect(store.document.elements.map(node => node.id)).toEqual(['table-1', 'child'])
    expect(store.document.elements[0]!.model.mode).toBe('text')
    expect(Object.hasOwn(store.document.elements[0]!.slots, 'cell:c-1')).toBe(false)
  })

  it('requires an ensured dynamic slot key to match exactly one manifest policy', () => {
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'box' }),
      createTestMaterialManifest({
        type: 'ambiguous',
        slots: [
          { id: 'cell-prefix', key: { kind: 'prefix', value: 'cell:' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' },
          { id: 'cell-exact', key: { kind: 'exact', value: 'cell:c-1' }, coordinateSpace: 'owner', layoutParticipation: 'owner', reparent: 'allowed' },
        ],
      }),
    ])
    const store = new DocumentStore({ ...createDefaultSchema(), elements: [
      profile.createNode('ambiguous', { id: 'owner' }), profile.createNode('box', { id: 'child' }),
    ] }, profile)
    expect(() => createSlotReparentPlan(store, {
      nodeId: 'child',
      target: { kind: 'node-slot', ownerNodeId: 'owner', slot: 'cell:c-1', atEnd: true },
      preserveWorldPose: true,
      ensureTargetSlot: true,
    })).toThrow(/exactly one manifest slot policy/)
  })
})
```

- [ ] **Step 2: Run reparent tests to verify they fail**

Run: `pnpm exec vitest run --dom packages/core/src/slot-reparent.test.ts`

Expected: FAIL because `createSlotReparentPlan` and `reparentNode` are missing.

- [ ] **Step 3: Implement document slot addresses and a composable reparent plan**

```ts
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { DocumentOperationDescriptor } from './document-change-set'
import type { DocumentStore } from './document-store'
import type { DocumentTransactionEngine } from './document-transaction-engine'
import type { DocumentIndexSnapshot, DocumentSlotPolicySnapshot } from './document-index'
import type { Matrix2D } from './matrix-chain'
import type { CompiledMaterialProfile } from './material-profile'
import { requireDocumentNode } from './document-index'
import { IDENTITY_MATRIX, invertMatrix, matrixToNodeGeometry, multiplyMatrix, nodeLocalMatrix } from './matrix-chain'

export type DocumentSlotAddress
  = { kind: 'root', slot: 'elements' }
    | { kind: 'node-slot', ownerNodeId: string, slot: string }

export type StableSlotInsertionAnchor
  = { beforeNodeId: string, afterNodeId?: never, atEnd?: never }
    | { beforeNodeId?: never, afterNodeId: string, atEnd?: never }
    | { beforeNodeId?: never, afterNodeId?: never, atEnd: true }

export type DocumentSlotTarget = DocumentSlotAddress & StableSlotInsertionAnchor

export interface SlotContentTransformSnapshot {
  readonly worldMatrix: Matrix2D
  readonly ownerRevision: number
  readonly layoutRevision: number
}

export interface SlotGeometrySidecarResolver {
  // A policy-approved prospective runtime key may resolve before owner.slots[key] exists.
  resolveSlotContentTransform(
    ownerNodeId: string,
    slot: string,
    expectedNodeRevision: number,
  ): SlotContentTransformSnapshot | undefined
}

export interface SlotReparentPlanInput {
  nodeId: string
  target: DocumentSlotTarget
  preserveWorldPose: true
  ensureTargetSlot?: boolean
  sessionPath?: readonly string[]
  selectionLineage?: string | null
  geometry?: SlotGeometrySidecarResolver
}

export interface SlotReparentPlan {
  readonly operation: DocumentOperationDescriptor
  apply(draft: DocumentSchema): void
}

export interface SlotReparentOptions {
  ensureTargetSlot?: boolean
  sessionPath?: readonly string[]
  selectionLineage?: string | null
  geometry?: SlotGeometrySidecarResolver
}

interface SlotGeometryDependency extends SlotContentTransformSnapshot {
  readonly ownerNodeId: string
  readonly slot: string
  readonly expectedNodeRevision: number
}

export function createSlotReparentPlan(store: DocumentStore, input: SlotReparentPlanInput): SlotReparentPlan {
  if (input.preserveWorldPose !== true)
    throw new Error('Slot reparent requires preserveWorldPose: true')
  const plannedRevision = store.revision
  const index = store.committedIndex
  const sourceNode = index.getNode(input.nodeId)
  if (!sourceNode)
    throw new Error(`Document node "${input.nodeId}" not found`)
  const source = sourceAddress(index, input.nodeId)
  const targetAddress = addressOf(input.target)
  const sameSlot = sameSlotAddress(source, targetAddress)

  if (input.target.kind === 'node-slot') {
    const ownerAddress = index.getAddress(input.target.ownerNodeId)
    if (!ownerAddress)
      throw new Error(`Target owner "${input.target.ownerNodeId}" not found`)
    if (input.target.ownerNodeId === input.nodeId || ownerAddress.ancestors.some(part => part.ownerNodeId === input.nodeId))
      throw new Error('Cannot reparent a node into its own descendant')
  }

  const targetResolution = resolveCommittedTarget(store, targetAddress, input.ensureTargetSlot === true)
  assertAnchorExists(targetResolution.nodes, input.target, input.nodeId)
  if (!sameSlot)
    assertReparentPolicies(index, source, targetResolution.policy)

  const geometryDependencies = new Map<string, SlotGeometryDependency>()
  let nextGeometry: ReturnType<typeof matrixToNodeGeometry> | null = null
  if (!sameSlot) {
    const destinationWorld = resolveTargetSlotMatrix(
      index, targetAddress, targetResolution.policy, input, geometryDependencies,
    )
    const oldWorld = resolveWorldMatrix(index, input.nodeId, input, geometryDependencies)
    const local = multiplyMatrix(invertMatrix(destinationWorld), oldWorld)
    nextGeometry = matrixToNodeGeometry(local, sourceNode.width, sourceNode.height)
  }
  const capturedGeometry = Object.freeze([...geometryDependencies.values()])

  const operation: DocumentOperationDescriptor = Object.freeze({
    kind: sameSlot ? 'structure.reorder' : 'structure.reparent',
    sessionPath: Object.freeze([...(input.sessionPath ?? [])]),
    targetIds: Object.freeze([...new Set(stableTargetIds(input.nodeId, source, input.target))].sort()),
    fieldPaths: Object.freeze([...new Set([slotFieldPath(source), slotFieldPath(targetAddress)])].sort()),
    selectionLineage: input.selectionLineage ?? null,
    structural: true,
  })

  return Object.freeze({
    operation,
    apply(draft: DocumentSchema): void {
      if (store.revision !== plannedRevision)
        throw new Error('Slot reparent plan is stale')
      assertSlotGeometryFresh(input.geometry, capturedGeometry)
      const sourceNodes = resolveDraftSlot(draft, store.profile, source)
      const sourceIndex = sourceNodes.findIndex(node => node.id === input.nodeId)
      if (sourceIndex < 0)
        throw new Error(`Source slot for "${input.nodeId}" changed during reparent`)
      const [moving] = sourceNodes.splice(sourceIndex, 1)
      if (!moving)
        throw new Error(`Document node "${input.nodeId}" disappeared during reparent`)
      const targetNodes = resolveDraftTargetSlot(
        draft, store.profile, targetAddress, input.ensureTargetSlot === true,
      )
      const insertionIndex = resolveInsertionIndex(targetNodes, input.target)
      if (nextGeometry)
        Object.assign(moving, nextGeometry)
      targetNodes.splice(insertionIndex, 0, moving)
    },
  })
}

export function reparentNode(
  engine: DocumentTransactionEngine,
  nodeId: string,
  target: DocumentSlotTarget,
  options: SlotReparentOptions = {},
): void {
  const plan = createSlotReparentPlan(engine.store, {
    nodeId, target, preserveWorldPose: true, ...options,
  })
  engine.transact(draft => plan.apply(draft), {
    label: 'Reparent material',
    operation: plan.operation,
  })
}

function sourceAddress(index: DocumentIndexSnapshot, nodeId: string): DocumentSlotAddress {
  const parent = index.getAddress(nodeId)?.ancestors.at(-1)
  return parent
    ? { kind: 'node-slot', ownerNodeId: parent.ownerNodeId, slot: parent.slot }
    : { kind: 'root', slot: 'elements' }
}

function addressOf(target: DocumentSlotTarget): DocumentSlotAddress {
  return target.kind === 'root'
    ? { kind: 'root', slot: 'elements' }
    : { kind: 'node-slot', ownerNodeId: target.ownerNodeId, slot: target.slot }
}

function resolveDraftSlot(document: DocumentSchema, profile: CompiledMaterialProfile, address: DocumentSlotAddress): MaterialNode[] {
  if (address.kind === 'root')
    return document.elements
  const owner = requireDocumentNode(document, profile, address.ownerNodeId)
  if (!Object.hasOwn(owner.slots, address.slot))
    throw new Error(`Target slot "${address.ownerNodeId}.${address.slot}" does not exist`)
  return owner.slots[address.slot]!
}

function resolveDraftTargetSlot(
  document: DocumentSchema,
  profile: CompiledMaterialProfile,
  address: DocumentSlotAddress,
  ensureTargetSlot: boolean,
): MaterialNode[] {
  if (address.kind === 'root')
    return document.elements
  const owner = requireDocumentNode(document, profile, address.ownerNodeId)
  if (!Object.hasOwn(owner.slots, address.slot)) {
    if (!ensureTargetSlot)
      throw new Error(`Target slot "${address.ownerNodeId}.${address.slot}" does not exist`)
    owner.slots[address.slot] = []
  }
  return owner.slots[address.slot]!
}

type ResolvedSlotPolicy = 'root' | DocumentSlotPolicySnapshot

function resolveCommittedTarget(
  store: DocumentStore,
  address: DocumentSlotAddress,
  ensureTargetSlot: boolean,
): { nodes: readonly MaterialNode[], policy: ResolvedSlotPolicy } {
  if (address.kind === 'root')
    return { nodes: store.committedDocument.elements, policy: 'root' }
  const owner = store.committedIndex.getNode(address.ownerNodeId)
  if (!owner)
    throw new Error(`Target owner "${address.ownerNodeId}" does not exist`)
  if (Object.hasOwn(owner.slots, address.slot)) {
    const policy = store.committedIndex.getSlot(address.ownerNodeId, address.slot)
    if (!policy)
      throw new Error(`Target slot "${address.ownerNodeId}.${address.slot}" has no resolved policy`)
    return { nodes: owner.slots[address.slot]!, policy }
  }
  if (!ensureTargetSlot)
    throw new Error(`Target slot "${address.ownerNodeId}.${address.slot}" does not exist`)

  const policies = store.profile.getManifest(owner.type)?.common.structure.slots.filter((policy) => {
    return policy.key.kind === 'exact'
      ? address.slot === policy.key.value
      : address.slot.startsWith(policy.key.value)
  }) ?? []
  if (policies.length !== 1)
    throw new Error(`Target slot "${address.ownerNodeId}.${address.slot}" must match exactly one manifest slot policy`)
  const policy = policies[0]!
  return {
    nodes: [],
    policy: Object.freeze({
      ownerNodeId: owner.id,
      slot: address.slot,
      policyId: policy.id,
      coordinateSpace: policy.coordinateSpace,
      layoutParticipation: policy.layoutParticipation,
      reparent: policy.reparent,
    }),
  }
}

function resolveWorldMatrix(
  index: DocumentIndexSnapshot,
  nodeId: string,
  options: Pick<SlotReparentPlanInput, 'geometry'>,
  dependencies: Map<string, SlotGeometryDependency>,
): Matrix2D {
  const node = index.getNode(nodeId)
  const address = index.getAddress(nodeId)
  if (!node || !address)
    throw new Error(`Document node "${nodeId}" not found`)
  const parent = address.ancestors.at(-1)
  return parent
    ? multiplyMatrix(
        resolveSlotBasis(index, parent.ownerNodeId, parent.slot, options, dependencies),
        nodeLocalMatrix(node),
      )
    : nodeLocalMatrix(node)
}

function resolveTargetSlotMatrix(
  index: DocumentIndexSnapshot,
  target: DocumentSlotAddress,
  policy: ResolvedSlotPolicy,
  options: Pick<SlotReparentPlanInput, 'geometry'>,
  dependencies: Map<string, SlotGeometryDependency>,
): Matrix2D {
  if (target.kind === 'root')
    return IDENTITY_MATRIX
  if (policy === 'root')
    throw new Error('A node-slot target requires a slot policy')
  return resolvePolicyWorldBasis(
    index, target.ownerNodeId, target.slot, policy, options, dependencies,
  )
}

function resolveSlotBasis(
  index: DocumentIndexSnapshot,
  ownerNodeId: string,
  slot: string,
  options: Pick<SlotReparentPlanInput, 'geometry'>,
  dependencies: Map<string, SlotGeometryDependency>,
): Matrix2D {
  const owner = index.getNode(ownerNodeId)
  const policy = index.getSlot(ownerNodeId, slot)
  if (!owner || !policy || !Object.hasOwn(owner.slots, slot))
    throw new Error(`Target slot "${ownerNodeId}.${slot}" does not exist`)
  return resolvePolicyWorldBasis(index, ownerNodeId, slot, policy, options, dependencies)
}

function resolvePolicyWorldBasis(
  index: DocumentIndexSnapshot,
  ownerNodeId: string,
  slot: string,
  policy: DocumentSlotPolicySnapshot,
  options: Pick<SlotReparentPlanInput, 'geometry'>,
  dependencies: Map<string, SlotGeometryDependency>,
): Matrix2D {
  switch (policy.coordinateSpace) {
    case 'document':
      return IDENTITY_MATRIX
    case 'owner':
      return resolveWorldMatrix(index, ownerNodeId, options, dependencies)
    case 'slot':
      return captureSlotContentTransform(
        options.geometry, ownerNodeId, slot, index.revision, dependencies,
      ).worldMatrix
  }
}

function captureSlotContentTransform(
  resolver: SlotGeometrySidecarResolver | undefined,
  ownerNodeId: string,
  slot: string,
  expectedNodeRevision: number,
  dependencies: Map<string, SlotGeometryDependency>,
): SlotGeometryDependency {
  const snapshot = resolver?.resolveSlotContentTransform(ownerNodeId, slot, expectedNodeRevision)
  if (!snapshot)
    throw new Error(`SLOT_CONTENT_TRANSFORM_MISSING: ${ownerNodeId}.${slot}`)
  assertSlotContentTransformSnapshot(snapshot, expectedNodeRevision, ownerNodeId, slot)
  const key = JSON.stringify([ownerNodeId, slot])
  const existing = dependencies.get(key)
  if (existing) {
    if (existing.layoutRevision !== snapshot.layoutRevision || !sameMatrix(existing.worldMatrix, snapshot.worldMatrix))
      throw new Error(`SLOT_CONTENT_TRANSFORM_STALE: ${ownerNodeId}.${slot}`)
    return existing
  }
  const dependency = Object.freeze({
    ownerNodeId,
    slot,
    expectedNodeRevision,
    ownerRevision: snapshot.ownerRevision,
    layoutRevision: snapshot.layoutRevision,
    worldMatrix: Object.freeze({ ...snapshot.worldMatrix }),
  })
  dependencies.set(key, dependency)
  return dependency
}

function assertSlotGeometryFresh(
  resolver: SlotGeometrySidecarResolver | undefined,
  dependencies: readonly SlotGeometryDependency[],
): void {
  for (const expected of dependencies) {
    const current = resolver?.resolveSlotContentTransform(
      expected.ownerNodeId, expected.slot, expected.expectedNodeRevision,
    )
    if (!current)
      throw new Error(`SLOT_CONTENT_TRANSFORM_MISSING: ${expected.ownerNodeId}.${expected.slot}`)
    assertSlotContentTransformSnapshot(
      current, expected.expectedNodeRevision, expected.ownerNodeId, expected.slot,
    )
    if (current.ownerRevision !== expected.ownerRevision
      || current.layoutRevision !== expected.layoutRevision
      || !sameMatrix(current.worldMatrix, expected.worldMatrix)) {
      throw new Error(`SLOT_CONTENT_TRANSFORM_STALE: ${expected.ownerNodeId}.${expected.slot}`)
    }
  }
}

function assertSlotContentTransformSnapshot(
  snapshot: SlotContentTransformSnapshot,
  expectedNodeRevision: number,
  ownerNodeId: string,
  slot: string,
): void {
  if (snapshot.ownerRevision !== expectedNodeRevision
    || !Number.isInteger(snapshot.layoutRevision) || snapshot.layoutRevision < 0
    || Object.values(snapshot.worldMatrix).some(value => !Number.isFinite(value))) {
    throw new Error(`SLOT_CONTENT_TRANSFORM_STALE: ${ownerNodeId}.${slot}`)
  }
}

function sameMatrix(left: Matrix2D, right: Matrix2D): boolean {
  return left.a === right.a && left.b === right.b
    && left.c === right.c && left.d === right.d
    && left.e === right.e && left.f === right.f
}

function assertReparentPolicies(index: DocumentIndexSnapshot, source: DocumentSlotAddress, targetPolicy: ResolvedSlotPolicy): void {
  const sourcePolicy = policyFor(index, source)
  if (sourcePolicy === 'root' && targetPolicy === 'root')
    return
  if (sourcePolicy === 'root') {
    if (targetPolicy === 'root' || targetPolicy.reparent !== 'allowed')
      throw new Error('A same-material or forbidden slot cannot reparent to or from the document root')
    return
  }
  if (targetPolicy === 'root') {
    if (sourcePolicy.reparent !== 'allowed')
      throw new Error('A same-material or forbidden slot cannot reparent to or from the document root')
    return
  }
  if (sourcePolicy.reparent === 'forbidden' || targetPolicy.reparent === 'forbidden')
    throw new Error('Source or target slot forbids reparenting')
  if (sourcePolicy.reparent === 'same-material' || targetPolicy.reparent === 'same-material') {
    const sourceOwner = index.getNode(sourcePolicy.ownerNodeId)!
    const targetOwner = index.getNode(targetPolicy.ownerNodeId)!
    if (sourceOwner.type !== targetOwner.type)
      throw new Error('Source and target slot owners must have the same material type')
  }
}

function policyFor(index: DocumentIndexSnapshot, address: DocumentSlotAddress): ResolvedSlotPolicy {
  if (address.kind === 'root')
    return 'root'
  const policy = index.getSlot(address.ownerNodeId, address.slot)
  if (!policy)
    throw new Error(`Slot policy "${address.ownerNodeId}.${address.slot}" does not exist`)
  return policy
}

function assertAnchorExists(nodes: readonly MaterialNode[], target: StableSlotInsertionAnchor, movingNodeId: string): void {
  const siblingId = target.beforeNodeId ?? target.afterNodeId
  if (!siblingId)
    return
  if (siblingId === movingNodeId)
    throw new Error('A node cannot use itself as its insertion anchor')
  if (!nodes.some(node => node.id === siblingId))
    throw new Error(`Insertion anchor "${siblingId}" is not in the target slot`)
}

function resolveInsertionIndex(nodes: readonly MaterialNode[], target: StableSlotInsertionAnchor): number {
  if (target.atEnd)
    return nodes.length
  const siblingId = target.beforeNodeId ?? target.afterNodeId!
  const index = nodes.findIndex(node => node.id === siblingId)
  if (index < 0)
    throw new Error(`Insertion anchor "${siblingId}" disappeared during reparent`)
  return target.beforeNodeId ? index : index + 1
}

function sameSlotAddress(left: DocumentSlotAddress, right: DocumentSlotAddress): boolean {
  return left.kind === right.kind
    && left.slot === right.slot
    && (left.kind === 'root' || (right.kind === 'node-slot' && left.ownerNodeId === right.ownerNodeId))
}

function stableTargetIds(nodeId: string, source: DocumentSlotAddress, target: DocumentSlotTarget): string[] {
  return [
    `node:${nodeId}`,
    ...(source.kind === 'node-slot' ? [`node:${source.ownerNodeId}`] : ['document']),
    ...(target.kind === 'node-slot' ? [`node:${target.ownerNodeId}`] : ['document']),
    ...(target.beforeNodeId ? [`node:${target.beforeNodeId}`] : []),
    ...(target.afterNodeId ? [`node:${target.afterNodeId}`] : []),
  ]
}

function slotFieldPath(address: DocumentSlotAddress): `/${string}` {
  return address.kind === 'root' ? '/elements' : `/slots/${escapePointer(address.slot)}`
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}
```

`createSlotReparentPlan()` is revision-bound and performs all lookup, cycle, stable-anchor, source/target policy, and world-pose representability checks before returning. Destination and source bases use one exhaustive coordinate-space switch: `document` is `IDENTITY_MATRIX`; `owner` is the recursively composed owner world matrix; `slot` is the committed slot-content world matrix. The Designer authoring-preview layout service composes `ownerWorld * slotContentTransform` from the committed padded content box and exposes it only through `SlotGeometrySidecarResolver`; core never parses table/private model or recomputes cell padding. The new local transform is exactly `inverse(destinationWorld) * oldWorld`.

The resolver is conditionally mandatory whenever the source ancestry or destination basis traverses `coordinateSpace: 'slot'`; root, document-coordinate, and root-owner-coordinate moves do not call it. A snapshot must have `ownerRevision === expectedNodeRevision`, a finite matrix, and a non-negative integer `layoutRevision`. Plan creation captures every slot geometry dependency. `apply()` first verifies the document revision, then resolves each dependency again and requires the same owner revision, layout revision, and matrix before touching the draft. Missing/stale geometry throws `SLOT_CONTENT_TRANSFORM_MISSING` or `SLOT_CONTENT_TRANSFORM_STALE`; the transaction publishes neither document nor history. Its `apply()` method otherwise remains a pure draft operation and never opens a transaction.

`ensureTargetSlot` may materialize only `owner.slots[slot] = []`, and only after the requested runtime key matches exactly one frozen manifest exact/prefix policy; policy resolution and geometry capture happen while the committed slot may still be absent, and physical materialization/node insertion occur later in the same recipe. For a complex table, the Designer committed geometry sidecar must publish `cell:<cellId>` content transforms for every active cell, including text cells with no material slot yet, from the committed `contentRect`, owner world transform, owner revision, and layout revision. The resolver may answer that policy-approved prospective key; it must never guess the owner transform or synthesize padding from an absent slot. Missing or changed prospective geometry fails before draft mutation. Undo restores the text-cell model, root child, and absence of the slot in one history step.

Material-private `ownership`, `clip`, cell content, padding, or layout state are not core parameters. Complex table cell policies use `coordinateSpace: 'slot'` and pass the Designer layout-preview geometry sidecar. Core validates the frozen exact/prefix policy before invoking the prospective resolver and never asks it to authorize a runtime key. `reparentNode()` remains the convenience wrapper that creates one plan and commits it exactly once.

Add policy tests using custom manifests from `createTestMaterialManifest()`: `forbidden` on either source or target rejects before publication; `same-material` succeeds across two owner instances with the same `type` and rejects different owner types; same-slot reorder bypasses reparent policy. The explicit coordinate tests cover document and owner branches without a resolver plus a slot-local padded content box under a rotated/uniformly-scaled owner. Compare all four world-space corners before/after, then undo and verify exact root geometry. Positive orthogonal scale is represented through width/height; shear, reflection, missing geometry, stale owner revision, and a layout revision that changes between plan/apply all fail without revision/history changes. Also create a plan, commit an unrelated document change, and assert applying that stale plan rejects without another publication. These tests use only generic slot policies, committed geometry sidecars, and common geometry; no material-private topology enters core. Export `SlotContentTransformSnapshot`, `SlotGeometrySidecarResolver`, `createSlotReparentPlan`, `SlotReparentPlan`, `SlotReparentPlanInput`, stable slot address/anchor types, and `reparentNode` from `packages/core/src/index.ts`.

- [ ] **Step 4: Run reparent, matrix, and document history tests**

Run: `pnpm exec vitest run --dom packages/core/src/slot-reparent.test.ts packages/core/src/matrix-chain.test.ts packages/core/src/document-transaction-engine.test.ts`

Expected: PASS; reparent is one undo step and cyclic/inexpressible transforms fail before publication.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/slot-reparent.ts packages/core/src/slot-reparent.test.ts packages/core/src/index.ts
git commit -m "feat(core): reparent slot nodes without visual drift"
```

### Task 12: Gesture Coordinator

**Files:**
- Create: `packages/designer/src/editing/gesture-coordinator.ts`
- Create: `packages/designer/src/editing/gesture-coordinator.test.ts`
- Modify: `packages/designer/src/store/designer-store.ts`

- [ ] **Step 1: Write failing pointer commit/cancel tests**

```ts
import { describe, expect, it } from 'vitest'
import { createTestCompiledMaterialProfile } from '@easyink/core/testing'
import { DesignerStore } from '../store/designer-store'

describe('GestureCoordinator', () => {
  it('commits pointerup and cancels pointercancel through one preview lifecycle', () => {
    const profile = createTestCompiledMaterialProfile()
    const store = new DesignerStore({ profile, schema: {
      elements: [profile.createNode('box', { id: 'a', x: 0 })],
    } })
    const target = document.createElement('div')
    const down = new PointerEvent('pointerdown', { pointerId: 1 })
    const handle = store.gestures.begin({
      target,
      event: down,
      label: 'Move',
      mergeKey: 'move:a',
      operation: {
        kind: 'geometry.move', sessionPath: [], targetIds: ['node:a'], fieldPaths: ['/x'],
        selectionLineage: store.selection.lineageId, structural: false,
      },
      update: (_event, preview) => preview.replace(draft => { draft.elements[0]!.x = 20 }),
    })
    target.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1 }))
    target.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1 }))
    expect(store.schema.elements[0]!.x).toBe(0)
    expect(store.documentTransactions.totalCount).toBe(0)
    expect(handle.isActive()).toBe(false)
  })
})
```

- [ ] **Step 2: Run the gesture test to verify it fails**

Run: `pnpm exec vitest run --dom packages/designer/src/editing/gesture-coordinator.test.ts`

Expected: FAIL because `store.gestures` is absent.

- [ ] **Step 3: Implement one-active-gesture ownership**

```ts
import type { DocumentOperationDescriptor, DocumentTransactionEngine, PreviewTransaction } from '@easyink/core'
import { createPointerGesture } from '@easyink/shared'

export interface BeginGestureOptions {
  target: HTMLElement
  event: PointerEvent
  label: string
  mergeKey?: string
  operation: DocumentOperationDescriptor
  update: (event: PointerEvent, preview: PreviewTransaction) => void
  onFinish?: (reason: 'commit' | 'cancel') => void
}

export interface GestureHandle {
  abort: () => void
  isActive: () => boolean
}

export class GestureCoordinator {
  private active: { abort: () => void } | null = null

  constructor(private readonly transactions: DocumentTransactionEngine) {}

  begin(options: BeginGestureOptions): GestureHandle {
    this.cancelActive()
    const preview = this.transactions.beginPreview({
      label: options.label,
      mergeKey: options.mergeKey,
      operation: options.operation,
    })
    let active = true
    const pointer = createPointerGesture({
      target: options.target,
      event: options.event,
      onMove: event => options.update(event, preview),
      onEnd: (_event, reason) => {
        if (!active)
          return
        active = false
        this.active = null
        if (reason === 'commit')
          preview.commit()
        else
          preview.cancel()
        options.onFinish?.(reason)
      },
    })
    const abort = () => pointer.abort()
    this.active = { abort }
    return { abort, isActive: () => active }
  }

  cancelActive(): void {
    this.active?.abort()
    this.active = null
  }
}
```

Instantiate `readonly gestures = markRaw(new GestureCoordinator(this.documentTransactions))` in `DesignerStore`; call `gestures.cancelActive()` before `setSchema()`, session path push/pop/exit, and `destroy()`.

- [ ] **Step 4: Run gesture and shared pointer lifecycle tests**

Run: `pnpm exec vitest run --dom packages/designer/src/editing/gesture-coordinator.test.ts packages/shared/src/pointer-gesture.test.ts`

Expected: PASS; capture failures remain harmless and every cancellation clears preview state once.

- [ ] **Step 5: Commit**

```bash
git add packages/designer/src/editing/gesture-coordinator.ts packages/designer/src/editing/gesture-coordinator.test.ts packages/designer/src/store/designer-store.ts
git commit -m "feat(designer): coordinate preview gestures"
```

### Task 13: Move Canvas Gestures Onto Preview Transactions

**Files:**
- Modify: `packages/designer/src/composables/use-element-drag.ts`
- Modify: `packages/designer/src/composables/use-element-drag.test.ts`
- Modify: `packages/designer/src/composables/use-element-resize.ts`
- Create: `packages/designer/src/composables/use-element-resize.test.ts`
- Modify: `packages/designer/src/composables/use-element-rotate.ts`
- Modify: `packages/designer/src/components/GuideOverlay.vue`
- Create: `packages/designer/src/components/guide-overlay.test.ts`

- [ ] **Step 1: Replace command-spy tests with preview behavior tests**

For drag, assert that three selected nodes move in the visible preview, pointercancel restores all three, pointerup commits one history entry, and undo restores all three. For resize, assert that `MaterialResizeAdapter.applyResize()` receives a draft node, private model changes are captured in the same change set, and `commitResize()` is not needed for undo. For guides, assert a newly dragged guide never enters the committed document until pointerup.

```ts
expect(store.documentTransactions.totalCount).toBe(0)
target.dispatchEvent(new PointerEvent('pointermove', { pointerId: 7, clientX: 40, clientY: 20 }))
expect(store.schema.elements[0]!.x).not.toBe(startX)
target.dispatchEvent(new PointerEvent('pointerup', { pointerId: 7 }))
expect(store.documentTransactions.totalCount).toBe(1)
store.documentTransactions.undo()
expect(store.schema.elements[0]!.x).toBe(startX)
```

- [ ] **Step 2: Run the focused gesture tests to verify they fail**

Run: `pnpm exec vitest run --dom packages/designer/src/composables/use-element-drag.test.ts packages/designer/src/composables/use-element-resize.test.ts packages/designer/src/components/guide-overlay.test.ts`

Expected: FAIL because drag, resize, rotate, and guides still mutate live schema and create Commands.

- [ ] **Step 3: Refactor every pointer mutation to `GestureCoordinator.begin()`**

Use this shape in drag, resize, rotate, and guides:

```ts
store.gestures.begin({
  target: event.currentTarget as HTMLElement,
  event,
  label: 'Move',
  mergeKey: `move:${selectedIds.join(',')}`,
  operation: {
    kind: 'geometry.move',
    sessionPath: store.editingSession.path.map(frame => frame.nodeId),
    targetIds: selectedIds.map(id => `node:${id}`),
    fieldPaths: ['/x', '/y'],
    selectionLineage: store.selection.lineageId,
    structural: false,
  },
  update: (moveEvent, preview) => {
    const currentPoint = geometry.screenToDocument({ x: moveEvent.clientX, y: moveEvent.clientY })
    const rawDx = currentPoint.x - startPoint.x
    const rawDy = currentPoint.y - startPoint.y
    const snapState = store.workbench.snap
    const delta = (moveEvent.metaKey || moveEvent.ctrlKey || !snapState.enabled)
      ? { dx: rawDx, dy: rawDy, lines: [] }
      : computeSnap({
          page: store.schema.page,
          pageRects,
          guidesX: store.schema.guides.x,
          guidesY: store.schema.guides.y,
          otherNodes,
          getElementSize: node => store.getElementSize(node),
          enabled: true,
          gridSnap: snapState.gridSnap,
          guideSnap: snapState.guideSnap,
          elementSnap: snapState.elementSnap,
        }, {
          selectionBox,
          dx: rawDx,
          dy: rawDy,
          threshold: snapState.threshold / Math.max(zoom, 0.0001),
          precomputedCandidates: snapCandidates,
        })
    preview.replace((draft) => {
      for (const original of originals) {
        const node = requireDocumentNode(draft, store.materialProfile, original.id)
        node.x = original.x + delta.dx
        node.y = original.y + delta.dy
      }
    })
    store.snapActiveLines = markRaw(delta.lines)
  },
  onFinish: () => {
    store.snapActiveLines = []
  },
})
```

Import `requireDocumentNode` from `@easyink/core`. Resize calls the material adapter's `applyResize(draftNode, snapshot, params)` inside one `preview.replace()` so geometry and material-owned state are one private patch bundle; its stable operation uses field paths `['/x', '/y', '/width', '/height', '/model']`. Rotate uses `['/rotation']`; guide drag targets the stable `document` identity with `['/guides/x']` or `['/guides/y']`. Remove manual rollback, `MoveMaterialCommand`, `ResizeMaterialCommand`, `RotateMaterialCommand`, `UpdateGuidesCommand`, and local window pointer listener setup from these paths.

- [ ] **Step 4: Run all canvas interaction tests**

Run: `pnpm exec vitest run --dom packages/designer/src/composables/use-element-drag.test.ts packages/designer/src/composables/use-element-resize.test.ts packages/designer/src/interactions/canvas-interaction-controller.test.ts packages/designer/src/components/guide-overlay.test.ts`

Expected: PASS; each gesture creates zero or one document change set and cancel creates none.

- [ ] **Step 5: Commit**

```bash
git add packages/designer/src/composables/use-element-drag.ts packages/designer/src/composables/use-element-drag.test.ts packages/designer/src/composables/use-element-resize.ts packages/designer/src/composables/use-element-resize.test.ts packages/designer/src/composables/use-element-rotate.ts packages/designer/src/components/GuideOverlay.vue packages/designer/src/components/guide-overlay.test.ts
git commit -m "refactor(designer): preview canvas gestures immutably"
```

### Task 14: Property Preview Controller And Panel Integration

**Files:**
- Create: `packages/designer/src/editing/property-preview-controller.ts`
- Create: `packages/designer/src/editing/property-preview-controller.test.ts`
- Modify: `packages/designer/src/components/PropertiesPanel.vue`
- Create: `packages/designer/src/components/properties-panel.test.ts`
- Modify: `packages/core/src/preview-transaction.ts`
- Modify: `packages/core/src/preview-transaction.test.ts`
- Modify: `packages/core/src/material-extension.ts`
- Modify: `packages/core/src/material-facet-host.ts`

- [ ] **Step 1: Write failing property preview tests**

```ts
import { describe, expect, it } from 'vitest'
import { createModelPropertyAccessor } from '@easyink/core'
import type { PropertyDescriptor } from '@easyink/core'
import { createTestCompiledMaterialProfile } from '@easyink/core/testing'
import { DesignerStore } from '../store/designer-store'
import { PropertyPreviewController } from './property-preview-controller'

describe('PropertyPreviewController', () => {
  const descriptor: PropertyDescriptor<string> = {
    key: 'color', label: 'Color', type: 'color', accessor: createModelPropertyAccessor('/color'),
  }

  it('replaces through one active preview without nested replace and commits one history entry', () => {
    const profile = createTestCompiledMaterialProfile()
    const store = new DesignerStore({ profile, schema: {
      elements: [profile.createNode('box', { id: 'a', model: { color: 'red' } })],
    } })
    const controller = new PropertyPreviewController(store.documentTransactions)
    const context = { sessionPath: [], selectionLineage: 'selection-1' }
    controller.previewProperty('node:a:color', 'a', descriptor, 'blue', context)
    controller.previewProperty('node:a:color', 'a', descriptor, 'green', context)
    expect(store.schema.elements[0]!.model.color).toBe('green')
    expect(store.documentTransactions.totalCount).toBe(0)
    controller.commit('node:a:color')
    expect(store.documentTransactions.totalCount).toBe(1)
  })

  it('rejects an accessor that mutates outside its declared canonical paths', () => {
    const profile = createTestCompiledMaterialProfile()
    const store = new DesignerStore({ profile, schema: {
      elements: [profile.createNode('box', { id: 'a', x: 0, model: { color: 'red' } })],
    } })
    const controller = new PropertyPreviewController(store.documentTransactions)
    const invalid: PropertyDescriptor<string> = {
      ...descriptor,
      accessor: { paths: ['/model/color'], read: () => 'red', write: draft => { draft.x = 99 } },
    }
    expect(() => controller.previewProperty('node:a:color', 'a', invalid, 'blue', {
      sessionPath: [], selectionLineage: 'selection-1',
    })).toThrow(/outside declared property paths/)
    expect(store.schema.elements[0]!.x).toBe(0)
    expect(store.documentTransactions.totalCount).toBe(0)
    controller.cancelActive()
  })
})

it('resolves nested contextual descriptors without granting a material a writer', () => {
  const provider = vi.fn(({ selection }) => ({
    contextKey: 'cell-style',
    descriptors: [descriptor],
    values: { color: { kind: 'mixed' } },
    selection,
  }))
  const result = resolveContextualProperties(provider, frozenNode(), {
    sessionPath: ['node:table-1', 'table'], selection: { cellIds: ['c1', 'c2'] }, selectionLineage: 's1',
  })
  expect(result.values.color).toEqual({ kind: 'mixed' })
  expect(provider.mock.calls[0]![0]).not.toHaveProperty('transactions')
})
```

- [ ] **Step 2: Run the property controller test to verify it fails**

Run: `pnpm exec vitest run --dom packages/designer/src/editing/property-preview-controller.test.ts`

Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement the controller and replace panel snapshot maps**

```ts
import type {
  DocumentRecipe,
  DocumentTransactionEngine,
  DocumentTransactionOptions,
  PreviewTransaction,
  PropertyDescriptor,
} from '@easyink/core'
import { resolvePropertyAccessor } from '@easyink/core'

export interface PropertyPreviewContext {
  sessionPath: readonly string[]
  selectionLineage: string | null
}

// additions in packages/core/src/material-extension.ts
export interface MaterialContextualPropertyRequest {
  node: Readonly<MaterialNode>
  sessionPath: readonly string[]
  selection: JsonValue
  selectionLineage: string | null
}

export type ContextualPropertyValue
  = Readonly<{ kind: 'single', value: JsonValue }>
    | Readonly<{ kind: 'mixed' }>
    | Readonly<{ kind: 'unavailable', readOnly: true }>

export interface MaterialContextualPropertyResult {
  contextKey: string
  descriptors: readonly PropertyDescriptor[]
  values: Readonly<Record<string, ContextualPropertyValue>>
}

export type MaterialContextualPropertyProvider = (
  request: MaterialContextualPropertyRequest,
) => MaterialContextualPropertyResult

// MaterialDesignerFacet addition
contextualProperties?: MaterialContextualPropertyProvider

export class PropertyPreviewController {
  private active: { key: string, preview: PreviewTransaction } | null = null

  constructor(private readonly transactions: DocumentTransactionEngine) {}

  preview(key: string, options: DocumentTransactionOptions, recipe: DocumentRecipe): void {
    this.ensureActive(key, options).replace(recipe)
  }

  previewProperty<T>(
    key: string,
    nodeId: string,
    descriptor: PropertyDescriptor<T>,
    value: T,
    context: PropertyPreviewContext,
  ): void {
    const accessor = resolvePropertyAccessor(descriptor)
    const preview = this.ensureActive(key, {
      label: descriptor.label,
      mergeKey: `property:${nodeId}:${descriptor.key}`,
      operation: {
        kind: 'material.property',
        sessionPath: context.sessionPath,
        targetIds: [`node:${nodeId}`],
        fieldPaths: accessor.paths,
        selectionLineage: context.selectionLineage,
        structural: false,
      },
    })
    preview.replaceNode(nodeId, accessor.paths, draft => accessor.write(draft, value))
  }

  commit(key: string): void {
    if (this.active?.key !== key)
      return
    this.active.preview.commit()
    this.active = null
  }

  cancel(key: string): void {
    if (this.active?.key === key)
      this.cancelActive()
  }

  cancelActive(): void {
    this.active?.preview.cancel()
    this.active = null
  }

  private ensureActive(key: string, options: DocumentTransactionOptions): PreviewTransaction {
    if (this.active?.key !== key) {
      this.cancelActive()
      this.active = { key, preview: this.transactions.beginPreview(options) }
    }
    return this.active.preview
  }
}
```

In `packages/core/src/preview-transaction.ts`, replace the existing `replace()` body and add scoped node replacement plus these private helpers:

```ts
class PreviewMutationScopeError extends Error {
  constructor(nodeId: string, patchPath: readonly (string | number)[]) {
    super(`Property accessor for "${nodeId}" mutated outside declared property paths: /${patchPath.join('/')}`)
    this.name = 'PreviewMutationScopeError'
  }
}

replace(recipe: DocumentRecipe): void {
  this.replaceScoped(recipe)
}

replaceNode<TNode extends MaterialNode = MaterialNode>(
  nodeId: string,
  allowedPaths: readonly `/${string}`[],
  mutator: (draft: TNode) => void,
): void {
  this.replaceScoped(
    draft => mutator(this.baseIndex.resolveNode(draft, nodeId) as TNode),
    { nodeId, allowedPaths },
  )
}

private replaceScoped(
  recipe: DocumentRecipe,
  scope?: { nodeId: string, allowedPaths: readonly `/${string}`[] },
): void {
  this.assertOpen()
  const [next, forward, inverse] = create(this.base, recipe, { enablePatches: true, enableAutoFreeze: true })
  if (scope)
    assertNodePatchScope(this.base, scope.nodeId, scope.allowedPaths, [...forward, ...inverse])
  const report = this.publish({ document: next, forward, inverse })
  this.current = next
  this.forward = forward
  this.inverse = inverse
  this.report = report
}

function assertNodePatchScope(
  document: DocumentSchema,
  nodeId: string,
  allowedPaths: readonly `/${string}`[],
  patches: readonly Patch[],
): void {
  const nodePrefix = findCanonicalNodePath(document, nodeId)
  const allowed = allowedPaths.map(decodePointer)
  for (const patch of patches) {
    if (!startsWithPath(patch.path, nodePrefix))
      throw new PreviewMutationScopeError(nodeId, patch.path)
    const relative = patch.path.slice(nodePrefix.length)
    if (!allowed.some(path => startsWithPath(relative, path)))
      throw new PreviewMutationScopeError(nodeId, patch.path)
  }
}

function findCanonicalNodePath(document: DocumentSchema, nodeId: string): readonly (string | number)[] {
  const visit = (nodes: readonly MaterialNode[], prefix: readonly (string | number)[]): readonly (string | number)[] | null => {
    for (let index = 0; index < nodes.length; index++) {
      const node = nodes[index]!
      const nodePath = [...prefix, index]
      if (node.id === nodeId)
        return nodePath
      for (const [slot, children] of Object.entries(node.slots)) {
        const result = visit(children, [...nodePath, 'slots', slot])
        if (result)
          return result
      }
    }
    return null
  }
  const result = visit(document.elements, ['elements'])
  if (!result)
    throw new Error(`Document node "${nodeId}" not found`)
  return result
}

function decodePointer(pointer: `/${string}`): readonly string[] {
  return pointer.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function startsWithPath(path: readonly (string | number)[], prefix: readonly (string | number)[]): boolean {
  return path.length >= prefix.length && prefix.every((part, index) => String(path[index]) === String(part))
}
```

Keep `PreviewMutationScopeError` and raw patch paths private; `DocumentChangeSet` exposes only stable target IDs plus accessor-declared canonical pointers. The property controller calls `replaceNode()` directly after `ensureActive()`; it never calls `run()` from inside a `replace()` recipe.

Use one controller instance in `PropertiesPanel.vue`. Consume the foundation `PropertyDescriptor` list and call `resolvePropertyAccessor(descriptor)`; reads use `accessor.read(node)`, and continuous writes use `previewProperty()` with the active session path and selection lineage. Replace `pageSnapshots`, `propSnapshots`, and `geoSnapshots` plus direct `Object.assign`, path mutation, and `store.updateElement` calls. Page changes use `preview()` with an explicit document operation; node geometry uses a declared canonical path list. Font-load failure calls `cancel(key)`, blur/Enter calls `commit(key)`, and component unmount or selection/session change calls `cancelActive()`.

When the active Designer facet declares `contextualProperties`, invoke it through `MaterialFacetHost` with only a deeply frozen node, stable session path, recursively validated JSON selection, and lineage. Freeze/validate its result, require unique descriptor keys and exact accessor paths, and quarantine only that Designer surface on throw or malformed output. The provider receives no Vue component, store, transaction, DOM, clock, or network capability. `PropertiesPanel` renders the returned descriptors through the same `PropertyEditorRegistry`; writes still call `previewProperty`, whose patch-scope check proves the accessor touched only its declared paths. A selection/session/topology revision change cancels the active preview and recomputes the provider. Table cell/row/column/band and future chart-series properties use this path; no material-specific overlay or writer is allowed.

Do not add `PropSchema`, `read`, `commit`, or command-returning compatibility hooks: foundation has removed them. Custom material properties use the pure `PropertyAccessor.write(draft, value)` supplied by their `PropertyDescriptor`. Its canonical node-relative `paths` become the stable operation field paths without material-type branches. Lifecycle hooks such as font loading, `flushPendingEdits`, and session pop run outside recipes before commit.

- [ ] **Step 4: Run property and editor tests**

Run: `pnpm exec vitest run --dom packages/designer/src/editing/property-preview-controller.test.ts packages/designer/src/components/properties-panel.test.ts packages/designer/src/components/prop-schema-editor.test.ts`

Expected: PASS; continuous input has one undo entry, cancel restores committed state, and custom property writers stay material-owned.

- [ ] **Step 5: Commit**

```bash
git add packages/designer/src/editing/property-preview-controller.ts packages/designer/src/editing/property-preview-controller.test.ts packages/designer/src/components/PropertiesPanel.vue packages/designer/src/components/properties-panel.test.ts packages/core/src/preview-transaction.ts packages/core/src/preview-transaction.test.ts packages/core/src/material-extension.ts packages/core/src/material-facet-host.ts
git commit -m "refactor(designer): route property previews through transactions"
```

### Task 15: Migrate Remaining Document Writers And Enforce The Boundary

**Files:**
- Modify: `packages/designer/src/components/CanvasContextMenu.vue`
- Modify: `packages/designer/src/components/HistoryPanel.vue`
- Modify: `packages/designer/src/components/MaterialPanel.vue`
- Modify: `packages/designer/src/components/TopBarB.vue`
- Modify: `packages/designer/src/composables/use-datasource-drop.ts`
- Modify: `packages/designer/src/composables/use-designer-drag-drop.ts`
- Modify: `packages/designer/src/composables/use-keyboard-shortcuts.ts`
- Modify: `packages/designer/src/composables/use-material-drop.ts`
- Modify: `packages/designer/src/interactions/clipboard-actions.ts`
- Modify: `packages/designer/src/interactions/element-actions.ts`
- Modify: `packages/assistant/designer-bridge/src/apply.ts`
- Create: `packages/core/src/document-operations.ts`
- Create: `packages/core/src/document-operations.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/designer/src/store/document-writer-boundary.test.ts`
- Create: `packages/designer/src/components/document-action-components.test.ts`
- Modify: `packages/designer/src/composables/use-datasource-drop.test.ts`
- Modify: `packages/designer/src/composables/use-designer-drag-drop.test.ts`
- Modify: `packages/designer/src/composables/use-keyboard-shortcuts.test.ts`
- Create: `packages/designer/src/composables/use-material-drop.test.ts`
- Modify: `packages/designer/src/interactions/clipboard-actions.test.ts`
- Modify: `packages/designer/src/interactions/element-actions.test.ts`
- Modify: `packages/assistant/designer-bridge/src/apply.test.ts`

- [ ] **Step 1: Write the failing source-boundary and workflow tests**

```ts
// packages/core/src/document-operations.test.ts
import { describe, expect, it } from 'vitest'
import { createDefaultSchema } from '@easyink/schema'
import { createTestCompiledMaterialProfile } from './testing/material-profile'
import { removeDocumentNode } from './document-operations'

describe('removeDocumentNode', () => {
  it('removes a nested canonical slot node by stable ID', () => {
    const profile = createTestCompiledMaterialProfile()
    const child = profile.createNode('box', { id: 'child' })
    const owner = profile.createNode('container', { id: 'owner', slots: { content: [child] } })
    const document = { ...createDefaultSchema(), elements: [owner] }
    expect(removeDocumentNode(document, 'child')).toBe(child)
    expect(owner.slots.content).toEqual([])
  })
})
```

```ts
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function productionSources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory())
      return productionSources(path)
    return /\.(?:ts|vue)$/.test(entry.name) && !/\.(?:test|spec)\.ts$/.test(entry.name) ? [path] : []
  })
}

const designerRoot = resolve('packages/designer/src')
const productionFiles = [
  ...productionSources(designerRoot),
  resolve('packages/assistant/designer-bridge/src/apply.ts'),
]

describe('document writer boundary', () => {
  it.each(productionFiles)('%s does not mutate schema or use CommandManager', (file) => {
    const source = readFileSync(file, 'utf8')
    expect(source).not.toContain('store.commands')
    expect(source).not.toContain('CommandManager')
    expect(source).not.toMatch(/new\s+[A-Za-z_$][\w$]*Command\s*\(/)
    expect(source).not.toMatch(/\b[A-Za-z_$][\w$]*Command\.execute\s*\(/)
    expect(source).not.toMatch(/\bcommand\.execute\s*\(/i)
    expect(source).not.toContain('DOCUMENT_STORE_WRITER')
    expect(source).not.toMatch(/store\.schema(?:\.[A-Za-z_$][\w$]*)+\s*=/)
    expect(source).not.toMatch(/store\.schema(?:\.[A-Za-z_$][\w$]*)+\.(?:push|splice|pop|shift|unshift)\(/)
    expect(source).not.toMatch(/Object\.assign\(\s*store\.schema/)
    expect(source).not.toMatch(/setByPath\(\s*store\.schema/)
  })

  it('keeps the internal writer import inside store and transaction engine only', () => {
    const coreRoot = resolve('packages/core/src')
    const importers = productionSources(coreRoot)
      .filter(file => /from\s+['"]\.\/document-store-internal['"]/.test(readFileSync(file, 'utf8')))
      .map(file => relative(coreRoot, file).replaceAll('\\', '/'))
      .sort()
    expect(importers).toEqual(['document-store.ts', 'document-transaction-engine.ts'])
  })
})
```

Add workflow assertions to the existing clipboard, element actions, keyboard, datasource drop, and Designer drag/drop tests: each user action changes the immutable snapshot, creates exactly one history entry, and one undo restores the whole action.

- [ ] **Step 2: Run the boundary and workflow tests to verify they fail**

Run: `pnpm exec vitest run --dom packages/core/src/document-operations.test.ts packages/designer/src/store/document-writer-boundary.test.ts packages/designer/src/components/document-action-components.test.ts packages/designer/src/interactions/clipboard-actions.test.ts packages/designer/src/interactions/element-actions.test.ts packages/designer/src/composables/use-datasource-drop.test.ts packages/designer/src/composables/use-designer-drag-drop.test.ts packages/designer/src/composables/use-keyboard-shortcuts.test.ts packages/designer/src/composables/use-material-drop.test.ts packages/assistant/designer-bridge/src/apply.test.ts`

Expected: FAIL with current `store.commands` and direct schema mutation sites listed in the assertion output.

- [ ] **Step 3: Convert every remaining writer to document recipes**

Use one transaction for each user-visible action. The conversion pattern is:

```ts
store.documentTransactions.transact((draft) => {
  const node = requireDocumentNode(draft, store.materialProfile, nodeId)
  node.editorState = { ...node.editorState, hidden: true }
}, {
  label: 'Hide',
  operation: {
    kind: 'editor.visibility', sessionPath: [], targetIds: [`node:${nodeId}`], fieldPaths: ['/editorState/hidden'],
    selectionLineage: store.selection.lineageId, structural: false,
  },
})
```

Create the generic pure structural operation in `packages/core/src/document-operations.ts`:

```ts
import type { DocumentSchema, MaterialNode } from '@easyink/schema'

export function removeDocumentNode(document: DocumentSchema, nodeId: string): MaterialNode {
  const remove = (nodes: MaterialNode[]): MaterialNode | null => {
    const index = nodes.findIndex(node => node.id === nodeId)
    if (index >= 0)
      return nodes.splice(index, 1)[0]!
    for (const owner of nodes) {
      for (const children of Object.values(owner.slots)) {
        const removed = remove(children)
        if (removed)
          return removed
      }
    }
    return null
  }
  const removed = remove(document.elements)
  if (!removed)
    throw new Error(`Document node "${nodeId}" not found`)
  return removed
}
```

Use it from one structural transaction:

```ts
store.documentTransactions.transact((draft) => {
  removeDocumentNode(draft, nodeId)
}, {
  label: 'Delete',
  operation: {
    kind: 'structure.remove', sessionPath: [], targetIds: [`node:${nodeId}`], fieldPaths: ['/elements', '/slots'],
    selectionLineage: store.selection.lineageId, structural: true,
  },
})
```

For every old Command with nontrivial page/group/material logic, move its mutation algorithm into a named pure function that accepts the transaction draft and domain arguments; unit-test that function directly, then delete the Command closure after its last caller migrates. Never instantiate a Command or call `execute()` inside a recipe. Move selection updates, session exits, file picking, confirmations, font loading, and diagnostics outside recipes. `HistoryPanel` and TopBar undo/redo bind to `store.documentTransactions`. Assistant result application mutates one draft through a barriered `assistant.apply` operation rather than calling `setSchema()`, so it is undoable. Remove Designer's `commands` field after the last caller migrates.

- [ ] **Step 4: Run the complete editing test matrix and package checks**

Run: `pnpm exec vitest run --dom packages/core/src/document-*.test.ts packages/core/src/selection-region.test.ts packages/core/src/matrix-chain.test.ts packages/core/src/slot-reparent.test.ts packages/designer/src/editing/*.test.ts packages/designer/src/interactions/*.test.ts packages/designer/src/composables/use-element-*.test.ts packages/designer/src/composables/use-datasource-drop.test.ts packages/designer/src/composables/use-designer-drag-drop.test.ts packages/designer/src/composables/use-keyboard-shortcuts.test.ts packages/designer/src/composables/use-material-drop.test.ts packages/designer/src/components/document-action-components.test.ts packages/designer/src/components/properties-panel.test.ts packages/designer/src/store/document-writer-boundary.test.ts packages/assistant/designer-bridge/src/apply.test.ts`

Expected: PASS; no production Designer source writes through `store.schema` or `CommandManager`.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/document-operations.ts packages/core/src/document-operations.test.ts packages/core/src/index.ts packages/designer/src/components/CanvasContextMenu.vue packages/designer/src/components/HistoryPanel.vue packages/designer/src/components/MaterialPanel.vue packages/designer/src/components/TopBarB.vue packages/designer/src/components/document-action-components.test.ts packages/designer/src/composables/use-datasource-drop.ts packages/designer/src/composables/use-datasource-drop.test.ts packages/designer/src/composables/use-designer-drag-drop.ts packages/designer/src/composables/use-designer-drag-drop.test.ts packages/designer/src/composables/use-keyboard-shortcuts.ts packages/designer/src/composables/use-keyboard-shortcuts.test.ts packages/designer/src/composables/use-material-drop.ts packages/designer/src/composables/use-material-drop.test.ts packages/designer/src/interactions/clipboard-actions.ts packages/designer/src/interactions/clipboard-actions.test.ts packages/designer/src/interactions/element-actions.ts packages/designer/src/interactions/element-actions.test.ts packages/assistant/designer-bridge/src/apply.ts packages/assistant/designer-bridge/src/apply.test.ts packages/designer/src/store/document-writer-boundary.test.ts
git commit -m "refactor(designer): enforce the single document writer"
```

### Task 16: Final Verification And Single-Writer Contract Test

**Files:**
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/src/public-api.test.ts`
- Modify: `packages/designer/src/types.ts`
- Modify: `packages/designer/src/index.ts`
- Modify: `packages/designer/src/store/document-writer-boundary.test.ts`
- Test: all files created or modified in Tasks 1-15.

- [ ] **Step 1: Add a public-surface type test**

Create `packages/core/src/public-api.test.ts` with these runtime export checks and compile-time contract assertions:

```ts
import { describe, expect, it } from 'vitest'
import type {
  DocumentChangeSet,
  DocumentSlotPolicySnapshot,
  DocumentStoreEvent,
  DocumentSlotTarget,
  DocumentTransactionOptions,
  EditingSessionPath,
  SlotReparentPlan,
  SlotReparentPlanInput,
  SlotContentTransformSnapshot,
  SlotGeometrySidecarResolver,
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

void DocumentIndexSnapshot
void DocumentStore
void DocumentTransactionEngine
void PreviewTransaction
void combineStableOperationDescriptors
void createSlotReparentPlan
void reparentNode
type PublicContracts = DocumentChangeSet | DocumentStoreEvent | DocumentTransactionOptions | EditingSessionPath | SlotReparentPlan | SlotReparentPlanInput | StableIdSelectionRegion
const acceptsPublicContracts = (_value: PublicContracts): void => {}
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
  worldMatrix: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }, ownerRevision: 4, layoutRevision: 9,
}
const slotGeometryResolver: SlotGeometrySidecarResolver = {
  resolveSlotContentTransform: (_ownerNodeId, _slot, expectedNodeRevision) => ({
    ...slotGeometrySnapshot, ownerRevision: expectedNodeRevision,
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
```

Do not export `DOCUMENT_STORE_WRITER` or mutable patch arrays. Extend `packages/designer/src/store/document-writer-boundary.test.ts` with a final public-surface audit before cleaning the barrels:

```ts
it('does not expose a legacy document writer through public barrels', () => {
  const core = readFileSync(resolve('packages/core/src/index.ts'), 'utf8')
  expect(core).not.toMatch(/from\s+['"]\.\/(?:command|commands|patch-command)['"]/)
  expect(core).not.toMatch(/\b(?:CommandManager|PatchCommand|AddMaterialCommand|UpdateDocumentCommand)\b/)
  for (const file of [resolve('packages/designer/src/types.ts'), resolve('packages/designer/src/index.ts')]) {
    const source = readFileSync(file, 'utf8')
    expect(source).not.toMatch(/\b(?:CommandManager|PatchCommand|createTransactionService)\b/)
    expect(source).not.toMatch(/export[^\n]*\bcommands?\b/i)
  }
})
```

- [ ] **Step 2: Run the new final audits and verify they fail**

Run: `pnpm exec vitest run --dom packages/core/src/public-api.test.ts packages/designer/src/store/document-writer-boundary.test.ts`

Expected: FAIL because the new audit is present before `packages/designer/src/types.ts` and `packages/designer/src/index.ts` remove their residual writer exports, and/or because the final core stable exports are not complete yet.

- [ ] **Step 3: Remove residual writer exports and finalize stable barrels**

Remove only the obsolete public writer aliases/exports reported by Step 2. Export the stable transaction, three-value coordinate-space, and slot geometry sidecar contracts from `packages/core/src/index.ts`; keep Designer public types focused on immutable reads, transaction entry points, and layout-preview geometry service access. Do not retain deprecated aliases to make the audit pass indirectly.

Apply this exact barrel delta while preserving unrelated exports:

```ts
// packages/core/src/index.ts - add/retain these stable exports
export {
  canCoalesceDocumentChanges,
  combineStableOperationDescriptors,
  createDocumentChangeSet,
  mergeDocumentChangeSets,
} from './document-change-set'
export type { DocumentChangeSet, DocumentFieldPath, DocumentOperationDescriptor } from './document-change-set'
export { DocumentIndexSnapshot, DuplicateDocumentNodeIdError, requireDocumentNode } from './document-index'
export type { DocumentSlotPolicySnapshot } from './document-index'
export { DocumentStore } from './document-store'
export type { DocumentStoreEvent, DocumentStoreEventKind, DocumentStoreOptions } from './document-store'
export { DocumentTransactionEngine, DocumentValidationError } from './document-transaction-engine'
export type { DocumentRecipe, DocumentTransactionEngineOptions, DocumentTransactionOptions } from './document-transaction-engine'
export { PreviewTransaction } from './preview-transaction'
export {
  createSlotReparentPlan,
  reparentNode,
} from './slot-reparent'
export type {
  DocumentSlotAddress,
  DocumentSlotTarget,
  SlotContentTransformSnapshot,
  SlotGeometrySidecarResolver,
  SlotReparentOptions,
  SlotReparentPlan,
  SlotReparentPlanInput,
  StableSlotInsertionAnchor,
} from './slot-reparent'

// Delete the complete legacy barrel statements, not their implementation modules/tests yet:
// export { CommandManager, CompositeCommand, createBatchCommand } from './command'
// export type { Command, HistoryEntry } from './command'
// export { ... } from './commands'
// export { applyJsonPatches, PatchCommand } from './patch-command'
// export type { PatchCommandOptions } from './patch-command'

// packages/designer/src/types.ts - add stable read/transaction/layout-sidecar types to the existing @easyink/core export list
export type {
  DocumentChangeSet,
  DocumentOperationDescriptor,
  DocumentStoreEvent,
  DocumentTransactionOptions,
  EditingSessionPath,
  SlotContentTransformSnapshot,
  SlotGeometrySidecarResolver,
  SlotReparentPlanInput,
  StableIdSelectionRegion,
} from '@easyink/core'

// packages/designer/src/index.ts - these existing exports are sufficient after types.ts is updated
export { DesignerStore } from './store/designer-store'
export * from './types'
// Do not add CommandManager, PatchCommand, document Command, or history-writer aliases here.
```

- [ ] **Step 4: Run type scans and focused tests once more**

Run: `rg -n "coordinateSpace.*document.*owner" packages/core packages/designer packages/materials`

Expected: every coordinate-space type/branch includes `slot`; no local two-value union shadows `MaterialStructureSlot['coordinateSpace']`.

Run: `pnpm exec vitest run --dom packages/shared/src/json-value.test.ts packages/core/src/public-api.test.ts packages/core/src/document-index.test.ts packages/core/src/document-store.test.ts packages/core/src/document-change-set.test.ts packages/core/src/document-transaction-engine.test.ts packages/core/src/preview-transaction.test.ts packages/core/src/selection-region.test.ts packages/core/src/matrix-chain.test.ts packages/core/src/slot-reparent.test.ts packages/designer/src/editing/gesture-coordinator.test.ts packages/designer/src/editing/property-preview-controller.test.ts packages/designer/src/store/document-writer-boundary.test.ts`

Expected: PASS.

- [ ] **Step 5: Run build**

Run: `pnpm build`

Expected: exit code 0; `@easyink/shared`, `@easyink/core`, `@easyink/designer`, and dependent material/assistant packages build.

- [ ] **Step 6: Run lint and typecheck in repository order**

Run: `pnpm lint`

Expected: exit code 0 with no ESLint errors.

Run: `pnpm typecheck`

Expected: exit code 0 with no TypeScript or Vue type errors.

The final repository quality gate is strictly sequential: `pnpm build` -> `pnpm lint` -> `pnpm typecheck`. Do not reorder or parallelize these commands; stop and fix the first failing stage before continuing.

- [ ] **Step 7: Commit final exports and verification fixes**

```bash
git add packages/core/src/index.ts packages/core/src/public-api.test.ts packages/designer/src/types.ts packages/designer/src/index.ts packages/designer/src/store/document-writer-boundary.test.ts
git commit -m "test(editing): verify document transaction boundary"
```

## Non-Goals Enforced By This Plan

- No CRDT, OT, remote operation transform, vector clock, presence transport, or concurrent writer merge.
- No manifest compilation, schema adapter migration, or runtime material registration changes.
- No Viewer measurement, layout, pagination, rendering, or export changes.
- No table row/column/cell topology implementation; the table plan consumes `StableIdSelectionRegion`, `DocumentTransactionEngine`, and `PreviewTransaction`.
- No persistence of preview snapshots or editing-session paths into `DocumentSchema`.
