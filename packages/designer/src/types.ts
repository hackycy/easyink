import type { DataSourceDescriptor } from '@easyink/datasource'
import type { MaterialNode } from '@easyink/schema'
import type { MaterialCategory, PropSchemaType, TemplateBackendMode, TemplateLibraryPhase } from '@easyink/shared'

// ─── Workbench State ───────────────────────────────────────────────

export interface WorkbenchState {
  windows: WorkspaceWindowState[]
  toolbar: ToolbarLayoutState
  viewport: CanvasViewportState
  panels: PanelToggleState
  preview: PreviewWorkbenchState
  templateLibrary: TemplateLibraryState
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

export interface PreviewWorkbenchState {
  visible: boolean
  iframeUrl?: string
}

export interface StatusBarState {
  focus: 'canvas' | 'panel' | 'dialog' | 'none'
  network: 'idle' | 'loading' | 'error'
  draft: 'clean' | 'modified'
  autoSave: 'idle' | 'saving' | 'success' | 'failed'
  autoSaveMessage?: string
}

// ─── Template Library ──────────────────────────────────────────────

export interface TemplateLibraryState {
  phase: TemplateLibraryPhase
  query: string
  page: number
  pageSize: number
  backendMode: TemplateBackendMode
  selectedTemplateId?: string
}

// ─── Table Editing ─────────────────────────────────────────────────

export interface TableEditingState {
  phase: 'idle' | 'table-selected' | 'band-selected' | 'cell-selected'
  tableId?: string
  band?: 'header' | 'title' | 'data' | 'summary' | 'footer' | 'blank'
  cellPath?: {
    row: number
    col: number
  }
}

// ─── Material Definition ───────────────────────────────────────────

export interface MaterialDefinition {
  type: string
  name: string
  icon: string
  category: MaterialCategory
  capabilities: MaterialCapabilities
  props: PropSchema[]
  createDefaultNode: (input?: Partial<MaterialNode>) => MaterialNode
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
  group: 'quick' | 'data' | 'chart' | 'svg' | 'relation'
  label: string
  icon: string
  materialType: string
  useTokens?: string[]
  priority?: 'quick' | 'grouped'
}

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

export interface DesignerRenderContext {
  unit: import('@easyink/shared').UnitType
  getBindingLabel: (binding: import('@easyink/schema').BindingRef) => string
}

export interface DesignerRenderOutput {
  html: string
  editable?: boolean
}

export interface MaterialDesignerExtension {
  renderContent?: (node: MaterialNode, context: DesignerRenderContext) => DesignerRenderOutput
  getToolbarActions?: (node: MaterialNode) => ToolbarAction[]
  getContextActions?: (node: MaterialNode) => ContextAction[]
  renderOverlay?: (node: MaterialNode, state: DesignerMaterialState) => unknown
  enterEditMode?: (node: MaterialNode) => boolean
}

export interface DesignerMaterialState {
  selected: boolean
  hovered: boolean
  editing: boolean
}

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
  sampleLibrary?: SampleLibraryProvider
  viewerAdapter?: ViewerAdapter
  preferenceProvider?: PreferenceProvider
  locale?: LocaleMessages
}

export interface SampleLibraryProvider {
  list: (query: string, page: number, pageSize: number) => Promise<SampleTemplate[]>
  load: (id: string) => Promise<import('@easyink/schema').DocumentSchema>
}

export interface SampleTemplate {
  id: string
  name: string
  thumbnail?: string
  category?: string
}

export interface ViewerAdapter {
  getPreviewUrl: () => string
}

export interface PreferenceProvider {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

export interface LocaleMessages {
  [key: string]: string | LocaleMessages
}
