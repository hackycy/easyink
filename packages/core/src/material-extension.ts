import type { BindingRef, DocumentSchema, MaterialNode } from '@easyink/schema'
import type { BindingDisplayFormat, JsonValue } from '@easyink/shared'
import type { BehaviorRegistration, MaterialGeometry, SelectionDecorationDef, SelectionType, TransactionAPI } from './editing-session'
import type { BindingExpression } from './material-binding'
import type { PropertyAccessor, PropertyEditorOptions } from './material-properties'

// ─── Material Extensions ───────────────────────────────────────────

export interface ToolbarAction {
  id: string
  label: string
  icon?: string
  disabled?: boolean
}

export interface ContextAction {
  id: string
  label: string
  icon?: string
  disabled?: boolean
  destructive?: boolean
}

/**
 * Framework-agnostic reactive node signal.
 * Designer wraps Vue computed into this interface; extension code does not depend on Vue.
 */
export interface NodeSignal {
  /** Get current node snapshot */
  get: () => MaterialNode
  /** Subscribe to node changes, returns unsubscribe function */
  subscribe: (callback: (node: MaterialNode) => void) => () => void
}

export interface MaterialDesignerRenderPageContext {
  /** Zero-based output page index in the current Designer surface. */
  pageIndex: number
  /** One-based output page number for direct display. */
  pageNumber: number
  totalPages: number
}

export interface MaterialDesignerRenderContext {
  page?: MaterialDesignerRenderPageContext
}

export interface MaterialDesignerRenderContextSignal {
  get: () => MaterialDesignerRenderContext
  subscribe: (callback: (context: MaterialDesignerRenderContext) => void) => () => void
}

/**
 * Material designer extension contract.
 */
export interface MaterialDesignerExtension {
  /** Releases extension-owned resources when its manifest facet is deactivated. */
  dispose?: () => void | Promise<void>
  /**
   * Mount content into the provided DOM container using the reactive NodeSignal.
   * Returns a cleanup function called when the element is removed from the canvas.
   */
  renderContent: (
    nodeSignal: NodeSignal,
    container: HTMLElement,
    renderContextSignal?: MaterialDesignerRenderContextSignal,
  ) => () => void
  /**
   * Datasource drag-and-drop handler. Materials implement this to take over
   * dragOver detection and drop binding instead of the default binding transaction.
   * When absent, the designer falls back to default behavior (whole element as drop zone).
   */
  datasourceDrop?: DatasourceDropHandler

  // ─── Editing Behavior Protocol (Chapter 22) ─────────────────────

  // Entry trigger is unified to dblclick. The previous `enterTrigger` field
  // (with a 'click' value for tables) was removed because the resulting
  // "pointerdown enters editing" path stole the first gesture from canvas
  // selection/drag, breaking parity with non-table materials and producing
  // the bug class called out in audit/202605011431.md item 1.

  /** Geometry protocol: material declares hit-test, layout, and selection-to-rect mapping. */
  geometry?: MaterialGeometry
  /** Selection types this material supports (e.g. 'table.cell'). */
  selectionTypes?: SelectionType<JsonValue>[]
  /** Behavior middleware chain (Koa-style). */
  behaviors?: BehaviorRegistration[]
  /** Selection decoration definitions (framework auto-renders). */
  decorations?: SelectionDecorationDef[]

  // ─── Resize Side-Effect Protocol ────────────────────────────────

  /**
   * Resize adapter: lets a material participate in element resize operations.
   * The framework drives the geometry; the adapter mutates material-private
   * data (e.g. table row heights) in lockstep, and produces an undo-safe
   * side-effect that participates in the same resize transaction.
   */
  resize?: MaterialResizeAdapter

  /**
   * Dynamic design-time control policy. Materials use this to declare that
   * some outer geometry controls, resize handles, or property fields are
   * unavailable for the current node state (for example runtime-measured
   * repeat rows whose height is content-owned).
   */
  resolveControlPolicy?: (node: MaterialNode, context: MaterialControlPolicyContext) => MaterialControlPolicy
}

// ─── Design-Time Control Policy ─────────────────────────────────

export type MaterialControlStateKind = 'enabled' | 'disabled' | 'hidden'

export interface MaterialControlState {
  state: MaterialControlStateKind
  reason?: string
}

export type MaterialGeometryControlKey = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'alpha'

export type MaterialResizeHandle
  = 'nw' | 'n' | 'ne'
    | 'w' | 'e'
    | 'sw' | 's' | 'se'

export interface MaterialResizeControlPolicy {
  width?: MaterialControlState
  height?: MaterialControlState
  handles?: Partial<Record<MaterialResizeHandle, MaterialControlState>>
}

export interface MaterialPropsControlPolicy {
  fields?: Partial<Record<string, MaterialControlState>>
  groups?: Partial<Record<string, MaterialControlState>>
}

export interface MaterialControlPolicy {
  geometry?: Partial<Record<MaterialGeometryControlKey, MaterialControlState>>
  resize?: MaterialResizeControlPolicy
  props?: MaterialPropsControlPolicy
}

export interface MaterialControlPolicyContext {
  getSchema: () => DocumentSchema
  t: (key: string) => string
}

// ─── Resize Adapter Protocol ─────────────────────────────────────

/**
 * Adapter that lets a material participate in resize operations.
 *
 * Lifecycle:
 *   1. designer captures `snapshot = beginResize(node)` at pointerdown.
 *   2. on each pointermove, designer calls `applyResize(node, snapshot, params)`
 *      after updating node x/y/w/h. The adapter mutates material-private
 *      fields proportionally.
 *   3. at pointerup, designer calls `commitResize(node, snapshot)` which returns
 *      a `MaterialResizeSideEffect` describing how to re-apply / revert the
 *      mutation. The framework records it with the resize transaction for
 *      undo-safe history; the adapter never writes document state directly.
 *
 * Snapshot is typed `unknown` to keep the framework material-agnostic — each
 * adapter narrows it internally.
 */
export interface MaterialResizeAdapter {
  beginResize: (node: MaterialNode) => unknown
  applyResize: (node: MaterialNode, snapshot: unknown, params: MaterialResizeParams) => void
  commitResize: (node: MaterialNode, snapshot: unknown) => MaterialResizeSideEffect | null
}

export interface MaterialResizeParams {
  originalWidth: number
  originalHeight: number
  newWidth: number
  newHeight: number
}

/**
 * Side-effect recorded with a resize transaction. `apply()` runs after the
 * geometry change; `undo()` runs after geometry restoration.
 * Both must be deterministic and self-contained.
 */
export interface MaterialResizeSideEffect {
  apply: (node: MaterialNode) => void
  undo: (node: MaterialNode) => void
}

// ─── Datasource Drop Protocol ────────────────────────────────────

/** Information about the field being dragged from the DataSourcePanel. */
export interface DatasourceFieldInfo {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldTag?: string
  fieldLabel?: string
  format?: BindingDisplayFormat
  use?: string
}

/**
 * Drop zone descriptor returned by onDragOver.
 * Designer uses this to render unified visual feedback.
 */
export interface DatasourceDropZone {
  /** 'accepted' = green highlight, 'rejected' = red forbidden marker */
  status: 'accepted' | 'rejected'
  /** Highlight rectangle in material-local coordinates (relative to element top-left) */
  rect: { x: number, y: number, w: number, h: number }
  /** Optional hint text (field name, reject reason, etc.) */
  label?: string
}

/**
 * Handler that materials implement to control datasource drag-and-drop behavior.
 * Designer calls onDragOver during hover to get visual feedback data,
 * and onDrop when the user releases the mouse to execute the actual binding.
 */
export interface DatasourceDropHandler {
  /**
   * Called on dragOver. Material computes the drop zone and returns a descriptor.
   * @param field - The datasource field being dragged
   * @param point - Cursor position in material-local coordinates (relative to element top-left)
   * @param point.x - Horizontal offset in material-local coordinates
   * @param point.y - Vertical offset in material-local coordinates
   * @param node - Current material node
   * @returns Drop zone descriptor, or null if this point does not accept a drop
   */
  onDragOver: (
    field: DatasourceFieldInfo,
    point: { x: number, y: number },
    node: MaterialNode,
  ) => DatasourceDropZone | null

  /**
   * Called on drop. Material executes the actual binding transaction.
   * @param field - The datasource field being dropped
   * @param point - Drop position in material-local coordinates
   * @param point.x - Horizontal offset in material-local coordinates
   * @param point.y - Vertical offset in material-local coordinates
   * @param node - Current material node
   */
  onDrop: (
    field: DatasourceFieldInfo,
    point: { x: number, y: number },
    node: MaterialNode,
  ) => void
}

/** Factory that receives a context and returns a material extension instance. */
export type MaterialExtensionFactory = (context: MaterialExtensionContext) => MaterialDesignerExtension

/** Async designer factory loader. Used by heavyweight materials in Designer only. */
export type LazyMaterialExtensionFactory = () => Promise<MaterialExtensionFactory>

/** Context provided to material extension factories for querying state and writing through transactions. */
export interface MaterialExtensionContext {
  getSchema: () => DocumentSchema
  getNode: (id: string) => MaterialNode | undefined
  getSelection: () => SelectionSnapshot
  getBindingLabel: (binding: BindingRef) => string
  /** Transaction API for draft-based immutable document mutations. */
  tx: TransactionAPI
  requestPropertyPanel: (overlay: PropertyPanelOverlay | null) => void
  emit: (event: string, payload: unknown) => void
  on: (event: string, handler: (...args: unknown[]) => void) => () => void
  /** Current viewport zoom level (1 = 100%). */
  getZoom: () => number
  /** DOM element of the page canvas, used for coordinate conversion. */
  getPageEl: () => HTMLElement | null
  /** Translate an i18n key to the current locale. */
  t: (key: string) => string
}

export interface SelectionSnapshot {
  ids: readonly string[]
  count: number
  isEmpty: boolean
}

export interface PropertyPanelRequest {
  type: string
  nodeId: string
  phase?: string
}

/**
 * Overlay descriptor pushed by materials via `requestPropertyPanel`.
 * The properties panel renders this as an additional section below base-layer schemas.
 */
export interface PropertyPanelOverlay {
  /** Overlay id (same id = update, different id = replace) */
  id: string
  /** Section header title */
  title?: string
  /** Property declarations for the overlay */
  descriptors: PropertyDescriptorLike[]
  /** Read property value; panel calls this on each render */
  readValue: (key: string) => unknown
  /** Write property value; material handles the transaction mutation. */
  writeValue: (key: string, value: unknown) => void
  /** Binding context: BindingExpression = show, null = hide, undefined = default element binding */
  binding?: BindingExpression | null
  /** Clear a canonical binding port. */
  clearBinding?: (port: string) => void
  /** Custom editor component map: key = PropertyDescriptor.editor value, value = component */
  editors?: Record<string, unknown>
}

/**
 * Minimal property descriptor shape used in PropertyPanelOverlay to avoid pulling designer-only
 * schema registries into core. At runtime the same objects are passed.
 */
export interface PropertyDescriptorLike {
  key: string
  label: string
  type: string
  group?: string
  default?: unknown
  enum?: Array<{ label: string, value: unknown }>
  min?: number
  max?: number
  step?: number
  /** Preserve null for empty numeric input instead of coercing to 0/default. */
  nullable?: boolean
  editor?: string
  editorOptions?: PropertyEditorOptions
  visible?: (model: Readonly<Record<string, unknown>>) => boolean
  disabled?: (model: Readonly<Record<string, unknown>>) => boolean
  accessor?: PropertyAccessor
}

export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T : T extends readonly (infer U)[] ? readonly DeepReadonly<U>[] : T extends object ? { readonly [K in keyof T]: DeepReadonly<T[K]> } : T

export interface MaterialContextualPropertiesRequest {
  readonly node: DeepReadonly<MaterialNode>
  readonly sessionPath: readonly string[]
  readonly selection: DeepReadonly<JsonValue> | null
  readonly lineage: string | null
}

export type MaterialContextualValue
  = | { readonly kind: 'single', readonly value: JsonValue }
    | { readonly kind: 'mixed' }
    | { readonly kind: 'unavailable', readonly readOnly: true, readonly reason?: string }

export interface MaterialContextualPropertiesResult {
  readonly contextKey: string
  readonly descriptors: readonly import('./material-properties').PropertyDescriptor[]
  readonly values: Readonly<Record<string, MaterialContextualValue>>
}

export type MaterialContextualPropertiesProvider = (
  request: MaterialContextualPropertiesRequest,
) => MaterialContextualPropertiesResult | null | Promise<MaterialContextualPropertiesResult | null>

/** Framework-neutral Designer facet activated from a material manifest. */
export interface MaterialDesignerFacet {
  extension: MaterialDesignerExtension
  catalog: { group: string, order: number }
  localeMessages?: {
    messages?: Record<string, unknown>
    locales?: Record<string, Record<string, unknown>>
  }
  dispose?: () => void | Promise<void>
  contextualProperties?: MaterialContextualPropertiesProvider
}

// (Old deep editing FSM protocol removed — replaced by Chapter 22 Editing Behavior Architecture)
