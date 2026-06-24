import type { MaterialBindingDefinition, MaterialConditionCapability, PropSchema } from '@easyink/core'
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { LocaleMessages } from '@easyink/locales'
import type { DocumentSchema, DocumentSchemaInput, MaterialNode } from '@easyink/schema'
import type { AIMaterialDescriptor, MaterialCategory } from '@easyink/shared'
import type { Component } from 'vue'
import type { Contribution } from './contributions/types'

export type MaterialIcon = Component

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
  LazyMaterialExtensionFactory,
  MaterialControlPolicy,
  MaterialControlPolicyContext,
  MaterialControlState,
  MaterialControlStateKind,
  MaterialDesignerExtension,
  MaterialDesignerRenderContext,
  MaterialDesignerRenderContextSignal,
  MaterialDesignerRenderPageContext,
  MaterialExtensionContext,
  MaterialExtensionFactory,
  MaterialGeometry,
  MaterialGeometryControlKey,
  MaterialPropsControlPolicy,
  MaterialResizeAdapter,
  MaterialResizeControlPolicy,
  MaterialResizeHandle,
  MaterialResizeParams,
  MaterialResizeSideEffect,
  NodeSignal,
  PropCommitContext,
  PropertyPanelOverlay,
  PropertyPanelRequest,
  PropertyValueInput,
  PropSchema,
  PropSchemaEditorOptions,
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
export type { LocaleMessages } from '@easyink/locales'

export interface LocaleMessageRegistration {
  /**
   * Fallback messages used when the active locale code has no specific entry.
   * This keeps standalone contributions useful even when the host does not
   * provide a locale code.
   */
  messages?: LocaleMessages
  /** Messages keyed by locale code, for example `zh-CN` or `en-US`. */
  locales?: Record<string, LocaleMessages>
}

// ─── Workbench State ───────────────────────────────────────────────

export interface WorkbenchState {
  windows: WorkspaceWindowState[]
  toolbar: ToolbarLayoutState
  viewport: CanvasViewportState
  panels: PanelToggleState
  status: StatusBarState
  snap: SnapState
  guide: GuideInteractionState
}

export interface GuideInteractionState {
  enabled: boolean
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
export type SnapSource = 'grid' | 'guide' | 'element' | 'page'

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
  savePhase: 'idle' | 'queued' | 'saving' | 'success' | 'failed'
  saveMessage?: string
  saveUpdatedAt?: number
}

// ─── Panel Section Filter ─────────────────────────────────────────

/** Identifiers for the sections in PropertiesPanel. */
export type PanelSectionId = 'geometry' | 'props' | 'overlay' | 'binding' | 'condition' | 'visibility'

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
  icon: MaterialIcon
  category: MaterialCategory
  capabilities: MaterialCapabilities
  condition?: MaterialConditionCapability
  props: PropSchema[]
  binding: MaterialBindingDefinition
  aiDescriptor?: AIMaterialDescriptor
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
  groupId: string
  label: string
  icon: MaterialIcon
  materialType: string
  createDefaultNode?: MaterialDefinition['createDefaultNode']
  dragData?: string
  useTokens?: string[]
  order?: number
}

export interface MaterialCatalogGroup {
  id: string
  label: string
  order?: number
  items: MaterialCatalogEntry[]
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

// ─── User Interaction Bridge ──────────────────────────────────────

export type DesignerConfirmSeverity = 'info' | 'warning' | 'danger'

export interface DesignerConfirmRequest<TPayload = unknown> {
  /** Stable action id, e.g. "designer.template.clear". */
  id: string
  title?: string
  message: string
  description?: string
  severity?: DesignerConfirmSeverity
  confirmText?: string
  cancelText?: string
  payload?: TPayload
}

export interface DesignerAssetPickRequest<TPayload = unknown> {
  /** Stable action id, e.g. "designer.pageBackground.pickImage". */
  id: string
  source: 'page-background' | 'image-material' | string
  title?: string
  currentUrl?: string
  accept?: string[]
  payload?: TPayload
}

export interface DesignerTextFilePickRequest<TPayload = unknown> {
  /** Stable action id, e.g. "designer.svgCustom.importFile". */
  id: string
  source: 'prop-schema' | string
  title?: string
  accept?: string[]
  encoding?: string
  maxBytes?: number
  payload?: TPayload
}

export interface DesignerResolvedAsset {
  url: string
  assetId?: string
  alt?: string
  width?: number
  height?: number
  name?: string
  metadata?: Record<string, unknown>
}

export interface DesignerResolvedTextFile {
  text: string
  name?: string
  type?: string
  size?: number
  lastModified?: number
  metadata?: Record<string, unknown>
}

export interface DesignerLocalAssetPickResult {
  file: File
  alt?: string
  width?: number
  height?: number
  name?: string
  metadata?: Record<string, unknown>
}

export type DesignerAssetPickResult = DesignerResolvedAsset | DesignerLocalAssetPickResult

export interface DesignerAssetUploadRequest<TPayload = unknown> extends DesignerAssetPickRequest<TPayload> {
  file: File
  picked: DesignerLocalAssetPickResult
}

export interface DesignerInteractionProvider {
  confirm?: <TPayload = unknown>(request: DesignerConfirmRequest<TPayload>) => boolean | Promise<boolean>
  pickAsset?: <TPayload = unknown>(request: DesignerAssetPickRequest<TPayload>) =>
    DesignerAssetPickResult | null | Promise<DesignerAssetPickResult | null>
  uploadAsset?: <TPayload = unknown>(request: DesignerAssetUploadRequest<TPayload>) =>
    DesignerResolvedAsset | Promise<DesignerResolvedAsset>
  pickFileText?: <TPayload = unknown>(request: DesignerTextFilePickRequest<TPayload>) =>
    DesignerResolvedTextFile | null | Promise<DesignerResolvedTextFile | null>
}

// ─── Designer Props ────────────────────────────────────────────────

export interface EasyInkDesignerProps {
  schema?: DocumentSchemaInput
  dataSources?: DataSourceDescriptor[]
  fontProvider?: import('@easyink/core').FontProvider
  preferenceProvider?: PreferenceProvider
  autoSave?: TemplateAutoSaveOptions
  locale?: LocaleMessages
  setupStore?: StoreSetup
  contributions?: Contribution[]
  interactionProvider?: DesignerInteractionProvider
}

export interface TemplateAutoSaveOptions {
  enabled: boolean
  delay?: number
  save: (schema: DocumentSchema) => Promise<void>
}

export type StoreSetup = (store: import('./store/designer-store').DesignerStore) => void

export interface PreferenceProvider {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}
