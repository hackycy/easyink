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
  BindFieldCommand,
  ClearBindingCommand,
  getByPath,
  MoveMaterialCommand,
  RemoveElementGroupCommand,
  RemoveMaterialCommand,
  ResizeMaterialCommand,
  RotateMaterialCommand,
  setByPath,
  UnionDropCommand,
  UpdateBindingFormatCommand,
  UpdateDocumentCommand,
  UpdateGeometryCommand,
  UpdateGuidesCommand,
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

export { FontManager } from './font'

export type {
  FontBatchLoadOptions,
  FontBatchLoadResult,
  FontDescriptor,
  FontLoadFailure,
  FontLoadRequest,
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

export { createPagePlan } from './page-planner'

export type { PagePlan, PagePlanDiagnostic, PagePlanEntry, PagePlanOptions } from './page-planner'

export { applyJsonPatches, PatchCommand } from './patch-command'
export type { PatchCommandOptions } from './patch-command'

export { isInteractable, isSelectable, SelectionModel } from './selection'

export { UnitManager } from './unit'
