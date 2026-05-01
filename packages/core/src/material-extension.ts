import type { BindingRef, DocumentSchema, MaterialNode } from '@easyink/schema'
import type { PropSchemaType } from '@easyink/shared'
import type { Command } from './command'
import type { BehaviorRegistration, EditingSessionRef, MaterialGeometry, SelectionDecorationDef, SelectionType, TransactionAPI } from './editing-session'

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

/**
 * Material designer extension contract.
 */
export interface MaterialDesignerExtension {
  /**
   * Mount content into the provided DOM container using the reactive NodeSignal.
   * Returns a cleanup function called when the element is removed from the canvas.
   */
  renderContent: (nodeSignal: NodeSignal, container: HTMLElement) => () => void
  /** Total visual height in the designer when the material renders virtual content beyond node.height (e.g. placeholder rows). */
  getVisualHeight?: (node: MaterialNode) => number
  /** Total visual width in the designer when it differs from `node.width` (rare, mirror of `getVisualHeight`). */
  getVisualWidth?: (node: MaterialNode) => number
  /**
   * Datasource drag-and-drop handler. Materials implement this to take over
   * dragOver detection and drop binding instead of the default BindFieldCommand.
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
  selectionTypes?: SelectionType<unknown>[]
  /** Behavior middleware chain (Koa-style). */
  behaviors?: BehaviorRegistration[]
  /** Selection decoration definitions (framework auto-renders). */
  decorations?: SelectionDecorationDef[]

  // ─── Resize Side-Effect Protocol ────────────────────────────────

  /**
   * Resize adapter: lets a material participate in element resize operations.
   * The framework drives the geometry; the adapter mutates material-private
   * data (e.g. table row heights) in lockstep, and produces an undo-safe
   * side-effect that bundles into ResizeMaterialCommand.
   */
  resize?: MaterialResizeAdapter
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
 *      mutation. The framework attaches it to ResizeMaterialCommand for
 *      undo-safe history; the adapter never hits ResizeMaterialCommand directly.
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
 * Side-effect bundled into ResizeMaterialCommand. `apply()` runs after the
 * geometry change in `execute`; `undo()` runs after geometry restore in `undo`.
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
  fieldLabel?: string
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
   * Called on drop. Material executes the actual binding command.
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

/** Context provided to material extension factories for querying state and issuing commands. */
export interface MaterialExtensionContext {
  getSchema: () => DocumentSchema
  getNode: (id: string) => MaterialNode | undefined
  getSelection: () => SelectionSnapshot
  getBindingLabel: (binding: BindingRef) => string
  commitCommand: (command: Command) => void
  /** Transaction API for draft-based mutations (generates PatchCommand). */
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
  ids: string[]
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
  /** Property schema declarations for the overlay */
  schemas: PropSchemaLike[]
  /** Read property value; panel calls this on each render */
  readValue: (key: string) => unknown
  /** Write property value; material handles command generation */
  writeValue: (key: string, value: unknown) => void
  /** Binding context: BindingRef = show, null = hide, undefined = default element binding */
  binding?: BindingRef | BindingRef[] | null
  /** Clear binding callback */
  clearBinding?: (bindIndex?: number) => void
  /** Custom editor component map: key = PropSchema.editor value, value = component */
  editors?: Record<string, unknown>
}

/**
 * Minimal PropSchema shape used in PropertyPanelOverlay to avoid circular dependency.
 * The actual PropSchema is defined in @easyink/designer; at runtime the same objects are passed.
 */
export interface PropSchemaLike {
  key: string
  label: string
  type: string
  group?: string
  default?: unknown
  enum?: Array<{ label: string, value: unknown }>
  min?: number
  max?: number
  step?: number
  editor?: string
  editorOptions?: Record<string, unknown>
  [extra: string]: unknown
}

// ─── Property Schema (canonical) ─────────────────────────────────

/**
 * Material property schema entry. Drives the PropertiesPanel form rendering
 * and (optionally) overrides the default node.props read/write path.
 *
 * Default behavior (no `read`/`commit`):
 *   - read:   `node.props[key]` (with dot-path support via getByPath)
 *   - commit: dispatches `UpdateMaterialPropsCommand({ [key]: value })`
 *
 * Materials whose property lives outside `node.props` (e.g. table-data's
 * `node.table.showHeader`) declare a custom `read` and `commit` to integrate
 * with the standard panel without leaking material types into PropertiesPanel.
 */
export interface PropSchema {
  key: string
  label: string
  type: PropSchemaType
  group?: string
  default?: unknown
  enum?: Array<{ label: string, value: unknown }>
  min?: number
  max?: number
  step?: number
  properties?: PropSchema[]
  items?: PropSchema
  visible?: (props: Record<string, unknown>) => boolean
  disabled?: (props: Record<string, unknown>) => boolean
  editor?: string
  editorOptions?: Record<string, unknown>
  /** Override default `node.props[key]` read. Returns the value to display. */
  read?: (node: MaterialNode) => unknown
  /**
   * Override default `UpdateMaterialPropsCommand` commit. Return the Command
   * to push into the history (or `null` to skip). Side-effects like
   * `flushPendingEdits()` / `editingSession.exit()` belong here.
   */
  commit?: (node: MaterialNode, value: unknown, ctx: PropCommitContext) => Command | null
}

/**
 * Context passed to `PropSchema.commit`. Provides hooks the panel cannot
 * reach without leaking material-specific knowledge.
 */
export interface PropCommitContext {
  /**
   * Force any in-progress inline editor (e.g. cell <textarea>) to commit its
   * value synchronously. Implementations typically blur `document.activeElement`.
   */
  flushPendingEdits: () => void
  /** Currently active editing session (or null if none). */
  activeEditingSession: EditingSessionRef | null
  /** Exit the active editing session, if any. */
  exitEditingSession: () => void
}

// (Old deep editing FSM protocol removed — replaced by Chapter 22 Editing Behavior Architecture)
