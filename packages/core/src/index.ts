export { keyboardCursorMiddleware, selectionMiddleware, undoBoundaryMiddleware } from './behaviors'

export { formatBindingDisplayValue, hasBindingFormat } from './binding-format'
export type { BindingFormatContext, BindingFormatDiagnostic, BindingFormatResult } from './binding-format'

export {
  extractCollectionPath,
  resolveBindingValue,
  resolveFieldFromRecord,
  resolveNodeBindings,
} from './binding-utils'

export { CommandManager, CompositeCommand, createBatchCommand } from './command'
export type { Command, HistoryEntry } from './command'
export {
  AddElementGroupCommand,
  AddMaterialCommand,
  AddPageSheetCommand,
  BindFieldCommand,
  ClearBindingCommand,
  getByPath,
  MoveMaterialCommand,
  RemoveElementGroupCommand,
  RemoveMaterialCommand,
  RemovePageSheetCommand,
  ResizeMaterialCommand,
  RotateMaterialCommand,
  setByPath,
  UnionDropCommand,
  UpdateBindingFormatCommand,
  UpdateDocumentCommand,
  UpdateGeometryCommand,
  UpdateGuidesCommand,
  UpdateMaterialBehaviorCommand,
  UpdateMaterialMetaCommand,
  UpdateMaterialPropsCommand,
  UpdatePageCommand,
} from './commands'

// ─── Editing Behavior Architecture (Chapter 22) ───────────────────

export type {
  BehaviorContext,
  BehaviorEvent,
  BehaviorMiddleware,
  BehaviorRegistration,
  ContentLayout,
  EditingSessionRef,
  EphemeralPanelDef,
  GeometryService,
  LocalCoordinateOptions,
  MaterialGeometry,
  PageGeometrySnapshot,
  Selection,
  SelectionDecorationDef,
  SelectionStore,
  SelectionType,
  SubPropertySchema,
  SurfacesAPI,
  TransactionAPI,
  TxOptions,
} from './editing-session'

// ─── Core Services ────────────────────────────────────────────────

export {
  createEditorSurfacePlan,
  DEFAULT_EDITOR_PAGE_GAP,
  findPageForDocumentY,
  findPageForVisualPoint,
  getEditorSurfacePageLeft,
  projectDocumentPointToEditorSurface,
  projectEditorSurfacePointToDocument,
  resolveEditorPageGap,
} from './editor-surface-plan'

export type { EditorSurfacePagePlan, EditorSurfacePlan, EditorSurfacePointProjection } from './editor-surface-plan'

export { collectFontFamilies, FontManager } from './font'
export type {
  FontBatchLoadOptions,
  FontBatchLoadResult,
  FontDescriptor,
  FontLoadFailure,
  FontLoadRequest,
  FontLoadState,
  FontLoadStatus,
  FontLoadSuccess,
  FontPreloadResult,
  FontProvider,
  FontSource,
} from './font'

export {
  distance,
  getBoundingRect,
  getRotatedAABB,
  normalizeRotation,
  pointInRect,
  rectContains,
  rectsIntersect,
  snapToGrid,
  snapToGuide,
} from './geometry'

export type { Point, Rect, Size } from './geometry'

export { AsyncHook, createInternalHooks, SyncHook, SyncWaterfallHook } from './hooks'

export type { CommandRecord, InternalHooks, MaterialRenderPayload, PagePlanningContext, ViewerDiagnosticEvent } from './hooks'

export { createFragmentFromNode, readNodeFlowConstraints, readNodeRepeatScope } from './layout-plan'

export type { FlowBreakConstraints, LayoutDiagnostic, LayoutDocument, LayoutFragment, OutputPagePlan } from './layout-plan'
export { runLayoutPipeline } from './layout-strategy'

export type { RunLayoutPipelineOptions } from './layout-strategy'

export type {
  ContextAction,
  DatasourceDropHandler,
  DatasourceDropZone,
  DatasourceFieldInfo,
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
  PropSchema,
  PropSchemaLike,
  SelectionSnapshot,
  ToolbarAction,
} from './material-extension'

export type {
  FragmentPaginateInput,
  FragmentPaginateResult,
  FragmentPaginator,
  MaterialViewerExtension,
  TrustedViewerHtml,
  TrustedViewerHtmlSource,
  ViewerMeasureContext,
  ViewerMeasureResult,
  ViewerRenderContext,
  ViewerRenderOutput,
  ViewerRenderSize,
} from './material-viewer'
export { readTrustedViewerHtml, trustedViewerHtml } from './material-viewer'

export { resolvePageModel } from './page-model'
export type { ResolvedPageModel } from './page-model'

export { createPagePlan } from './page-planner'

export type { PagePlan, PagePlanDiagnostic, PagePlanEntry, PagePlanOptions } from './page-planner'

export { runPagination } from './pagination-engine'
export type { PaginationOptions, PaginationResult } from './pagination-engine'

export { applyJsonPatches, PatchCommand } from './patch-command'
export type { PatchCommandOptions } from './patch-command'

export { runFlowYReflow } from './reflow-engine'
export type { ReflowEngineInput, ReflowEngineResult } from './reflow-engine'

export { isInteractable, isSelectable, SelectionModel } from './selection'

export { UnitManager } from './unit'
