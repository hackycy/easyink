import type { MaterialNode } from '@easyink/schema'
import type { MaterialCategory, PropSchemaType } from '@easyink/shared'

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
  NodeSignal,
  PropertyPanelOverlay,
  PropertyPanelRequest,
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
  threshold: number
  /** Active snap lines to render (in document units) */
  activeLines: SnapLine[]
}

export interface SnapLine {
  axis: 'x' | 'y'
  position: number
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
}

export interface PreferenceProvider {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

export interface LocaleMessages {
  [key: string]: string | LocaleMessages
}
