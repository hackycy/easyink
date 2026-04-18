import type {
  BehaviorEvent,
  BehaviorRegistration,
  EditingSessionRef,
  EphemeralPanelDef,
  GeometryService,
  MaterialDesignerExtension,
  MaterialGeometry,
  Selection,
  SelectionStore,
  SurfacesAPI,
  TransactionAPI,
} from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { reactive } from 'vue'
import { dispatchBehaviorEvent } from './behavior-dispatcher'

/**
 * Active editing session for a single material.
 * Holds all runtime state: selection, behavior chain, geometry, tx, surfaces.
 */
export class EditingSession implements EditingSessionRef {
  readonly nodeId: string
  readonly selectionStore: SelectionStore
  readonly geometry: GeometryService
  readonly materialGeometry: MaterialGeometry
  readonly tx: TransactionAPI
  readonly surfaces: SurfacesAPI
  /** Shared reactive metadata (Vue reactive for decoration/toolbar reactivity). */
  readonly meta: Record<string, unknown>
  readonly extension: MaterialDesignerExtension

  private behaviors: BehaviorRegistration[]
  private getNode: () => MaterialNode | undefined
  private _ephemeralPanel: EphemeralPanelDef | null = null
  private _onEphemeralPanelChange?: (panel: EphemeralPanelDef | null) => void

  constructor(opts: {
    nodeId: string
    extension: MaterialDesignerExtension
    selectionStore: SelectionStore
    geometry: GeometryService
    materialGeometry: MaterialGeometry
    tx: TransactionAPI
    getNode: () => MaterialNode | undefined
    onEphemeralPanelChange?: (panel: EphemeralPanelDef | null) => void
  }) {
    this.nodeId = opts.nodeId
    this.extension = opts.extension
    this.selectionStore = opts.selectionStore
    this.geometry = opts.geometry
    this.materialGeometry = opts.materialGeometry
    this.tx = opts.tx
    this.getNode = opts.getNode
    this.meta = reactive({})
    this.behaviors = opts.extension.behaviors ?? []
    this._onEphemeralPanelChange = opts.onEphemeralPanelChange

    this.surfaces = {
      requestPanel: (panel: EphemeralPanelDef | null) => {
        this._ephemeralPanel = panel
        this._onEphemeralPanelChange?.(panel)
      },
    }
  }

  get selection(): Selection | null {
    return this.selectionStore.selection
  }

  get ephemeralPanel(): EphemeralPanelDef | null {
    return this._ephemeralPanel
  }

  dispatch(event: BehaviorEvent): void {
    const node = this.getNode()
    if (!node)
      return

    dispatchBehaviorEvent(event, this.behaviors, {
      selection: this.selectionStore.selection,
      node,
      materialGeometry: this.materialGeometry,
      tx: this.tx,
      geometry: this.geometry,
      selectionStore: this.selectionStore,
      surfaces: this.surfaces,
      session: this,
    })
  }

  setMeta(key: string, value: unknown): void {
    this.meta[key] = value
  }

  destroy(): void {
    this.selectionStore.set(null)
    this._ephemeralPanel = null
    this._onEphemeralPanelChange?.(null)
  }
}
