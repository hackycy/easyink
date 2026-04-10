export { CommandManager, CompositeCommand, createBatchCommand } from './command'
export type { Command, HistoryEntry } from './command'
export {
  AddMaterialCommand,
  BindFieldCommand,
  BindStaticCellCommand,
  BindTableSourceCommand,
  ClearBindingCommand,
  ClearStaticCellBindingCommand,
  ClearTableSourceCommand,
  getByPath,
  ImportTemplateCommand,
  InsertTableColumnCommand,
  InsertTableRowCommand,
  MergeTableCellsCommand,
  MoveMaterialCommand,
  RemoveMaterialCommand,
  RemoveTableColumnCommand,
  RemoveTableRowCommand,
  ResizeMaterialCommand,
  ResizeTableColumnCommand,
  ResizeTableRowCommand,
  RotateMaterialCommand,
  SplitTableCellCommand,
  UnionDropCommand,
  UpdateDocumentCommand,
  UpdateGuidesCommand,
  UpdateMaterialPropsCommand,
  UpdatePageCommand,
  UpdateTableCellBorderCommand,
  UpdateTableCellCommand,
  UpdateTableRowRoleCommand,
  UpdateTableVisibilityCommand,
  UpdateUsageCommand,
  validateMerge,
} from './commands'

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
  DeepEditingDefinition,
  DeepEditingPhase,
  InternalResizeHandle,
  InternalResizeHandler,
  KeyboardRouteHandler,
  MaterialDesignerExtension,
  MaterialExtensionContext,
  MaterialExtensionFactory,
  NodeSignal,
  PhaseContainers,
  PhaseTransition,
  PropertyPanelRequest,
  SelectionSnapshot,
  SubSelectionHandler,
  SubSelectionResult,
  ToolbarAction,
} from './material-extension'

export { createPagePlan } from './page-planner'

export type { PagePlan, PagePlanDiagnostic, PagePlanEntry } from './page-planner'
export { SelectionModel } from './selection'

export { UnitManager } from './unit'
