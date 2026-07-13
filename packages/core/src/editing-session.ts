import type { MaterialNode } from '@easyink/schema'
import type { BindingDisplayFormat, JsonValue, UnitType } from '@easyink/shared'
import type { DocumentChangeSet, DocumentOperationDescriptor } from './document-change-set'
import type { DocumentIndexSnapshot } from './document-index'
import type { Point, Rect } from './geometry'
import type { BindingExpression } from './material-binding'
import type { DatasourceFieldInfo, PropertyDescriptorLike } from './material-extension'

// ─── Selection ──────────────────────────────────────────────────────

/** Typed, JSON-safe selection within an editing session. */
export interface Selection<T extends JsonValue = JsonValue> {
  /** Selection type, namespaced by material type (e.g. 'table.cell', 'svg.anchor') */
  type: string
  /** Node ID of the material owning this selection */
  nodeId: string
  /** Type-safe payload (must be JSON-safe: no DOM refs, no functions, no class instances) */
  payload: T
  /** Optional anchor for range/multi selection */
  anchor?: T
}

/** Selection reconciliation with an explicit semantic-identity signal. */
export interface SelectionRebaseResult<T extends JsonValue = JsonValue> {
  selection: Selection<T> | null
  /** True when the returned coordinates identify a different logical entity. */
  identityChanged?: boolean
}

export interface SelectionInvalidation {
  reason: 'identity-changed'
}

// ─── SelectionType ──────────────────────────────────────────────────

/** Material registers selection types to declare sub-element selection semantics. */
export interface SelectionRebaseContext {
  changeSet: DocumentChangeSet
  before: DocumentIndexSnapshot
  after: DocumentIndexSnapshot
}

export interface SelectionType<T extends JsonValue = JsonValue> {
  /** Unique type name, must be prefixed with material type (e.g. 'table.cell') */
  id: string
  /** Derive a sub-property schema for the properties panel when this type is selected */
  getPropertySchema?: (sel: Selection<T>, node: MaterialNode) => SubPropertySchema | null
  /** Map a selection to screen rectangles (for overlay rendering) */
  resolveLocation: (sel: Selection<T>, node: MaterialNode) => Rect[]
  /** Validate payload shape (default: JSON round-trip check) */
  validate?: (payload: unknown) => payload is T
  /** Reconcile a selection against stable IDs after a document change. */
  rebase?: (selection: Selection<T>, context: SelectionRebaseContext) => Selection<T> | null
  /** @deprecated Property writers should express topology changes through document changes. */
  rebasePropertyChange?: (
    selection: Selection<T>,
    before: MaterialNode,
    after: MaterialNode,
    hint: unknown,
  ) => Selection<T> | SelectionRebaseResult<T> | null
}

// ─── MaterialGeometry ───────────────────────────────────────────────

/** Material implements geometry to describe its editing-time layout and hit-testing. */
export interface MaterialGeometry {
  /**
   * Overall editing-time layout of the material.
   * contentBox defaults to schema element dimensions. Materials may describe
   * internal viewports/scrolling here, but designer-only previews must not
   * enlarge the element footprint.
   */
  getContentLayout: (node: MaterialNode) => ContentLayout
  /** Map a selection to screen rectangles. Range selections return multiple rects. */
  resolveLocation: (selection: Selection, node: MaterialNode) => Rect[]
  /** Convert a local point to a selection candidate. Returns null if not hit. */
  hitTest: (point: Point, node: MaterialNode) => Selection | null
}

export interface ContentLayout {
  /** Total rectangle in document coordinates. */
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
  descriptors: PropertyDescriptorLike[]
  /** Read property value */
  read: (key: string) => unknown
  /** Write property value via transaction */
  write: (key: string, value: unknown, tx: TransactionAPI) => void
  /** Binding context */
  binding?: BindingExpression | null
  /** Clear binding via transaction */
  clearBinding?: (tx: TransactionAPI, port: string) => void
  /** Update binding display format via transaction */
  updateBindingFormat?: (tx: TransactionAPI, format: BindingDisplayFormat | undefined, port?: string) => void
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

/** Single-writer transaction API for validated document mutations. */
export interface TransactionAPI {
  /** Dynamic editing context captured when an operation descriptor is created. */
  getOperationContext: () => TransactionOperationContext
  /** Run a node mutation through the document transaction engine. */
  run: <TNode extends MaterialNode = MaterialNode, TResult = void>(nodeId: string, mutator: (draft: TNode) => TResult, options?: TxOptions) => TResult | void
  /** Batch multiple run() calls into one barriered DocumentChangeSet. */
  batch: <T>(fn: () => T) => T
}

export interface TransactionOperationContext {
  readonly sessionPath: readonly string[]
  readonly selectionLineage: string | null
}

export type TransactionOperationInput = Omit<DocumentOperationDescriptor, 'sessionPath' | 'selectionLineage'>

export function createTransactionOperationDescriptor(
  tx: TransactionAPI,
  input: TransactionOperationInput,
): DocumentOperationDescriptor {
  const context = tx.getOperationContext()
  return {
    ...input,
    sessionPath: context.sessionPath,
    selectionLineage: context.selectionLineage,
  }
}

export interface TxOptions {
  /** Continuous operations with same mergeKey are coalesced within mergeWindowMs. */
  mergeKey?: string
  /** Default 300ms */
  mergeWindowMs?: number
  /** Description for history panel */
  label?: string
  /** Stable operation metadata for history and integrations; patches remain authoritative for validation scope. */
  operation?: DocumentOperationDescriptor
}

// ─── SelectionStore ─────────────────────────────────────────────────

/** Reactive store for the current selection within an editing session. */
export interface SelectionStore {
  /** Current selection (reactive) */
  readonly selection: Selection | null
  /** Identity of the current logical selection across internal rebases. */
  readonly lineageId: string
  /** Set selection with JSON-safe validation */
  set: (selection: Selection | null) => void
  /** Reconcile the current selection after a committed document change. */
  rebase: <T extends JsonValue>(context: SelectionRebaseContext, type?: SelectionType<T>) => void
  /** Subscribe to selection changes. Optional for lightweight mocks. */
  onChange?: (listener: () => void) => () => void
}

// ─── GeometryService ────────────────────────────────────────────────

/** Framework-provided coordinate conversion service. */
export interface GeometryService {
  /** Current page geometry used by all screen/document conversions. */
  getPageGeometry: () => PageGeometrySnapshot
  /** Browser CSS pixels to schema document-unit coordinates. */
  screenToDocument: (px: Point) => Point
  /** Schema document-unit coordinates to browser CSS pixels. */
  documentToScreen: (pt: Point) => Point
  /** Document coordinates to material-local coordinates. Includes node transform by default. */
  documentToLocal: (pt: Point, node: MaterialNode, options?: LocalCoordinateOptions) => Point
  /** Material-local coordinates to document coordinates. Includes node transform by default. */
  localToDocument: (pt: Point, node: MaterialNode, options?: LocalCoordinateOptions) => Point
  /** Current selection rectangles (aggregated from resolveLocation + viewport clipping) */
  getSelectionRects: () => Rect[]
}

export interface PageGeometrySnapshot {
  /** Unscrolled page origin in browser CSS pixels. */
  pageOffset: Point
  /** Current visual zoom. */
  zoom: number
  /** Scroll offset of the viewport that observes the page. */
  scroll: Point
  /** Unit used by schema page, node coordinates, and node sizes. */
  documentUnit: UnitType
}

export interface LocalCoordinateOptions {
  /** Set false for axis-aligned document/local translation only. Defaults to true. */
  includeTransform?: boolean
}

// ─── EditingSessionRef ──────────────────────────────────────────────

/** Reference to an active editing session, exposed to decorations and toolbar. */
export interface EditingSessionPathEntry {
  readonly nodeId: string
  readonly parentNodeId: string | null
  readonly slot: string | null
}

export type EditingSessionPath = readonly EditingSessionPathEntry[]

export interface EditingSessionRef {
  /** Node ID of the material being edited */
  readonly nodeId: string
  /** Stable document-address path to the material being edited. */
  readonly path: EditingSessionPath
  /** Current selection */
  readonly selection: Selection | null
  /** Shared reactive metadata (for decoration <-> middleware communication) */
  readonly meta: Record<string, unknown>
  /** Dispatch a behavior event into the middleware chain */
  dispatch: (event: BehaviorEvent) => void
  /** Set a metadata value (reactive, triggers decoration updates) */
  setMeta: (key: string, value: unknown) => void
  /** Clear a metadata value and its selection scope, if any. */
  clearMeta: (key: string) => void
  /**
   * Store metadata that should be invalidated when the session selection
   * changes away from the selection that was current at write time.
   */
  setSelectionScopedMeta: (key: string, value: unknown, selection?: Selection | null) => void
  /** Reconcile the active selection after a topology-changing property write. */
  rebaseSelection: (before: MaterialNode, after: MaterialNode, rebase?: { type: string, hint: unknown }) => void
  /** Observe semantic selection invalidation before selection-scoped state is cleared. */
  onSelectionInvalidated?: (listener: (event: SelectionInvalidation) => void) => () => void
}
