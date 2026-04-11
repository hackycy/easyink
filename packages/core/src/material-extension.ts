import type { BindingRef, DocumentSchema, MaterialNode } from '@easyink/schema'
import type { Command } from './command'

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
 * Material designer extension contract: imperative DOM rendering + declarative FSM deep editing.
 */
export interface MaterialDesignerExtension {
  /**
   * Mount content into the provided DOM container using the reactive NodeSignal.
   * Returns a cleanup function called when the element is removed from the canvas.
   */
  renderContent: (nodeSignal: NodeSignal, container: HTMLElement) => () => void
  /** Declarative FSM for deep editing (optional, only complex materials) */
  deepEditing?: DeepEditingDefinition
  /** Total visual height in the designer when the material renders virtual content beyond node.height (e.g. placeholder rows). */
  getVisualHeight?: (node: MaterialNode) => number
  /**
   * Datasource drag-and-drop handler. Materials implement this to take over
   * dragOver detection and drop binding instead of the default BindFieldCommand.
   * When absent, the designer falls back to default behavior (whole element as drop zone).
   */
  datasourceDrop?: DatasourceDropHandler
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
  /** Read inherited value for placeholder display (optional) */
  readInheritedValue?: (key: string) => unknown
  /** Clear override, restoring to inherited state (optional) */
  clearOverride?: (key: string) => void
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

// ─── Deep Editing FSM ─────────────────────────────────────────────

/** Declarative finite state machine definition for deep editing. */
export interface DeepEditingDefinition {
  /** Material-internal phases + transition rules */
  phases: DeepEditingPhase[]
  /** Phase to enter when deep editing starts */
  initialPhase: string
}

export interface DeepEditingPhase {
  id: string
  /** Called when entering this phase; mount overlay/toolbar content into the provided containers. */
  onEnter: (containers: PhaseContainers, node: MaterialNode) => void
  /** Called when exiting this phase; cleanup mounted content. */
  onExit: () => void
  /** Sub-selection protocol: material declares sub-element selection logic (e.g. table cells). */
  subSelection?: SubSelectionHandler
  /** Internal resize protocol: material declares internally resizable regions (e.g. column borders). */
  internalResize?: InternalResizeHandler
  /** Keyboard routing: material handles key events while in this phase. */
  keyboardHandler?: KeyboardRouteHandler
  /** Transition rules: which phases can be reached from this one and how. */
  transitions: PhaseTransition[]
}

/** DOM containers provided by Designer for material-owned UI during deep editing. */
export interface PhaseContainers {
  /** Overlay container (positioned over the element, absolute positioning) */
  overlay: HTMLElement
  /** Toolbar container (floating region above the element) */
  toolbar: HTMLElement
  /** Request a phase transition from within the current phase (e.g. toolbar actions). */
  requestTransition: (phaseId: string) => void
}

export interface PhaseTransition {
  to: string
  trigger: 'click' | 'double-click' | 'escape' | 'custom'
  guard?: (event: unknown, node: MaterialNode) => boolean
}

export interface SubSelectionHandler {
  hitTest: (point: { x: number, y: number }, node: MaterialNode) => SubSelectionResult | null
  getSelectedPath: () => unknown
  clearSelection: () => void
}

export interface SubSelectionResult {
  path: unknown
  rect?: { x: number, y: number, w: number, h: number }
}

export interface InternalResizeHandler {
  getResizeHandles: (node: MaterialNode) => InternalResizeHandle[]
  onResize: (handle: InternalResizeHandle, delta: { dx: number, dy: number }) => void
  onResizeEnd: (handle: InternalResizeHandle) => void
}

export interface InternalResizeHandle {
  id: string
  cursor: string
  position: { x: number, y: number }
}

export interface KeyboardRouteHandler {
  handleKey: (event: KeyboardEvent, node: MaterialNode) => boolean
}
