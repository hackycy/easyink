import type { BehaviorEvent, MaterialDesignerExtension } from '@easyink/core'
import type { DesignerStore } from '../store/designer-store'
import { shallowRef } from 'vue'
import { applySelectionIntent } from '../interactions/selection-intent'
import { EditingSession } from './editing-session'
import { createGeometryService } from './geometry-service'
import { createSelectionStore } from './selection-store'
import { createTransactionService } from './transaction-service'

/**
 * Manages the lifecycle of editing sessions.
 * Enforces mutual exclusion: at most one session active at a time.
 *
 * `_activeSession` is a Vue shallowRef so that consumers (SelectionOverlay,
 * PropertiesPanel, EphemeralPanelHost, …) re-render when the session enters
 * or exits.
 */
export class EditingSessionManager {
  private _activeSession = shallowRef<EditingSession | null>(null)
  private _store: DesignerStore

  constructor(store: DesignerStore) {
    this._store = store
  }

  /**
   * Re-target the manager at a different store reference (typically the
   * Vue reactive proxy of the same DesignerStore instance). Required so
   * that mutations through the EditingSession's TransactionAPI go through
   * the reactive proxy and trigger Vue re-renders.
   */
  setStore(store: DesignerStore): void {
    this._store = store
  }

  get activeSession(): EditingSession | null {
    return this._activeSession.value
  }

  get isActive(): boolean {
    return this._activeSession.value !== null
  }

  get activeNodeId(): string | undefined {
    return this._activeSession.value?.nodeId
  }

  /**
   * Enter an editing session for a material node.
   * Exits any existing session first (mutual exclusion).
   * Returns the initial Selection from hitTest if a point is provided.
   */
  enter(nodeId: string, extension: MaterialDesignerExtension, initialPoint?: { x: number, y: number }): EditingSession | null {
    if (!extension.geometry)
      return null

    const node = this._store.getElementById(nodeId)
    if (!node)
      return null

    // Exit any active session
    if (this._activeSession.value) {
      this.exit()
    }

    // Editing-session and multi-selection are mutually exclusive (see
    // 22-editing-behavior.md \u00a722.0). Route through SelectionIntent so the
    // rule is enforced in one place \u2014 not duplicated as `clear() + add()`
    // across every site that opens a session.
    applySelectionIntent(this._store, { kind: 'collapse-to-session-owner', elementId: nodeId })

    const selectionStore = createSelectionStore(this._store.diagnostics)
    const geometry = createGeometryService(this._store)
    const tx = createTransactionService(
      id => this._store.getElementById(id),
      this._store.commands,
      this._store.diagnostics,
    )

    const session = new EditingSession({
      nodeId,
      extension,
      selectionStore,
      geometry,
      materialGeometry: extension.geometry,
      tx,
      getNode: () => this._store.getElementById(nodeId),
      onEphemeralPanelChange: (panel) => {
        // Notify store for rendering
        this._store.setEphemeralPanel(panel)
      },
      diagnostics: this._store.diagnostics,
    })

    this._activeSession.value = session

    // If an initial point is provided, hitTest to set initial selection
    if (initialPoint && extension.geometry) {
      const localPoint = geometry.canvasToLocal(initialPoint, node)
      const hit = extension.geometry.hitTest(localPoint, node)
      if (hit) {
        selectionStore.set(hit)
      }
    }

    return session
  }

  /** Exit the active editing session. */
  exit(): void {
    if (!this._activeSession.value)
      return

    this._activeSession.value.destroy()
    this._activeSession.value = null
    this._store.setEphemeralPanel(null)
  }

  /** Dispatch a behavior event to the active session. */
  dispatch(event: BehaviorEvent): void {
    if (!this._activeSession.value)
      return
    this._activeSession.value.dispatch(event)
  }
}
