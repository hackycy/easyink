export { keyboardCursorMiddleware, selectionMiddleware, undoBoundaryMiddleware } from './behaviors'

export { formatBindingDisplayValue, hasBindingFormat } from './binding-format'
export type { BindingFormatContext, BindingFormatDiagnostic, BindingFormatResult } from './binding-format'

export type {
  BindingFormatEditorDefinition,
  BindingFormatEditorTab,
} from './binding-format-editor'

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
  UpdateMaterialBindingCommand,
  UpdateMaterialEditorStateCommand,
  UpdateMaterialModelCommand,
  UpdateMaterialOutputCommand,
  UpdatePageCommand,
  UpdateRenderConditionCommand,
} from './commands'
export {
  CONDITION_MAX_COLLECTION_RECORDS,
  CONDITION_MAX_GROUPS,
  CONDITION_MAX_ROWS,
  CONDITION_STEP_BUDGET,
  DEFAULT_MATERIAL_CONDITION,
  evaluateCondition,
  resolveConditionalNode,
  resolveMaterialConditionCapability,
} from './condition'
export type {
  ConditionalNodeResolution,
  ConditionalNodeState,
  ConditionDiagnostic,
  ConditionDiagnosticCode,
  ConditionEffect,
  ConditionEvaluationResult,
  ConditionTruth,
  MaterialConditionCapability,
  MaterialConditionDefinition,
} from './condition'

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
  findPageForDocumentY,
  findPageForVisualPoint,
  getEditorSurfacePageLeft,
  projectDocumentPointToEditorSurface,
  projectEditorSurfacePointToDocument,
} from './editor-surface-plan'

export type { EditorSurfacePagePlan, EditorSurfacePlan, EditorSurfacePointProjection } from './editor-surface-plan'

export { collectFontFamilies, FontManager } from './font'
export type {
  FontBatchLoadOptions,
  FontBatchLoadResult,
  FontDescriptor,
  FontDescriptorSource,
  FontLoadFailure,
  FontLoadRequest,
  FontLoadState,
  FontLoadStatus,
  FontLoadSuccess,
  FontPreloadResult,
  FontProvider,
  FontSource,
  SystemFontSource,
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
  BindingExpression,
  CanonicalMaterialBindingMap,
  MaterialBindingDefinition,
  MaterialBindingPortPolicy,
  MaterialBindingValueShape,
  MaterialNoBindingDefinition,
  MaterialPortsBindingDefinition,
} from './material-binding'
export { assertMaterialBindingValue, resolveMaterialBindingPortPolicy } from './material-binding'

export {
  applyMaterialDataFieldMapping,
  canBindMaterialDataField,
  clearMaterialDataFieldMapping,
  findMaterialDataFieldMapping,
  isDataContractBinding,
  normalizeMaterialDataBinding,
  resolveMaterialDataContract,
  swapMaterialDataFieldMappings,
} from './material-data-contract'
export type {
  MaterialDataBindingField,
  MaterialDataContract,
  MaterialDataContractResolution,
  MaterialDataDiagnostic,
  MaterialDataFieldFormat,
  MaterialDataFieldResolution,
  MaterialDataMappingAcceptance,
  MaterialDataModel,
  MaterialDataModelField,
  MaterialDataModelKind,
  MaterialDataResolutionMode,
  MaterialDataValueType,
} from './material-data-contract'
export type {
  ContextAction,
  DatasourceDropHandler,
  DatasourceDropZone,
  DatasourceFieldInfo,
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
  MaterialGeometryControlKey,
  MaterialPropsControlPolicy,
  MaterialResizeAdapter,
  MaterialResizeControlPolicy,
  MaterialResizeHandle,
  MaterialResizeParams,
  MaterialResizeSideEffect,
  NodeSignal,
  PropertyDescriptorLike,
  PropertyPanelOverlay,
  PropertyPanelRequest,
  SelectionSnapshot,
  ToolbarAction,
} from './material-extension'
export { MaterialFacetHost } from './material-facet-host'
export type {
  FacetDiagnostic,
  FacetDiagnosticCode,
  FacetInstance,
  FacetState,
  MaterialFacetHostOptions,
  RuntimeMaterialSurface,
} from './material-facet-host'
export { admitMaterialGraph } from './material-graph-admission'
export type {
  CloneMaterialGraphOptions,
  CloneMaterialGraphResult,
  JsonPointer,
  MaterialBindingSlot,
  MaterialGraphDiagnostic,
  MaterialGraphValidationOptions,
  MaterialGraphWalkErrorCode,
  MaterialIdentity,
  MaterialIdentityEncoding,
  MaterialIdentityKey,
  MaterialIdentityScope,
  MaterialIdentitySlot,
  MaterialIdentityTarget,
  MaterialIntrospection,
  MaterialNodeAddress,
  MaterialNodeVisitor,
  MaterialReferenceSlot,
  MaterialResourceSlot,
  MaterialSlotAddress,
  MaterialSlotReparentInput,
  MaterialSlotReparentResult,
  MaterialStructureSlot,
} from './material-introspection'
export {
  cloneMaterialGraph,
  cloneMaterialSubgraph,
  createDefaultGraphIdentity,
  evaluateMaterialSlotReparent,
  formatMaterialIdentityKey,
  formatMaterialNodeAddress,
  inspectMaterialNode,
  MaterialGraphWalkError,
  readPointer,
  removePointer,
  validateMaterialGraph,
  walkMaterialNodes,
  writePointer,
} from './material-introspection'

export { deepFreezeManifest, defineMaterialManifest, MATERIAL_API_VERSION, MATERIAL_MANIFEST_VERSION } from './material-manifest'
export type {
  MaterialAIFacet,
  MaterialCommonFacet,
  MaterialDefaultNode,
  MaterialFacetActivationContext,
  MaterialFacetFactory,
  MaterialLayoutFacet,
  MaterialManifest,
  MaterialStructureFacet,
  MaterialStructureSlotPolicy,
  MaterialSurface,
} from './material-manifest'

export {
  compileMaterialProfile,
  DEFAULT_SCHEMA_ADMISSION_BUDGET,
  EASYINK_ENGINE_VERSION,
  MATERIAL_ADMISSION_BUDGET_CEILINGS,
  MaterialNodeCreationError,
  MaterialProfileCompileError,
} from './material-profile'
export type {
  CompiledMaterialProfile,
  CompileMaterialProfileInput,
  MaterialNodeCreateInput,
  MaterialPackageRegistration,
  MaterialProfileDiagnostic,
  SchemaAdmissionBudget,
} from './material-profile'

export {
  createModelPropertyAccessor,
  createNodePropertyAccessor,
  resolvePropertyAccessor,
  validatePropertyDescriptors,
} from './material-properties'
export type {
  AssetUrlPropertyValueInput,
  BasePropertyValueInput,
  NodePropertyAccessorOptions,
  PropertyAccessor,
  PropertyDescriptor,
  PropertyDescriptorDiagnostic,
  PropertyEditorOptions,
  PropertyValueInput,
  TextFilePropertyValueInput,
} from './material-properties'
export type {
  FragmentPaginateInput,
  FragmentPaginateResult,
  FragmentPaginator,
  MaterialViewerExtension,
  MaterialViewerFacet,
  ViewerFacetCapabilities,
  ViewerMeasureContext,
  ViewerMeasureResult,
  ViewerRenderCapabilities,
  ViewerRenderContext,
  ViewerRenderOutput,
  ViewerRenderSize,
} from './material-viewer'

export { groupPageLayerPlansByPlacement, PAGE_CONTENT_LAYER_STACK_INDEX, resolvePageLayerPlans, resolvePageLayers, resolvePageLayerStackIndex } from './page-layers'
export type { PageLayerRenderPlan, PageLayerRenderPlanBuckets, PageLayerTile, ResolvedPageLayer, ResolvedTextWatermarkPageLayer, ResolvePageLayerPlansOptions, TextWatermarkPageLayerPlan } from './page-layers'

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

export { loadDocumentWithProfile, recordSchemaAdapter, validateDocumentWithProfile } from './schema-adapter'
export type {
  AdaptableMaterialNode,
  MaterialDocumentLoadResult,
  MaterialDocumentValidationOptions,
  MaterialDocumentValidationReport,
  MaterialLoadDiagnostic,
  MaterialNodeLoadState,
  MaterialSchemaIssue,
  SchemaAdapter,
  SchemaAdapterContext,
  SchemaAdapterStage,
  SchemaMigration,
} from './schema-adapter'

export { isInteractable, isSelectable, SelectionModel } from './selection'
export { UnitManager } from './unit'

export {
  assertViewerRenderTree,
  VIEWER_TREE_ABSOLUTE_MAX_ATTRIBUTES,
  VIEWER_TREE_ABSOLUTE_MAX_DEPTH,
  VIEWER_TREE_ABSOLUTE_MAX_NODES,
  VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES,
  viewerElement,
  viewerFragment,
  viewerImperativeDom,
  viewerSanitizedMarkup,
  viewerText,
} from './viewer-render-tree'

export type {
  SanitizedMarkup,
  ViewerAttributeValue,
  ViewerElementNamespace,
  ViewerElementOptions,
  ViewerElementTree,
  ViewerFragmentTree,
  ViewerImperativeDomTree,
  ViewerImperativeHost,
  ViewerRenderTree,
  ViewerSanitizedMarkupTree,
  ViewerStyleValue,
  ViewerTextTree,
} from './viewer-render-tree'
