import type { DocumentSchema } from '@easyink/schema'
import type { JsonValue, JsonValueValidationOptions } from '@easyink/shared'
import type { DocumentChangeSet } from './document-change-set'
import type { CompiledMaterialProfile } from './material-profile'
import type { MaterialDocumentValidationReport, MaterialNodeLoadState } from './schema-adapter'
import { assertJsonValue, cloneJsonValue } from '@easyink/shared'
import { DocumentIndexSnapshot } from './document-index'
import { DOCUMENT_STORE_WRITER } from './document-store-internal'
import { validateDocumentWithProfile } from './schema-adapter'

export type DocumentStoreEventKind = 'commit' | 'preview' | 'preview-cancel' | 'undo' | 'redo' | 'reset'

export interface DocumentStoreEvent {
  /** Monotonic write order for the lifetime of this store; reset never rewinds it. */
  readonly sequence: number
  kind: DocumentStoreEventKind
  previousDocument: DocumentSchema
  previousIndex: DocumentIndexSnapshot
  document: DocumentSchema
  index: DocumentIndexSnapshot
  validationReport?: MaterialDocumentValidationReport
  changeSet?: DocumentChangeSet
}

export type DocumentStoreWrite
  = | { kind: 'preview', document: DocumentSchema, index: DocumentIndexSnapshot }
    | { kind: 'preview-cancel' }
    | { kind: Exclude<DocumentStoreEventKind, 'preview' | 'preview-cancel' | 'reset'>, document: DocumentSchema, index: DocumentIndexSnapshot, validationReport: MaterialDocumentValidationReport, changeSet?: DocumentChangeSet }
    | { kind: 'reset', document: DocumentSchema, validationReport: MaterialDocumentValidationReport, changeSet?: DocumentChangeSet }

export interface DocumentStoreOptions {
  nodeStates?: ReadonlyMap<string, MaterialNodeLoadState>
  jsonValidation?: JsonValueValidationOptions
  onListenerError?: (error: unknown, event: DocumentStoreEvent) => void
}

export class DocumentStore {
  private committed: DocumentSchema
  private committedIndexValue: DocumentIndexSnapshot
  private preview: DocumentSchema | null = null
  private previewIndexValue: DocumentIndexSnapshot | null = null
  private materialNodeStatesValue: ReadonlyMap<string, MaterialNodeLoadState>
  private listeners = new Set<(event: DocumentStoreEvent) => void>()
  private readonly eventQueue: Array<{ event: DocumentStoreEvent, listeners: readonly ((event: DocumentStoreEvent) => void)[] }> = []
  private eventDispatchScheduled = false
  private readonly onListenerError?: (error: unknown, event: DocumentStoreEvent) => void
  private revisionValue = 0
  private eventSequenceValue = 0
  readonly jsonValidation: Readonly<JsonValueValidationOptions>

  constructor(initial: DocumentSchema, readonly profile: CompiledMaterialProfile, options: DocumentStoreOptions = {}) {
    this.jsonValidation = Object.freeze({ ...options.jsonValidation })
    this.onListenerError = options.onListenerError
    assertJsonValue(initial, this.jsonValidation)
    this.committed = freezeDocument(cloneJsonValue(initial, this.jsonValidation))
    const report = options.nodeStates
      ? validateDocumentWithProfile(this.committed, profile, { mode: 'history-restore', targetNodeStates: options.nodeStates })
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
  get eventSequence(): number { return this.eventSequenceValue }

  createIndex(document: DocumentSchema, revision: number): DocumentIndexSnapshot {
    return DocumentIndexSnapshot.build(document, this.profile, revision)
  }

  subscribe(listener: (event: DocumentStoreEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  [DOCUMENT_STORE_WRITER](write: DocumentStoreWrite): void {
    const committedWrite = write.kind !== 'preview' && write.kind !== 'preview-cancel'
    const previousDocument = committedWrite ? this.committed : this.document
    const previousIndex = committedWrite ? this.committedIndexValue : this.index
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
        ? freezeDocument(cloneJsonValue(write.document as unknown as JsonValue, this.jsonValidation) as unknown as DocumentSchema)
        : acceptFrozenCandidate(write.document)
      this.committedIndexValue = write.kind === 'reset'
        ? DocumentIndexSnapshot.build(this.committed, this.profile, 0)
        : write.index
      this.preview = null
      this.previewIndexValue = null
      this.materialNodeStatesValue = write.validationReport.nodeStates
    }
    const event: DocumentStoreEvent = {
      sequence: ++this.eventSequenceValue,
      kind: write.kind,
      previousDocument,
      previousIndex,
      document: this.document,
      index: this.index,
    }
    if ('validationReport' in write)
      event.validationReport = write.validationReport
    if ('changeSet' in write && write.changeSet)
      event.changeSet = write.changeSet
    Object.freeze(event)
    this.eventQueue.push({ event, listeners: [...this.listeners] })
    this.scheduleEventDispatch()
  }

  private scheduleEventDispatch(): void {
    if (this.eventDispatchScheduled)
      return
    this.eventDispatchScheduled = true
    queueMicrotask(() => this.dispatchEvents())
  }

  private dispatchEvents(): void {
    this.eventDispatchScheduled = false
    while (this.eventQueue.length > 0) {
      const entry = this.eventQueue.shift()!
      for (const listener of entry.listeners) {
        try {
          listener(entry.event)
        }
        catch (error) {
          try {
            this.onListenerError?.(error, entry.event)
          }
          catch { /* Error reporting must not affect other listeners. */ }
        }
      }
    }
  }
}

function freezeDocument<T extends object>(value: T): T {
  if (Object.isFrozen(value))
    return value
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
