import type { CompiledMaterialProfile, DocumentStore, DocumentTransactionEngine, EphemeralPanelDef, FacetInstance, FontLoadRequest, FontLoadStatus, FontManager, FontProvider, MaterialDesignerFacet, MaterialFacetHost, MaterialLoadDiagnostic, MaterialNodeLoadState, PropertyPanelOverlay, TransactionAPI } from '@easyink/core'
import type { DocumentSchema, DocumentSchemaInput, ElementGroupSchema, MaterialNode } from '@easyink/schema'
import type { PaperPreset } from '@easyink/shared'
import type { Component } from 'vue'
import type { DesignerRuntimeConfig } from '../runtime-config'
import type { DesignerInteractionProvider, LocaleMessageRegistration, LocaleMessages, PreferenceProvider, SnapLine, StatusBarState } from '../types'
import { CommandManager, DocumentStore as CoreDocumentStore, DocumentTransactionEngine as CoreDocumentTransactionEngine, MaterialFacetHost as CoreMaterialFacetHost, loadDocumentWithProfile, SelectionModel, validateDocumentWithProfile } from '@easyink/core'
import { DataSourceRegistry } from '@easyink/datasource'
import { markRaw } from 'vue'
import { EditingSessionManager } from '../editing/editing-session-manager'
import { DesignerInteractionService } from '../interactions/interaction-service'
import { builtinMaterialGroupLabels, resolveBuiltinMaterialIcon } from '../material-host'
import { prepareDesignerFacetMetadata } from '../materials/designer-facet-metadata'
import { createMaterialExtensionContext } from '../materials/extension-context'
import { PropertyEditorRegistry } from '../properties/property-editor-registry'
import { resolveDesignerMaterialProfile } from '../runtime-config'
import { DiagnosticsChannel } from './diagnostics'
import { FontService } from './font-service'
import { PaperRegistry } from './paper-registry'
import { applyPersistedWorkbench, loadWorkbenchPreferences } from './preference-persistence'
import { SaveStatusManager } from './save-status-manager'
import { createDefaultSaveBranchMenu, createDefaultWorkbenchState } from './workbench'

/**
 * DesignerStore is the central state manager for the designer.
 * It composes template state, workbench state, and interaction context.
 */
export class DesignerStore {
  readonly runtimeConfig?: DesignerRuntimeConfig
  readonly materialProfile: CompiledMaterialProfile
  private readonly materialIcons: Readonly<Record<string, Component>>
  readonly propertyEditorRegistry = markRaw(new PropertyEditorRegistry())
  readonly materialFacetHost: MaterialFacetHost
  private readonly designerFacetCache = new Map<string, FacetInstance<MaterialDesignerFacet>>()
  private readonly designerFacetLocaleDisposers = new WeakMap<object, () => void>()
  private readonly designerFacetLocaleCleanups = new Set<() => void>()
  // ─── Template state (enters Schema + command history) ─────────
  private documentViewRevision = 0
  private _materialDiagnostics: readonly MaterialLoadDiagnostic[] = Object.freeze([])
  private _materialNodeStates: ReadonlyMap<string, MaterialNodeLoadState> = new Map()
  private disposeDocumentSubscription?: () => void
  private disposeSelectionSubscription?: () => void
  private destroyed = false

  // ─── Core services ────────────────────────────────────────────
  readonly commands = new CommandManager()
  readonly selection = new SelectionModel()
  readonly documentStore: DocumentStore
  readonly documentTransactions: DocumentTransactionEngine
  readonly dataSourceRegistry = new DataSourceRegistry()
  readonly interactions = markRaw(new DesignerInteractionService())
  readonly materialTransaction: TransactionAPI

  /**
   * Designer-level diagnostics channel. Recoverable errors (rejected
   * selection payload, behavior middleware throws, transaction rollback)
   * push here so the workbench DebugPanel and host Contributions can both
   * surface them. See `./diagnostics.ts` for rationale.
   */
  readonly diagnostics = new DiagnosticsChannel()
  readonly fontService: FontService
  assetPickerAvailable = false
  hostAssetPickerAvailable = false
  hostAssetUploaderAvailable = false
  textFilePickerAvailable = false
  hostTextFilePickerAvailable = false
  // ─── Clipboard (internal, not in Schema) ──────────────────────
  clipboard: MaterialNode[] = []

  // ─── Workbench state (NOT in Schema, NOT in undo/redo) ───────
  readonly workbench = createDefaultWorkbenchState()
  readonly saveBranch = createDefaultSaveBranchMenu()
  readonly saveStatus = new SaveStatusManager()

  /**
   * Active snap-line feedback for the overlay. Held as a top-level field
   * (outside `workbench.snap`) and reassigned each frame with a `markRaw`
   * array so the surrounding `reactive(store)` proxy notifies on the
   * single property write but never deep-tracks individual SnapLine
   * fields. Reading sites consume this directly; the property reassignment
   * itself is reactive.
   */
  snapActiveLines: readonly SnapLine[] = []
  materialExtensionRevision = 0

  readonly paperRegistry: PaperRegistry

  // ─── Editing Session Manager ─────────────────────────────────────
  readonly editingSession: EditingSessionManager

  // ─── Property panel overlay / ephemeral panel ──────────────────
  private _propertyOverlay: PropertyPanelOverlay | null = null
  private _ephemeralPanel: EphemeralPanelDef | null = null

  // ─── Page element provider (for coordinate conversion) ──────
  private _pageElProvider: () => HTMLElement | null = () => null

  // ─── Locale ───────────────────────────────────────────────────
  private _locale?: LocaleMessages
  private _localeCode?: string
  private readonly _localeRegistrations: LocaleMessageRegistration[] = []

  constructor(
    schema?: DocumentSchemaInput,
    preferenceProvider?: PreferenceProvider,
    interactionProvider?: DesignerInteractionProvider,
    runtimeConfig?: DesignerRuntimeConfig,
  ) {
    this.runtimeConfig = runtimeConfig
    this.materialIcons = markRaw({ ...runtimeConfig?.materials?.icons })
    this.materialProfile = resolveDesignerMaterialProfile(runtimeConfig?.materials)
    this.paperRegistry = new PaperRegistry(runtimeConfig?.paper)
    this.materialFacetHost = markRaw(new CoreMaterialFacetHost({
      getActivationServices: () => Object.assign(createMaterialExtensionContext(this), {
        propertyEditorRegistry: this.propertyEditorRegistry,
        registerLocaleMessages: this.registerLocaleMessages.bind(this),
        resolveMaterialIcon: this.resolveMaterialIcon.bind(this),
        runtimeConfig: this.runtimeConfig,
      }),
      onInstanceDisposed: instance => this.releaseDesignerFacetLocale(instance),
      prepareValue: (value, _profile, _materialType, surface) => prepareDesignerFacetMetadata(value, surface),
    }))
    const loaded = loadDocumentWithProfile(schema, this.materialProfile)
    this.applyRuntimeDefaults(runtimeConfig, schema, loaded.schema)
    this.documentStore = markRaw(new CoreDocumentStore(stripUndefined(loaded.schema), this.materialProfile, { nodeStates: loaded.nodeStates }))
    this.documentTransactions = markRaw(new CoreDocumentTransactionEngine(this.documentStore))
    this._materialDiagnostics = loaded.diagnostics
    this._materialNodeStates = loaded.nodeStates
    this.fontService = new FontService(this.diagnostics, this.materialProfile)
    this.materialTransaction = this.documentTransactions
    this.setInteractionProvider(interactionProvider)
    // Mark editing session manager as raw: it owns Vue refs internally and
    // must not be auto-unwrapped by the surrounding reactive(store) proxy.
    this.editingSession = markRaw(new EditingSessionManager(this))
    this.disposeDocumentSubscription = this.documentStore.subscribe((event) => {
      if (this.destroyed)
        return
      this.documentViewRevision += 1
      if (event.kind !== 'preview' && event.kind !== 'preview-cancel' && event.document === this.documentStore.committedDocument)
        this.selection.reconcile(event.index.nodeIds())
      if (event.validationReport && event.document === this.documentStore.committedDocument) {
        this._materialDiagnostics = event.validationReport.diagnostics
        this._materialNodeStates = event.validationReport.nodeStates
      }
    })
    this.disposeSelectionSubscription = this.selection.onChange(() => {
      if (this.destroyed)
        return
      this.documentTransactions.markHistoryBarrier()
    })
    markRaw(this.dataSourceRegistry)
    markRaw(this.diagnostics)

    // Apply persisted workbench state if available
    if (preferenceProvider) {
      const persisted = loadWorkbenchPreferences(preferenceProvider)
      if (persisted) {
        applyPersistedWorkbench(this.workbench, persisted)
      }
    }
  }

  // ─── Schema access ────────────────────────────────────────────

  get schema(): DocumentSchema {
    void this.documentViewRevision
    return this.documentStore.document
  }

  get materialDiagnostics(): readonly MaterialLoadDiagnostic[] {
    return this._materialDiagnostics
  }

  get materialNodeStates(): ReadonlyMap<string, MaterialNodeLoadState> {
    return this._materialNodeStates
  }

  getMaterialNodeState(nodeId: string): MaterialNodeLoadState | undefined {
    return this._materialNodeStates.get(nodeId)
  }

  setSchema(schema?: DocumentSchemaInput): void {
    const loaded = loadDocumentWithProfile(schema, this.materialProfile)
    this.documentTransactions.reset(stripUndefined(loaded.schema), loaded.nodeStates)
    this.commands.clear()
    this._materialDiagnostics = loaded.diagnostics
    this._materialNodeStates = loaded.nodeStates
    this.selection.clear()
    this.editingSession.exit()
    void this.preloadDocumentFonts()
  }

  publishSchemaCandidate(candidate: DocumentSchema, affectedNodeIds: 'all' | ReadonlySet<string>): boolean {
    const report = validateDocumentWithProfile(candidate, this.materialProfile, {
      mode: 'edit',
      baselineNodeStates: this._materialNodeStates,
      affectedNodeIds,
    })
    if (!report.valid)
      return false
    this.documentTransactions.reset(candidate, report.nodeStates)
    this._materialDiagnostics = report.diagnostics
    this._materialNodeStates = report.nodeStates
    return true
  }

  restoreSchemaFromHistory(candidate: DocumentSchema, targetNodeStates: ReadonlyMap<string, MaterialNodeLoadState>): boolean {
    const report = validateDocumentWithProfile(candidate, this.materialProfile, { mode: 'history-restore', targetNodeStates })
    if (!report.valid)
      return false
    this.documentTransactions.reset(candidate, report.nodeStates)
    this._materialDiagnostics = report.diagnostics
    this._materialNodeStates = report.nodeStates
    return true
  }

  private applyRuntimeDefaults(config: DesignerRuntimeConfig | undefined, input: DocumentSchemaInput | undefined, target: DocumentSchema): void {
    const defaults = config?.defaults
    if (defaults?.document)
      Object.assign(target, defaults.document)

    const defaultPreset = this.paperRegistry.getDefaultPreset()
    if (defaultPreset && !hasExplicitPageSize(input)) {
      Object.assign(target.page, {
        width: defaultPreset.width,
        height: defaultPreset.height,
        pageModel: syncPageModelPaper(target.page, {
          width: defaultPreset.width,
          height: defaultPreset.height,
        }),
      })
    }

    if (defaults?.page) {
      Object.assign(target.page, defaults.page)
      if (defaults.page.width != null || defaults.page.height != null)
        target.page.pageModel = syncPageModelPaper(target.page, defaults.page)
    }
  }

  setInteractionProvider(provider?: DesignerInteractionProvider): void {
    this.interactions.setProvider(provider)
    this.refreshInteractionAvailability()
  }

  refreshInteractionAvailability(): void {
    this.hostAssetPickerAvailable = this.interactions.hasHostAssetPicker()
    this.hostAssetUploaderAvailable = this.interactions.hasHostAssetUploader()
    this.assetPickerAvailable = this.interactions.canPickAsset()
    this.hostTextFilePickerAvailable = this.interactions.hasHostTextFilePicker()
    this.textFilePickerAvailable = this.interactions.canPickFileText()
  }

  get fontManager(): FontManager {
    return this.fontService.manager
  }

  get fontRevision(): number {
    return this.fontService.revision
  }

  setFontProvider(provider?: FontProvider): void {
    this.fontService.setProvider(provider)
    void this.preloadDocumentFonts()
  }

  setFontTarget(target?: Document | ShadowRoot): void {
    this.fontService.setTarget(target)
    void this.preloadDocumentFonts()
  }

  getFontStatus(family: string): FontLoadStatus {
    return this.fontService.getStatus(family)
  }

  getFontStatuses(families: string[], _revision = this.fontRevision): Record<string, FontLoadStatus> {
    return this.fontService.getStatuses(families)
  }

  async ensureFontLoaded(
    request: FontLoadRequest,
    options: { preloadGeneration?: number, reportDiagnostic?: boolean } = {},
  ): Promise<boolean> {
    return this.fontService.ensureLoaded(request, options)
  }

  async preloadDocumentFonts(): Promise<void> {
    await this.fontService.preloadDocumentFonts(this.schema)
  }

  // ─── Template Save Status ─────────────────────────────────────

  markDraftModified(): void {
    this.saveStatus.markDraftModified(this.workbench.status)
  }

  queueSave(): void {
    this.saveStatus.queueSave(this.workbench.status)
  }

  startSave(): void {
    this.saveStatus.startSave(this.workbench.status)
  }

  completeSave(): void {
    this.saveStatus.completeSave(this.workbench.status)
  }

  failSave(message?: string): void {
    this.saveStatus.failSave(this.workbench.status, message)
  }

  resetSaveIndicator(): void {
    this.saveStatus.resetSaveIndicator(this.workbench.status)
  }

  resetTemplateSaveState(): void {
    this.saveStatus.resetTemplateSaveState(this.workbench.status)
  }

  setFocusState(focus: StatusBarState['focus']): void {
    this.workbench.status.focus = focus
  }

  // ─── Generic extensions API ───────────────────────────────────
  // Read/write `schema.extensions[key]` without designer needing to
  // know about specific extension namespaces (e.g. ai, comments).

  /** Get an extension value by key. */
  getExtension<T = unknown>(key: string): T | undefined {
    return this.schema.extensions?.[key] as T | undefined
  }

  /** Set an extension value by key (mutates current schema reactively). */
  setExtension(key: string, value: unknown): void {
    this.documentTransactions.transact((draft) => {
      draft.extensions = { ...(draft.extensions ?? {}), [key]: value }
    }, { label: `Set extension ${key}`, operation: { kind: 'extension.set', sessionPath: [], targetIds: ['document'], fieldPaths: [`/extensions/${escapeJsonPointerToken(key)}`], selectionLineage: null, structural: false } })
  }

  /** Delete an extension value by key. */
  deleteExtension(key: string): void {
    this.documentTransactions.transact((draft) => {
      if (!draft.extensions)
        return
      const next = { ...draft.extensions }
      delete next[key]
      draft.extensions = next
    }, { label: `Delete extension ${key}`, operation: { kind: 'extension.delete', sessionPath: [], targetIds: ['document'], fieldPaths: [`/extensions/${escapeJsonPointerToken(key)}`], selectionLineage: null, structural: false } })
  }

  // ─── Element operations ───────────────────────────────────────

  getElements(): MaterialNode[] {
    return this.schema.elements
  }

  getElementGroups(): ElementGroupSchema[] {
    return this.schema.groups ?? []
  }

  getElementGroupById(groupId: string): ElementGroupSchema | undefined {
    return this.getElementGroups().find(group => group.id === groupId)
  }

  getElementGroupForElement(elementId: string): ElementGroupSchema | undefined {
    return this.getElementGroups().find(group => group.memberIds.includes(elementId))
  }

  getElementById(id: string): MaterialNode | undefined {
    return this.documentStore.index.getNode(id)
  }

  addElement(node: MaterialNode): void {
    this.documentTransactions.transact((draft) => {
      draft.elements.push(node)
    }, { label: 'Add element', operation: { kind: 'structure.insert', sessionPath: [], targetIds: [`node:${node.id}`], fieldPaths: ['/elements'], selectionLineage: null, structural: true } })
  }

  removeElement(id: string): MaterialNode | undefined {
    const idx = this.schema.elements.findIndex(el => el.id === id)
    if (idx < 0)
      return undefined
    const removed = this.schema.elements[idx]
    this.documentTransactions.transact((draft) => {
      draft.elements.splice(idx, 1)
      if (draft.groups) {
        draft.groups = draft.groups.map(group => ({ ...group, memberIds: group.memberIds.filter(memberId => memberId !== id) })).filter(group => group.memberIds.length >= 2)
      }
    }, { label: 'Remove element', operation: { kind: 'structure.remove', sessionPath: [], targetIds: [`node:${id}`], fieldPaths: ['/elements'], selectionLineage: null, structural: true } })
    this.selection.remove(id)
    if (this.editingSession.activeNodeId === id)
      this.editingSession.exit()
    return removed
  }

  updateElement(id: string, updates: Partial<MaterialNode>): void {
    if (!this.getElementById(id))
      return
    this.documentTransactions.run(id, (draft) => {
      Object.assign(draft, updates)
    }, { label: 'Update element', operation: { kind: 'material.property', sessionPath: [], targetIds: [`node:${id}`], fieldPaths: Object.keys(updates).map(key => `/${key}`) as any, selectionLineage: null, structural: false } })
  }

  async activateDesignerFacet(type: string) {
    const instance = await this.materialFacetHost.activate<MaterialDesignerFacet>(this.materialProfile, type, 'designer')
    this.designerFacetCache.set(type, instance)
    if (instance.state === 'active' && instance.value?.localeMessages && !this.designerFacetLocaleDisposers.has(instance)) {
      const unregister = this.registerLocaleMessages(instance.value.localeMessages as LocaleMessageRegistration)
      this.designerFacetLocaleDisposers.set(instance, unregister)
      this.designerFacetLocaleCleanups.add(unregister)
    }
    return instance
  }

  private releaseDesignerFacetLocale(instance: FacetInstance<unknown>): void {
    if (this.designerFacetCache.get(instance.materialType) === instance)
      this.designerFacetCache.delete(instance.materialType)
    const unregister = this.designerFacetLocaleDisposers.get(instance)
    if (!unregister)
      return
    this.designerFacetLocaleDisposers.delete(instance)
    this.designerFacetLocaleCleanups.delete(unregister)
    unregister()
  }

  peekDesignerFacet(type: string) {
    return this.designerFacetCache.get(type)
  }

  getMaterialManifest(type: string) {
    return this.materialProfile.getManifest(type)
  }

  getManifest(type: string) {
    return this.getMaterialManifest(type)
  }

  resolveMaterialIcon(iconKey: string): Component {
    return this.materialIcons[iconKey] ?? resolveBuiltinMaterialIcon(iconKey)
  }

  resolveMaterialGroupLabelKey(groupId: string): string {
    return builtinMaterialGroupLabels[groupId as keyof typeof builtinMaterialGroupLabels] ?? groupId
  }

  // ─── Material registry ────────────────────────────────────────

  // ─── Paper registry ───────────────────────────────────────────

  listPaperPresets(): PaperPreset[] {
    return this.paperRegistry.listPresets()
  }

  registerPaperPreset(preset: PaperPreset): void {
    this.paperRegistry.registerPreset(preset)
  }

  getPaperPreset(name: string): PaperPreset | undefined {
    return this.paperRegistry.getPreset(name)
  }

  getPaperPresetBySize(width: number, height: number): PaperPreset | undefined {
    return this.paperRegistry.resolveBySize(width, height)
  }

  notifyMaterialExtensionLoaded(): void {
    this.materialExtensionRevision += 1
  }

  // ─── Locale ───────────────────────────────────────────────────

  setLocale(locale: LocaleMessages, code?: string): void {
    this._locale = locale
    this._localeCode = code
  }

  registerLocaleMessages(registration: LocaleMessageRegistration): () => void {
    this._localeRegistrations.push(registration)
    return () => {
      const index = this._localeRegistrations.indexOf(registration)
      if (index >= 0)
        this._localeRegistrations.splice(index, 1)
    }
  }

  t(key: string): string {
    const own = this.lookupLocaleMessage(this._locale, key)
    if (own)
      return own

    for (const registration of this._localeRegistrations) {
      const registered = this.lookupLocaleMessage(this.resolveRegisteredLocaleMessages(registration), key)
      if (registered)
        return registered
    }

    return key
  }

  private resolveRegisteredLocaleMessages(registration: LocaleMessageRegistration): LocaleMessages | undefined {
    if (this._localeCode) {
      const locales = this.readOwnLocaleData(registration, 'locales')
      const current = this.readOwnLocaleData(locales, this._localeCode)
      if (current)
        return current as LocaleMessages
    }
    return this.readOwnLocaleData(registration, 'messages') as LocaleMessages | undefined
  }

  private lookupLocaleMessage(locale: LocaleMessages | undefined, key: string): string | undefined {
    if (!locale)
      return undefined
    const parts = key.split('.')
    let current: unknown = locale
    for (const part of parts) {
      current = this.readOwnLocaleData(current, part)
      if (current === undefined)
        return undefined
    }
    return typeof current === 'string' ? current : undefined
  }

  private readOwnLocaleData(value: unknown, key: string): unknown {
    if (typeof value !== 'object' || value === null)
      return undefined
    try {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)
      return descriptor?.enumerable === true && 'value' in descriptor ? descriptor.value : undefined
    }
    catch {
      return undefined
    }
  }

  // ─── Element geometry ───────────────────────────────────────────

  getElementSize(node: MaterialNode): { width: number, height: number } {
    return { width: node.width, height: node.height }
  }

  // ─── Editing Session ────────────────────────────────────────────

  /** Register the page DOM element provider (called by CanvasWorkspace on mount). */
  setPageElProvider(provider: () => HTMLElement | null): void {
    this._pageElProvider = provider
  }

  /** Get the page DOM element for coordinate conversion. */
  getPageEl(): HTMLElement | null {
    return this._pageElProvider()
  }

  /** Whether an editing session is active. */
  get isInDeepEditing(): boolean {
    return this.editingSession.isActive
  }

  /** Get the node ID being edited. */
  get deepEditingNodeId(): string | undefined {
    return this.editingSession.activeNodeId
  }

  // ─── Property Panel Overlay / Ephemeral Panel ─────────────────

  /** Set or clear the property panel overlay (called by material extensions). */
  setPropertyOverlay(overlay: PropertyPanelOverlay | null): void {
    this._propertyOverlay = overlay
  }

  /** Current active overlay pushed by a material extension. */
  get propertyOverlay(): PropertyPanelOverlay | null {
    return this._propertyOverlay
  }

  /** Set or clear the ephemeral panel (called by editing session). */
  setEphemeralPanel(panel: EphemeralPanelDef | null): void {
    this._ephemeralPanel = panel
  }

  /** Current active ephemeral panel. */
  get ephemeralPanel(): EphemeralPanelDef | null {
    return this._ephemeralPanel
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  destroy(): void {
    if (this.destroyed)
      return
    this.destroyed = true
    this.disposeDocumentSubscription?.()
    this.disposeDocumentSubscription = undefined
    this.disposeSelectionSubscription?.()
    this.disposeSelectionSubscription = undefined
    for (const unregister of this.designerFacetLocaleCleanups)
      unregister()
    this.designerFacetLocaleCleanups.clear()
    this.designerFacetCache.clear()
    void this.materialFacetHost.dispose()
    this.commands.clear()
    this.selection.clear()
    this.dataSourceRegistry.clear()
    this.fontService.clear()
    this.paperRegistry.clear()
    this.clipboard = []
    this._propertyOverlay = null
    this._ephemeralPanel = null
    this.setInteractionProvider(undefined)
    this.interactions.setFallbackProvider(undefined)
    this.refreshInteractionAvailability()
    this.editingSession.exit()
  }
}

function hasExplicitPageSize(input: DocumentSchemaInput | undefined): boolean {
  return typeof input?.page?.width === 'number' || typeof input?.page?.height === 'number'
}

function syncPageModelPaper(page: DocumentSchema['page'], updates: Partial<DocumentSchema['page']>): DocumentSchema['page']['pageModel'] {
  const current = page.pageModel ?? {
    kind: page.mode === 'continuous' ? 'continuous-paper' : 'paged-paper',
    paper: { width: page.width, height: page.height },
  }

  return {
    ...current,
    paper: {
      ...current.paper,
      ...(updates.width != null ? { width: updates.width } : {}),
      ...(updates.height != null ? { height: updates.height } : {}),
    },
  }
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value))
    return value.map(item => stripUndefined(item)).filter(item => item !== undefined) as T
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item !== undefined)
        result[key] = stripUndefined(item)
    }
    return result as T
  }
  return value
}

function escapeJsonPointerToken(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1')
}
