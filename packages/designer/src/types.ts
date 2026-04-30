import type { PropSchema } from '@easyink/core'
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { MaterialNode } from '@easyink/schema'
import type { MaterialCategory } from '@easyink/shared'

export type {
  BehaviorContext,
  BehaviorEvent,
  BehaviorMiddleware,
  BehaviorRegistration,
  ContentLayout,
  ContextAction,
  DatasourceDropHandler,
  DatasourceDropZone,
  DatasourceFieldInfo,
  EditingSessionRef,
  EphemeralPanelDef,
  GeometryService,
  MaterialDesignerExtension,
  MaterialExtensionContext,
  MaterialExtensionFactory,
  MaterialGeometry,
  MaterialResizeAdapter,
  MaterialResizeParams,
  MaterialResizeSideEffect,
  NodeSignal,
  PropCommitContext,
  PropertyPanelOverlay,
  PropertyPanelRequest,
  PropSchema,
  PropSchemaLike,
  Selection,
  SelectionDecorationDef,
  SelectionSnapshot,
  SelectionStore,
  SelectionType,
  SubPropertySchema,
  SurfacesAPI,
  ToolbarAction,
  TransactionAPI,
  TxOptions,
} from '@easyink/core'
export * from '@easyink/datasource'

// ─── Workbench State ───────────────────────────────────────────────

export interface WorkbenchState {
  windows: WorkspaceWindowState[]
  toolbar: ToolbarLayoutState
  viewport: CanvasViewportState
  panels: PanelToggleState
  status: StatusBarState
  snap: SnapState
}

export interface SnapState {
  enabled: boolean
  gridSnap: boolean
  guideSnap: boolean
  elementSnap: boolean
  /**
   * Snap distance threshold expressed in document units at 100% zoom
   * (i.e. "screen-equivalent pixels mapped through unit conversion").
   * Runtime snap engine divides this by current zoom so the visual
   * pull radius stays constant across zoom levels.
   */
  threshold: number
}

/** Origin of a snap candidate. Higher priority sources break ties. */
export type SnapSource = 'grid' | 'guide' | 'element'

/**
 * A snap line emitted by the snap engine for visual feedback.
 *
 * - `orientation: 'vertical'` means the line is drawn parallel to the Y axis at x = position.
 * - `orientation: 'horizontal'` means the line is drawn parallel to the X axis at y = position.
 * - `from` / `to` are the endpoints along the perpendicular axis (in document units),
 *   used to draw a finite segment (Figma-style). Overlay may extend grid/guide
 *   lines across the whole page and treat element lines as short segments.
 */
export interface SnapLine {
  orientation: 'vertical' | 'horizontal'
  position: number
  from: number
  to: number
  source: SnapSource
  /** ID of the element a snap targets, when source === 'element'. */
  targetId?: string
}

export interface WorkspaceWindowState {
  id: string
  kind: string
  visible: boolean
  collapsed: boolean
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

export interface ToolbarLayoutState {
  align: 'start' | 'center' | 'end'
  groups: ToolbarGroupState[]
}

export interface ToolbarGroupState {
  id: string
  hidden: boolean
  hideDivider: boolean
  order: number
}

export interface CanvasViewportState {
  zoom: number
  scrollLeft: number
  scrollTop: number
  activeRegionId?: string
}

export interface PanelToggleState {
  dataSource: boolean
  minimap: boolean
  properties: boolean
  structureTree: boolean
  history: boolean
  animation: boolean
  assets: boolean
  debug: boolean
  draft: boolean
}

export interface StatusBarState {
  focus: 'canvas' | 'panel' | 'dialog' | 'none'
  network: 'idle' | 'loading' | 'error'
  draft: 'clean' | 'modified'
  autoSave: 'idle' | 'saving' | 'success' | 'failed'
  autoSaveMessage?: string
}

// ─── Panel Section Filter ─────────────────────────────────────────

/** Identifiers for the sections in PropertiesPanel. */
export type PanelSectionId = 'geometry' | 'props' | 'overlay' | 'binding' | 'visibility'

/** Context passed to MaterialDefinition.sectionFilter for dynamic decisions. */
export interface SectionFilterContext {
  node: MaterialNode
  /** Whether an editing session is active for this node */
  isEditing: boolean
}

// ─── Material Definition ───────────────────────────────────────────

export interface MaterialDefinition {
  type: string
  name: string
  icon: string
  category: MaterialCategory
  capabilities: MaterialCapabilities
  props: PropSchema[]
  createDefaultNode: (input?: Partial<MaterialNode>, unit?: string) => MaterialNode
  /**
   * Dynamic filter for PropertiesPanel sections.
   * Return false to hide a section. When absent, all sections are shown.
   */
  sectionFilter?: (sectionId: PanelSectionId, context: SectionFilterContext) => boolean
}

export interface MaterialCapabilities {
  bindable?: boolean
  rotatable?: boolean
  resizable?: boolean
  supportsChildren?: boolean
  supportsAnimation?: boolean
  supportsUnionDrop?: boolean
  pageAware?: boolean
  multiBinding?: boolean
  /** Maintain aspect ratio during element-level resize handle drag. */
  keepAspectRatio?: boolean
}

// ─── Material Catalog ──────────────────────────────────────────────

export interface MaterialCatalogEntry {
  id: string
  group: 'quick' | 'data' | 'chart' | 'svg' | 'utility'
  label: string
  icon: string
  materialType: string
  useTokens?: string[]
  priority?: 'quick' | 'grouped'
}

// ─── Material Extensions (re-exported from @easyink/core) ─────────

export * from '@easyink/schema'

// (DeepEditingRuntimeState removed — replaced by EditingSessionManager)

// ─── Designer Panel / Toolbar ──────────────────────────────────────

export interface DesignerPanelDefinition {
  id: string
  title: string
  icon?: string
  component: unknown
}

export interface ToolbarItemDefinition {
  id: string
  group: string
  label: string
  icon?: string
  action: () => void
  disabled?: () => boolean
}

export interface ContextActionDefinition {
  id: string
  label: string
  icon?: string
  predicate: (nodes: MaterialNode[]) => boolean
  action: (nodes: MaterialNode[]) => void
}

// ─── Save / Export State ───────────────────────────────────────────

export interface SaveBranchMenuState {
  open: boolean
  autoSaveEnabled: boolean
  pendingAction?: 'edit-template-data' | 'export-file' | 'import-file'
}

// ─── Designer Props ────────────────────────────────────────────────

export interface EasyInkDesignerProps {
  schema: import('@easyink/schema').DocumentSchema
  dataSources?: DataSourceDescriptor[]
  preferenceProvider?: PreferenceProvider
  locale?: LocaleMessages
  setupStore?: StoreSetup
}

export type StoreSetup = (store: import('./store/designer-store').DesignerStore) => void

export interface PreferenceProvider {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

export interface LocaleMessages {
  [key: string]: string | LocaleMessages
}
