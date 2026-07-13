import type { BehaviorEvent, DocumentIndexSnapshot, DocumentStoreEvent, EditingSessionPath, MaterialDesignerExtension, PropertyWriteResult } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import { shallowRef } from 'vue'
import { applySelectionIntent } from '../interactions/selection-intent'
import { EditingSession } from './editing-session'
import { createGeometryService } from './geometry-service'
import { createSelectionStore } from './selection-store'

const EMPTY_PATH: EditingSessionPath = Object.freeze([])

/** Owns the stable-ID editing stack and reconciles it after document history changes. */
export class EditingSessionManager {
  private _sessions = shallowRef<readonly EditingSession[]>(Object.freeze([]))
  private readonly _store: DesignerStore
  private readonly disposeDocumentSubscription: () => void
  private cancelActiveGesture?: () => void

  constructor(store: DesignerStore) {
    this._store = store
    this.disposeDocumentSubscription = store.documentStore.subscribe(event => this.rebaseDocumentSelection(event))
  }

  /** @deprecated Sessions are permanently bound to the raw DesignerStore. */
  setStore(_store: DesignerStore): void {}

  /** Temporary integration point until GestureCoordinator owns cancellation. */
  setCancelActiveGesture(cancel: (() => void) | undefined): void {
    this.cancelActiveGesture = cancel
  }

  get activeSession(): EditingSession | null {
    return this._sessions.value.at(-1) ?? null
  }

  get path(): EditingSessionPath {
    return this.activeSession?.path ?? EMPTY_PATH
  }

  get isActive(): boolean {
    return this._sessions.value.length > 0
  }

  get activeNodeId(): string | undefined {
    return this.activeSession?.nodeId
  }

  enter(nodeId: string, extension: MaterialDesignerExtension, initialPoint?: { x: number, y: number }): EditingSession | null {
    if (!extension.geometry || !this._store.documentStore.committedIndex.hasNode(nodeId))
      return null

    this.beforeTransition()
    this.destroySuffix(0)
    applySelectionIntent(this._store, { kind: 'collapse-to-session-owner', elementId: nodeId })
    const session = this.createSession(nodeId, extension, initialPoint)
    this._sessions.value = Object.freeze([session])
    return session
  }

  push(nodeId: string, extension: MaterialDesignerExtension, initialPoint?: { x: number, y: number }): EditingSession | null {
    const parent = this.activeSession
    const index = this._store.documentStore.committedIndex
    if (!parent || !extension.geometry || !index.hasNode(nodeId) || index.getParentNodeId(nodeId) !== parent.nodeId)
      return null

    this.beforeTransition()
    const session = this.createSession(nodeId, extension, initialPoint)
    this._sessions.value = Object.freeze([...this._sessions.value, session])
    return session
  }

  pop(): void {
    if (!this.isActive)
      return
    this.beforeTransition()
    this.destroySuffix(this._sessions.value.length - 1)
  }

  exitAll(): void {
    if (!this.isActive)
      return
    this.beforeTransition()
    this.destroySuffix(0)
  }

  /** @deprecated Use exitAll() for an explicit whole-stack transition. */
  exit(): void {
    this.exitAll()
  }

  dispatch(event: BehaviorEvent): void {
    this.activeSession?.dispatch(event)
  }

  rebaseSelection(before: MaterialNode, after: MaterialNode, result?: PropertyWriteResult | void): void {
    this.activeSession?.rebaseSelection(before, after, result?.selectionRebase)
  }

  rebaseDocumentSelection(event: DocumentStoreEvent): void {
    if (!['commit', 'undo', 'redo'].includes(event.kind) || !this.isActive)
      return

    const sessions = this._sessions.value
    let keep = 0
    for (let index = 0; index < sessions.length; index += 1) {
      const session = sessions[index]!
      if (!event.index.hasNode(session.nodeId))
        break
      if (index > 0 && event.index.getParentNodeId(session.nodeId) !== sessions[index - 1]!.nodeId)
        break
      keep += 1
    }
    if (keep < sessions.length)
      this.destroySuffix(keep)

    const survivors = this._sessions.value
    for (const session of survivors) {
      const selection = session.selectionStore.selection
      if (selection && event.changeSet) {
        const type = session.extension.selectionTypes?.find(candidate => candidate.id === selection.type)
        session.selectionStore.rebase({
          changeSet: event.changeSet,
          before: event.previousIndex,
          after: event.index,
        }, type)
      }
      session.updatePath(buildEditingSessionPath(event.index, session.nodeId))
    }
  }

  destroy(): void {
    this.disposeDocumentSubscription()
    this.destroySuffix(0)
    this.cancelActiveGesture = undefined
  }

  private beforeTransition(): void {
    this.cancelActiveGesture?.()
    this._store.documentTransactions.markHistoryBarrier()
  }

  private createSession(nodeId: string, extension: MaterialDesignerExtension, initialPoint?: { x: number, y: number }): EditingSession {
    const node = this._store.documentStore.committedIndex.getNode(nodeId)!
    const selectionStore = createSelectionStore(this._store.diagnostics)
    const geometry = createGeometryService(this._store)
    const session = new EditingSession({
      nodeId,
      path: buildEditingSessionPath(this._store.documentStore.committedIndex, nodeId),
      extension,
      selectionStore,
      geometry,
      materialGeometry: extension.geometry!,
      tx: this._store.documentTransactions,
      getNode: () => this._store.getElementById(nodeId),
      onEphemeralPanelChange: panel => this._store.setEphemeralPanel(panel),
      diagnostics: this._store.diagnostics,
    })
    if (initialPoint) {
      const localPoint = geometry.documentToLocal(initialPoint, node)
      const hit = extension.geometry!.hitTest(localPoint, node)
      if (hit)
        selectionStore.set(hit)
    }
    return session
  }

  private destroySuffix(from: number): void {
    const sessions = this._sessions.value
    for (let index = sessions.length - 1; index >= from; index -= 1)
      sessions[index]!.destroy()
    this._sessions.value = Object.freeze(sessions.slice(0, from))
    if (this._sessions.value.length === 0)
      this._store.setEphemeralPanel(null)
  }
}

function buildEditingSessionPath(index: DocumentIndexSnapshot, nodeId: string): EditingSessionPath {
  const address = index.getAddress(nodeId)
  if (!address)
    return EMPTY_PATH
  const ids = [...address.ancestors.map(entry => entry.ownerNodeId), nodeId]
  return Object.freeze(ids.map((id) => {
    const parent = index.getAddress(id)?.ancestors.at(-1)
    return Object.freeze({
      nodeId: id,
      parentNodeId: parent?.ownerNodeId ?? null,
      slot: parent?.slot ?? null,
    })
  }))
}
