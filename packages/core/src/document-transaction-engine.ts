import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { Patch } from 'mutative'
import type { DocumentChangeSet, DocumentOperationDescriptor } from './document-change-set'
import type { PreviewValidationReport } from './document-preview-validation'
import type { DocumentStore } from './document-store'
import type { TransactionAPI, TransactionOperationContext, TxOptions } from './editing-session'
import type { PreviewCommitPayload, PreviewPublishPayload } from './preview-transaction'
import type { MaterialDocumentValidationReport, MaterialLoadDiagnostic, MaterialNodeLoadState } from './schema-adapter'
import { assertJsonValue, generateId } from '@easyink/shared'
import { apply, create, markSimpleObject } from 'mutative'
import { combineStableOperationDescriptors, createDocumentChangeSet, mergeDocumentChangeSets } from './document-change-set'
import { forkDocumentIndexSnapshot, requireDocumentNode } from './document-index'
import { assertPatchScopedJsonCandidate, RevisionPreviewValidationCache, validatePreviewWithProfile } from './document-preview-validation'
import { DOCUMENT_STORE_WRITER } from './document-store-internal'
import { PreviewTransaction } from './preview-transaction'
import { validateDocumentWithProfile } from './schema-adapter'

const DOCUMENT_MUTATIVE_MARK = markSimpleObject
const DOCUMENT_TRANSACTION_REENTRANT = 'DOCUMENT_TRANSACTION_REENTRANT'

class DocumentTransactionReentrancyError extends Error {
  readonly code = DOCUMENT_TRANSACTION_REENTRANT

  constructor() {
    super(`${DOCUMENT_TRANSACTION_REENTRANT}: document history mutation is already in progress`)
    this.name = 'DocumentTransactionReentrancyError'
  }
}

export type DocumentRecipe = (draft: DocumentSchema) => void | DocumentSchema

export interface DocumentTransactionOptions extends TxOptions {
  label: string
  operation: DocumentOperationDescriptor
}

export interface DocumentTransactionEngineOptions {
  now?: () => number
  createId?: () => string
  getOperationContext?: () => TransactionOperationContext
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
  private batchRecipes: Array<{
    recipe: DocumentRecipe
    options: DocumentTransactionOptions
    createsBarrier: boolean
  }> | null = null

  private activePreview: PreviewTransaction | null = null
  private readonly previewValidationCache = new RevisionPreviewValidationCache()

  private barrierGeneration = 0
  private previewDispatchDepth = 0
  private transactionDepth = 0
  private readonly now: () => number
  private readonly createId: () => string
  private readonly resolveOperationContext: () => TransactionOperationContext

  constructor(readonly store: DocumentStore, options: DocumentTransactionEngineOptions = {}) {
    this.now = options.now ?? Date.now
    this.createId = options.createId ?? (() => generateId('change'))
    this.resolveOperationContext = options.getOperationContext ?? (() => ({ sessionPath: [], selectionLineage: null }))
  }

  getOperationContext(): TransactionOperationContext {
    return this.resolveOperationContext()
  }

  get canUndo(): boolean { return this.undoStack.length > 0 }
  get canRedo(): boolean { return this.redoStack.length > 0 }
  get cursor(): number { return this.undoStack.length }
  get totalCount(): number { return this.undoStack.length + this.redoStack.length }
  get historyEntries() {
    return [...this.undoStack, ...[...this.redoStack].reverse()].map(entry => ({
      id: entry.changeSet.id,
      type: 'document-change' as const,
      description: entry.changeSet.label,
      operationKind: entry.changeSet.operation.kind,
    }))
  }

  transact(recipe: DocumentRecipe, options: DocumentTransactionOptions): DocumentChangeSet | null {
    this.assertNoActivePreview()
    this.assertHistoryMutationAllowed()
    return this.withTransactionGuard(() => {
      const [next, forward, inverse] = create(this.store.committedDocument, recipe, {
        enablePatches: true,
        enableAutoFreeze: true,
        mark: DOCUMENT_MUTATIVE_MARK,
      })
      if (forward.length === 0)
        return null
      return this.commitCandidate(next as unknown as DocumentSchema, forward, inverse, options)
    })
  }

  run<TNode extends MaterialNode = MaterialNode, TResult = void>(
    nodeId: string,
    mutator: (draft: TNode) => TResult,
    options?: TxOptions,
  ): TResult | void {
    if (this.transactionDepth > 0)
      throw new DocumentTransactionReentrancyError()
    const createsBarrier = !options?.operation
    const transactionOptions: DocumentTransactionOptions = {
      label: options?.label ?? 'Edit',
      mergeKey: options?.mergeKey,
      mergeWindowMs: options?.mergeWindowMs,
      operation: options?.operation ?? opaqueNodeOperation(nodeId),
    }
    let result: TResult | undefined
    const recipe: DocumentRecipe = (draft) => {
      result = mutator(requireDocumentNode(draft, this.store.profile, nodeId) as TNode)
    }
    if (this.batchRecipes) {
      this.batchRecipes.push({ recipe, options: transactionOptions, createsBarrier })
      return
    }
    this.transactWithOptionalBarrier(recipe, transactionOptions, createsBarrier)
    return result
  }

  batch<T>(fn: () => T): T {
    this.assertNoActivePreview()
    if (this.transactionDepth > 0)
      throw new DocumentTransactionReentrancyError()
    if (this.batchRecipes)
      return fn()
    this.batchRecipes = []
    try {
      const result = fn()
      const entries = this.batchRecipes
      this.batchRecipes = null
      if (entries.length > 0) {
        this.transactWithOptionalBarrier((draft) => {
          for (const entry of entries)
            entry.recipe(draft)
        }, {
          label: entries.at(-1)!.options.label,
          operation: combineStableOperationDescriptors('batch', entries.map(entry => entry.options.operation)),
        }, entries.some(entry => entry.createsBarrier))
      }
      return result
    }
    catch (error) {
      this.batchRecipes = null
      throw error
    }
  }

  undo(): void {
    this.assertNoActivePreview()
    this.assertHistoryMutationAllowed()
    this.withTransactionGuard(() => {
      this.barrierGeneration += 1
      this.applyHistory('undo')
    })
  }

  redo(): void {
    this.assertNoActivePreview()
    this.assertHistoryMutationAllowed()
    this.withTransactionGuard(() => {
      this.barrierGeneration += 1
      this.applyHistory('redo')
    })
  }

  markHistoryBarrier(): void {
    this.assertNoActivePreview()
    this.assertHistoryMutationAllowed()
    this.barrierGeneration += 1
  }

  goTo(index: number): void {
    this.assertNoActivePreview()
    this.assertHistoryMutationAllowed()
    if (!Number.isInteger(index) || index < 0 || index > this.totalCount)
      throw new RangeError(`History index ${index} is out of range`)
    this.withTransactionGuard(() => {
      while (this.cursor > index)
        this.applyHistory('undo')
      while (this.cursor < index)
        this.applyHistory('redo')
    })
  }

  clear(): void {
    this.assertNoActivePreview()
    this.assertHistoryMutationAllowed()
    this.withTransactionGuard(() => this.clearHistory())
  }

  private clearHistory(): void {
    this.undoStack = []
    this.redoStack = []
    this.notify()
  }

  reset(document: DocumentSchema, nodeStates?: ReadonlyMap<string, MaterialNodeLoadState>): void {
    this.assertNoActivePreview()
    this.assertHistoryMutationAllowed()
    this.withTransactionGuard(() => {
      assertJsonValue(document, this.store.jsonValidation)
      const report = nodeStates
        ? validateDocumentWithProfile(document, this.store.profile, { mode: 'history-restore', targetNodeStates: nodeStates })
        : validateDocumentWithProfile(document, this.store.profile, { affectedNodeIds: 'all' })
      assertValidReport(report)
      this.barrierGeneration += 1
      this.store[DOCUMENT_STORE_WRITER]({ kind: 'reset', document, validationReport: report })
      this.clearHistory()
    })
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  beginPreview(options: DocumentTransactionOptions): PreviewTransaction {
    this.assertNoActivePreview()
    this.assertHistoryMutationAllowed()
    this.barrierGeneration += 1
    const preview: PreviewTransaction = new PreviewTransaction(
      this.store.committedDocument,
      this.store.committedIndex,
      options,
      payload => this.publishPreview(preview, payload),
      payload => this.finalizePreview(preview, payload),
    )
    this.activePreview = preview
    return preview
  }

  private commitCandidate(
    next: DocumentSchema,
    forward: readonly Patch[],
    inverse: readonly Patch[],
    options: DocumentTransactionOptions,
  ): DocumentChangeSet {
    const beforeNodeStates = this.store.materialNodeStates
    const { nextIndex, affectedNodeIds, report } = this.validateCandidate(next, forward, inverse)
    const timestamp = this.now()
    const changeSet = createDocumentChangeSet({
      id: this.createId(),
      label: options.label,
      baseRevision: this.store.revision,
      committedRevision: this.store.revision + 1,
      startedAt: timestamp,
      updatedAt: timestamp,
      mergeKey: options.mergeKey,
      mergeWindowMs: options.mergeWindowMs ?? 300,
      barrierGeneration: this.barrierGeneration,
      affectedNodeIds,
      operation: options.operation,
    })
    this.store[DOCUMENT_STORE_WRITER]({
      kind: 'commit',
      document: next,
      index: nextIndex,
      changeSet,
      validationReport: report,
    })
    this.recordHistory({
      changeSet,
      forward: freezePatches(forward),
      inverse: freezePatches(inverse),
      beforeNodeStates,
      afterNodeStates: report.nodeStates,
    })
    this.redoStack = []
    this.notify()
    return changeSet
  }

  private publishPreview(owner: PreviewTransaction, payload: PreviewPublishPayload): PreviewValidationReport {
    this.assertNoPreviewDispatch()
    this.assertPreviewOwner(owner)
    assertPatchScopedJsonCandidate(payload.document, payload.forward, this.store.jsonValidation)
    const [analysisForward, analysisInverse] = normalizeAnalysisPatches(
      payload.forward,
      payload.inverse,
      this.store.committedDocument,
      payload.document,
    )
    const fork = forkDocumentIndexSnapshot(
      this.store.committedIndex,
      payload.document,
      this.store.profile,
      this.store.revision,
      analysisForward,
      analysisInverse,
    )
    this.previewValidationCache.reset(this.store.revision)
    this.previewDispatchDepth += 1
    let report: PreviewValidationReport
    try {
      report = validatePreviewWithProfile({
        document: payload.document,
        beforeIndex: this.store.committedIndex,
        index: fork.index,
        impact: fork.impact,
        profile: this.store.profile,
        baselineNodeStates: this.store.materialNodeStates,
        cache: this.previewValidationCache,
      })
    }
    finally {
      this.previewDispatchDepth -= 1
    }
    this.assertPreviewOwner(owner)
    if (!owner.isOpen)
      throw new Error('PreviewTransaction is closed')
    this.store[DOCUMENT_STORE_WRITER]({ kind: 'preview', document: payload.document, index: fork.index })
    return report
  }

  private finalizePreview(owner: PreviewTransaction, payload: PreviewCommitPayload | null): void {
    this.assertNoPreviewDispatch()
    this.assertPreviewOwner(owner)
    if (!payload) {
      this.activePreview = null
      this.store[DOCUMENT_STORE_WRITER]({ kind: 'preview-cancel' })
      return
    }
    this.withTransactionGuard(() => {
      const { nextIndex, affectedNodeIds, report } = this.validateCandidate(
        payload.document,
        payload.forward,
        payload.inverse,
      )
      const beforeNodeStates = this.store.materialNodeStates
      const timestamp = this.now()
      const changeSet = createDocumentChangeSet({
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
      const entry: DocumentHistoryEntry = {
        changeSet,
        forward: freezePatches(payload.forward),
        inverse: freezePatches(payload.inverse),
        beforeNodeStates,
        afterNodeStates: report.nodeStates,
      }
      this.store[DOCUMENT_STORE_WRITER]({
        kind: 'commit',
        document: payload.document,
        index: nextIndex,
        changeSet,
        validationReport: report,
      })
      this.recordHistory(entry)
      this.redoStack = []
      this.activePreview = null
      this.previewValidationCache.reset(this.store.revision)
      this.notify()
    })
  }

  private transactWithOptionalBarrier(
    recipe: DocumentRecipe,
    options: DocumentTransactionOptions,
    createsBarrier: boolean,
  ): DocumentChangeSet | null {
    const priorGeneration = this.barrierGeneration
    if (createsBarrier)
      this.barrierGeneration = priorGeneration + 1
    try {
      const changeSet = this.transact(recipe, options)
      if (!changeSet)
        this.barrierGeneration = priorGeneration
      return changeSet
    }
    catch (error) {
      this.barrierGeneration = priorGeneration
      throw error
    }
  }

  private assertHistoryMutationAllowed(): void {
    if (this.transactionDepth > 0 || this.batchRecipes)
      throw new DocumentTransactionReentrancyError()
  }

  private assertPreviewOwner(owner: PreviewTransaction): void {
    if (this.activePreview !== owner)
      throw new Error('PreviewTransaction is not owned by this engine')
  }

  private assertNoActivePreview(): void {
    this.assertNoPreviewDispatch()
    if (this.activePreview)
      throw new Error('A preview transaction is active')
  }

  private assertNoPreviewDispatch(): void {
    if (this.previewDispatchDepth > 0)
      throw new Error('Document mutation is not allowed during preview validation')
  }

  private withTransactionGuard<T>(fn: () => T): T {
    this.transactionDepth += 1
    try {
      return fn()
    }
    finally {
      this.transactionDepth -= 1
    }
  }

  private validateCandidate(next: DocumentSchema, forward: readonly Patch[], inverse: readonly Patch[]) {
    const [analysisForward, analysisInverse] = normalizeAnalysisPatches(
      forward,
      inverse,
      this.store.committedDocument,
      next,
    )
    const fork = forkDocumentIndexSnapshot(
      this.store.committedIndex,
      next,
      this.store.profile,
      this.store.revision + 1,
      analysisForward,
      analysisInverse,
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
    const before = this.store.committedDocument
    const next = apply<DocumentSchema, true>(before, patches as Patch[], {
      enableAutoFreeze: true,
      mark: DOCUMENT_MUTATIVE_MARK,
    }) as unknown as DocumentSchema
    assertJsonValue(next, this.store.jsonValidation)
    const report = validateDocumentWithProfile(next, this.store.profile, {
      mode: 'history-restore',
      targetNodeStates: direction === 'undo' ? entry.beforeNodeStates : entry.afterNodeStates,
    })
    assertValidReport(report)
    const oppositePatches = direction === 'undo' ? entry.forward : entry.inverse
    const [analysisPatches, analysisOppositePatches] = normalizeAnalysisPatches(
      patches,
      oppositePatches,
      before,
      next,
    )
    const index = forkDocumentIndexSnapshot(
      this.store.committedIndex,
      next,
      this.store.profile,
      this.store.revision + 1,
      analysisPatches,
      analysisOppositePatches,
    ).index
    this.store[DOCUMENT_STORE_WRITER]({
      kind: direction,
      document: next,
      index,
      changeSet: entry.changeSet,
      validationReport: report,
    })
    source.pop()
    destination.push(entry)
    this.notify()
  }

  private notify(): void {
    for (const listener of [...this.listeners]) {
      try {
        listener()
      }
      catch { /* Listener failures cannot roll back an already published transaction. */ }
    }
  }
}

function opaqueNodeOperation(nodeId: string): DocumentOperationDescriptor {
  return Object.freeze({
    kind: 'material.edit',
    sessionPath: Object.freeze([]),
    targetIds: Object.freeze([`node:${nodeId}`]),
    fieldPaths: Object.freeze([''] as const),
    selectionLineage: null,
    structural: false,
  })
}

function freezePatches(patches: readonly Patch[]): readonly Patch[] {
  return Object.freeze(patches.map(patch => Object.freeze({
    ...patch,
    path: Object.freeze([...patch.path]),
  }) as unknown as Patch))
}

function normalizeAnalysisPatches(
  forward: readonly Patch[],
  inverse: readonly Patch[],
  before: DocumentSchema,
  after: DocumentSchema,
): readonly [readonly Patch[], readonly Patch[]] {
  const arrayRoots = new Map<string, readonly (string | number)[]>()
  for (const patch of [...forward, ...inverse]) {
    const path = Array.isArray(patch.path) ? patch.path : []
    if (path.at(-1) !== 'length')
      continue
    const parentPath = path.slice(0, -1)
    if (isArrayAtPath(before, parentPath) || isArrayAtPath(after, parentPath))
      arrayRoots.set(JSON.stringify(parentPath), parentPath)
  }
  if (arrayRoots.size === 0)
    return [forward, inverse]
  return [
    collapseArrayMutationPatches(forward, arrayRoots, after),
    collapseArrayMutationPatches(inverse, arrayRoots, before),
  ]
}

function collapseArrayMutationPatches(
  patches: readonly Patch[],
  roots: ReadonlyMap<string, readonly (string | number)[]>,
  document: DocumentSchema,
): readonly Patch[] {
  const result = patches.filter((patch) => {
    const path = Array.isArray(patch.path) ? patch.path : []
    return ![...roots.values()].some(root => samePath(path.slice(0, -1), root)
      && (path.at(-1) === 'length' || typeof path.at(-1) === 'number'))
  })
  for (const root of roots.values())
    result.push({ op: 'replace', path: [...root], value: valueAtPath(document, root) })
  return result
}

function isArrayAtPath(root: unknown, path: readonly (string | number)[]): boolean {
  return Array.isArray(valueAtPath(root, path))
}

function valueAtPath(root: unknown, path: readonly (string | number)[]): unknown {
  let value = root
  for (const segment of path) {
    if (value === null || typeof value !== 'object')
      return undefined
    value = (value as Record<string | number, unknown>)[segment]
  }
  return value
}

function samePath(left: readonly (string | number)[], right: readonly (string | number)[]): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index])
}

function assertValidReport(report: MaterialDocumentValidationReport): void {
  if (!report.valid)
    throw new DocumentValidationError(report.diagnostics)
}
