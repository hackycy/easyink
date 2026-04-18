export { keyboardCursorMiddleware, selectionMiddleware, undoBoundaryMiddleware } from './behaviors'

export {
  extractCollectionPath,
  resolveBindingValue,
  resolveFieldFromRecord,
  resolveNodeBindings,
} from './binding-utils'

export { CommandManager, CompositeCommand, createBatchCommand } from './command'
export type { Command, HistoryEntry } from './command'
export {
  AddMaterialCommand,
  BindFieldCommand,
  ClearBindingCommand,
  getByPath,
  MoveMaterialCommand,
  RemoveMaterialCommand,
  ResizeMaterialCommand,
  RotateMaterialCommand,
  setByPath,
  UnionDropCommand,
  UpdateDocumentCommand,
  UpdateGeometryCommand,
  UpdateGuidesCommand,
  UpdateMaterialPropsCommand,
  UpdatePageCommand,
  UpdateTableVisibilityCommand,
  validateMerge,
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
  MaterialGeometry,
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

export type { FontDescriptor, FontProvider, FontSource } from './font'
export {
  distance,
  getBoundingRect,
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
  MaterialDesignerExtension,
  MaterialExtensionContext,
  MaterialExtensionFactory,
  NodeSignal,
  PropertyPanelOverlay,
  PropertyPanelRequest,
  PropSchemaLike,
  SelectionSnapshot,
  ToolbarAction,
} from './material-extension'

export type {
  MaterialViewerExtension,
  ViewerMeasureContext,
  ViewerMeasureResult,
  ViewerRenderContext,
  ViewerRenderOutput,
} from './material-viewer'

export { createPagePlan } from './page-planner'

export type { PagePlan, PagePlanDiagnostic, PagePlanEntry } from './page-planner'

export { applyJsonPatches, PatchCommand } from './patch-command'
export type { PatchCommandOptions } from './patch-command'

export { SelectionModel } from './selection'

export { UnitManager } from './unit'
