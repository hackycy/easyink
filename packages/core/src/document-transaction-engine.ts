import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { Patch } from 'mutative'
import type { DocumentChangeSet, DocumentOperationDescriptor } from './document-change-set'
import type { DocumentStore } from './document-store'
import type { TransactionAPI, TxOptions } from './editing-session'
import type { MaterialDocumentValidationReport, MaterialLoadDiagnostic, MaterialNodeLoadState } from './schema-adapter'
import { assertJsonValue, generateId } from '@easyink/shared'
import { apply, create, markSimpleObject } from 'mutative'
import { combineStableOperationDescriptors, createDocumentChangeSet, mergeDocumentChangeSets } from './document-change-set'
import { forkDocumentIndexSnapshot, requireDocumentNode } from './document-index'
import { DOCUMENT_STORE_WRITER } from './document-store-internal'
import { validateDocumentWithProfile } from './schema-adapter'

const DOCUMENT_MUTATIVE_MARK = markSimpleObject

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
      type: 'document-change' as const,
      description: entry.changeSet.label,
    }))
  }

  transact(recipe: DocumentRecipe, options: DocumentTransactionOptions): DocumentChangeSet | null {
    const [next, forward, inverse] = create(this.store.committedDocument, recipe, {
      enablePatches: true,
      enableAutoFreeze: true,
      mark: DOCUMENT_MUTATIVE_MARK,
    })
    if (forward.length === 0)
      return null
    return this.commitCandidate(next as unknown as DocumentSchema, forward, inverse, options)
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
      const entries = this.batchRecipes
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
      ? validateDocumentWithProfile(document, this.store.profile, { mode: 'history-restore', targetNodeStates: nodeStates })
      : validateDocumentWithProfile(document, this.store.profile, { affectedNodeIds: 'all' })
    assertValidReport(report)
    this.store[DOCUMENT_STORE_WRITER]({ kind: 'reset', document, validationReport: report })
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
