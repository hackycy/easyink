import type { MaterialNode } from '@easyink/schema'
import type { Point, Rect } from './geometry'
import type { DatasourceFieldInfo, PropSchemaLike } from './material-extension'

// ─── Selection ──────────────────────────────────────────────────────

/** Typed, JSON-safe selection within an editing session. */
export interface Selection<T = unknown> {
  /** Selection type, namespaced by material type (e.g. 'table.cell', 'svg.anchor') */
  type: string
  /** Node ID of the material owning this selection */
  nodeId: string
  /** Type-safe payload (must be JSON-safe: no DOM refs, no functions, no class instances) */
  payload: T
  /** Optional anchor for range/multi selection */
  anchor?: T
}

// ─── SelectionType ──────────────────────────────────────────────────

/** Material registers selection types to declare sub-element selection semantics. */
export interface SelectionType<T = unknown> {
  /** Unique type name, must be prefixed with material type (e.g. 'table.cell') */
  id: string
  /** Derive a sub-property schema for the properties panel when this type is selected */
  getPropertySchema?: (sel: Selection<T>, node: MaterialNode) => SubPropertySchema | null
  /** Map a selection to screen rectangles (for overlay rendering) */
  resolveLocation: (sel: Selection<T>, node: MaterialNode) => Rect[]
  /** Validate payload shape (default: JSON round-trip check) */
  validate?: (payload: unknown) => payload is T
}

// ─── MaterialGeometry ───────────────────────────────────────────────

/** Material implements geometry to describe its editing-time layout and hit-testing. */
export interface MaterialGeometry {
  /**
   * Overall editing-time layout of the material.
   * contentBox may differ from node dimensions (e.g. placeholder rows in designer).
   */
  getContentLayout: (node: MaterialNode) => ContentLayout
  /** Map a selection to screen rectangles. Range selections return multiple rects. */
  resolveLocation: (selection: Selection, node: MaterialNode) => Rect[]
  /** Convert a local point to a selection candidate. Returns null if not hit. */
  hitTest: (point: Point, node: MaterialNode) => Selection | null
}

export interface ContentLayout {
  /** Total rectangle in canvas coordinates (may include virtual rows, etc.) */
  contentBox: Rect
  /** Visible sub-rectangle within contentBox (for clipping) */
  viewport?: Rect
  /** Internal scroll offset */
  scroll?: { x: number, y: number }
  /** Material's own CSS transform */
  transform?: { rotate?: number, scaleX?: number, scaleY?: number }
}

// ─── Behavior ───────────────────────────────────────────────────────

/** Koa-style behavior middleware. */
export type BehaviorMiddleware = (ctx: BehaviorContext, next: () => Promise<void>) => Promise<void>

export interface BehaviorContext {
  /** Input event */
  event: BehaviorEvent
  /** Current selection (may be null) */
  selection: Selection | null
  /** Current material node */
  node: MaterialNode
  /** Material's geometry implementation (hitTest, resolveLocation) */
  materialGeometry: MaterialGeometry
  /** Transaction API for mutations */
  tx: TransactionAPI
  /** Geometry service for coordinate conversion */
  geometry: GeometryService
  /** Selection store for reading/writing selection */
  selectionStore: SelectionStore
  /** Surfaces API for ephemeral panels */
  surfaces: SurfacesAPI
  /** Session reference for dispatch and meta access */
  session: EditingSessionRef
  /** Writable bag for cross-middleware communication within a single dispatch */
  meta: Record<string, unknown>
}

/** Input event union type for the behavior chain. */
export type BehaviorEvent
  = { kind: 'pointer-down', point: Point, originalEvent: PointerEvent }
    | { kind: 'pointer-move', point: Point, originalEvent: PointerEvent }
    | { kind: 'pointer-up', point: Point, originalEvent: PointerEvent }
    | { kind: 'key-down', key: string, originalEvent: KeyboardEvent }
    | { kind: 'paste', data: DataTransfer }
    | { kind: 'drop', field: DatasourceFieldInfo, point: Point }
    | { kind: 'command', command: string, payload?: unknown }

export interface BehaviorRegistration {
  id: string
  middleware: BehaviorMiddleware
  /** Only fire for these selection types (undefined = all) */
  selectionTypes?: string[]
  /** Only fire for these event kinds (undefined = all) */
  eventKinds?: BehaviorEvent['kind'][]
  /** Lower = earlier. Default 0. */
  priority?: number
}

// ─── Surfaces ───────────────────────────────────────────────────────

/** Declarative selection decoration rendered by the framework. */
export interface SelectionDecorationDef {
  /** Which selection types trigger this decoration */
  selectionTypes: string[]
  /** Vue component receiving { rects, selection, node, session } as props */
  component: unknown
  /** Rendering layer */
  layer?: 'below-content' | 'above-content' | 'above-handles'
}

/** Sub-property schema auto-derived from selection for the properties panel. */
export interface SubPropertySchema {
  title: string
  schemas: PropSchemaLike[]
  /** Read property value */
  read: (key: string) => unknown
  /** Write property value via transaction */
  write: (key: string, value: unknown, tx: TransactionAPI) => void
  /** Binding context */
  binding?: unknown | unknown[] | null
  /** Clear binding via transaction */
  clearBinding?: (tx: TransactionAPI, bindIndex?: number) => void
  /** Custom editor components */
  editors?: Record<string, unknown>
}

/** API for materials to push ephemeral panels. */
export interface SurfacesAPI {
  requestPanel: (panel: EphemeralPanelDef | null) => void
}

export interface EphemeralPanelDef {
  id: string
  title?: string
  position: { anchor: string, offset?: { x: number, y: number } }
  component: unknown
  props?: Record<string, unknown>
  onClose?: () => void
}

// ─── Transaction ────────────────────────────────────────────────────

/** Transaction API for draft-based mutations. */
export interface TransactionAPI {
  /** Run a mutation on a node. Generates patches and creates a PatchCommand. */
  run: (nodeId: string, mutator: (draft: MaterialNode) => void, options?: TxOptions) => void
  /** Batch multiple run() calls into a single Command. */
  batch: <T>(fn: () => T) => T
}

export interface TxOptions {
  /** Continuous operations with same mergeKey are coalesced within mergeWindowMs. */
  mergeKey?: string
  /** Default 300ms */
  mergeWindowMs?: number
  /** Description for history panel */
  label?: string
}

// ─── SelectionStore ─────────────────────────────────────────────────

/** Reactive store for the current selection within an editing session. */
export interface SelectionStore {
  /** Current selection (reactive) */
  readonly selection: Selection | null
  /** Set selection with JSON-safe validation */
  set: (selection: Selection | null) => void
}

// ─── GeometryService ────────────────────────────────────────────────

/** Framework-provided coordinate conversion service. */
export interface GeometryService {
  /** Screen pixels to canvas logical units */
  screenToCanvas: (px: { x: number, y: number }) => Point
  /** Canvas logical units to screen pixels */
  canvasToScreen: (pt: Point) => { x: number, y: number }
  /** Canvas coordinates to material-local coordinates */
  canvasToLocal: (pt: Point, node: MaterialNode) => Point
  /** Material-local coordinates to canvas coordinates */
  localToCanvas: (pt: Point, node: MaterialNode) => Point
  /** Current selection rectangles (aggregated from resolveLocation + viewport clipping) */
  getSelectionRects: () => Rect[]
}

// ─── EditingSessionRef ──────────────────────────────────────────────

/** Reference to an active editing session, exposed to decorations and toolbar. */
export interface EditingSessionRef {
  /** Node ID of the material being edited */
  readonly nodeId: string
  /** Current selection */
  readonly selection: Selection | null
  /** Shared reactive metadata (for decoration <-> middleware communication) */
  readonly meta: Record<string, unknown>
  /** Dispatch a behavior event into the middleware chain */
  dispatch: (event: BehaviorEvent) => void
  /** Set a metadata value (reactive, triggers decoration updates) */
  setMeta: (key: string, value: unknown) => void
}
