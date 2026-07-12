import type { CompiledMaterialProfile, EphemeralPanelDef, FacetInstance, FontLoadRequest, FontLoadStatus, FontManager, FontProvider, MaterialDesignerFacet, MaterialFacetHost, MaterialLoadDiagnostic, MaterialNodeLoadState, PropertyPanelOverlay, TransactionAPI } from '@easyink/core'
import type { DocumentSchema, DocumentSchemaInput, ElementGroupSchema, MaterialNode } from '@easyink/schema'
import type { PaperPreset } from '@easyink/shared'
import type { DesignerRuntimeConfig } from '../runtime-config'
import type { DesignerInteractionProvider, LocaleMessageRegistration, LocaleMessages, PreferenceProvider, SnapLine, StatusBarState } from '../types'
import { CommandManager, MaterialFacetHost as CoreMaterialFacetHost, loadDocumentWithProfile, SelectionModel, validateDocumentWithProfile } from '@easyink/core'
import { DataSourceRegistry } from '@easyink/datasource'
import { findNodeById } from '@easyink/schema'
import { markRaw } from 'vue'
import { EditingSessionManager } from '../editing/editing-session-manager'
import { createTransactionService } from '../editing/transaction-service'
import { DesignerInteractionService } from '../interactions/interaction-service'
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
  readonly materialProfile: CompiledMaterialProfile
  readonly propertyEditorRegistry = markRaw(new PropertyEditorRegistry())
  readonly materialFacetHost: MaterialFacetHost
  private readonly designerFacetCache = new Map<string, FacetInstance<MaterialDesignerFacet>>()
  // ─── Template state (enters Schema + command history) ─────────
  private _schema: DocumentSchema
  private _materialDiagnostics: readonly MaterialLoadDiagnostic[] = Object.freeze([])
  private _materialNodeStates: ReadonlyMap<string, MaterialNodeLoadState> = new Map()

  // ─── Core services ────────────────────────────────────────────
  readonly commands = new CommandManager()
  readonly selection = new SelectionModel()
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
    this.materialProfile = resolveDesignerMaterialProfile(runtimeConfig?.materials)
    this.materialFacetHost = markRaw(new CoreMaterialFacetHost())
    const loaded = loadDocumentWithProfile(schema, this.materialProfile)
    this._schema = loaded.schema
    this._materialDiagnostics = loaded.diagnostics
    this._materialNodeStates = loaded.nodeStates
    this.fontService = new FontService(this.diagnostics)
    this.materialTransaction = markRaw(createTransactionService(id => this.getElementById(id), this.commands, this.diagnostics))
    this.paperRegistry = new PaperRegistry(runtimeConfig?.paper)
    this.applyRuntimeDefaults(runtimeConfig, schema)
    this.setInteractionProvider(interactionProvider)
    // Mark editing session manager as raw: it owns Vue refs internally and
    // must not be auto-unwrapped by the surrounding reactive(store) proxy.
    this.editingSession = markRaw(new EditingSessionManager(this))
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
    return this._schema
  }

  get materialDiagnostics(): readonly MaterialLoadDiagnostic[] {
    return this._materialDiagnostics
  }

  get materialNodeStates(): ReadonlyMap<string, MaterialNodeLoadState> {
    return this._materialNodeStates
  }

  setSchema(schema?: DocumentSchemaInput): void {
    const loaded = loadDocumentWithProfile(schema, this.materialProfile)
    this._schema = loaded.schema
    this._materialDiagnostics = loaded.diagnostics
    this._materialNodeStates = loaded.nodeStates
    this.selection.clear()
    this.commands.clear()
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
    this._schema = candidate
    this._materialDiagnostics = report.diagnostics
    this._materialNodeStates = report.nodeStates
    return true
  }

  restoreSchemaFromHistory(candidate: DocumentSchema, targetNodeStates: ReadonlyMap<string, MaterialNodeLoadState>): boolean {
    const report = validateDocumentWithProfile(candidate, this.materialProfile, { mode: 'history-restore', targetNodeStates })
    if (!report.valid)
      return false
    this._schema = candidate
    this._materialDiagnostics = report.diagnostics
    this._materialNodeStates = report.nodeStates
    return true
  }

  private applyRuntimeDefaults(config: DesignerRuntimeConfig | undefined, input: DocumentSchemaInput | undefined): void {
    const defaults = config?.defaults
    if (defaults?.document)
      Object.assign(this._schema, defaults.document)

    const defaultPreset = this.paperRegistry.getDefaultPreset()
    if (defaultPreset && !hasExplicitPageSize(input)) {
      Object.assign(this._schema.page, {
        width: defaultPreset.width,
        height: defaultPreset.height,
        pageModel: syncPageModelPaper(this._schema.page, {
          width: defaultPreset.width,
          height: defaultPreset.height,
        }),
      })
    }

    if (defaults?.page) {
      Object.assign(this._schema.page, defaults.page)
      if (defaults.page.width != null || defaults.page.height != null)
        this._schema.page.pageModel = syncPageModelPaper(this._schema.page, defaults.page)
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
    await this.fontService.preloadDocumentFonts(this._schema)
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
    return this._schema.extensions?.[key] as T | undefined
  }

  /** Set an extension value by key (mutates current schema reactively). */
  setExtension(key: string, value: unknown): void {
    if (!this._schema.extensions) {
      this._schema.extensions = {}
    }
    this._schema.extensions[key] = value
  }

  /** Delete an extension value by key. */
  deleteExtension(key: string): void {
    if (this._schema.extensions) {
      delete this._schema.extensions[key]
    }
  }

  // ─── Element operations ───────────────────────────────────────

  getElements(): MaterialNode[] {
    return this._schema.elements
  }

  getElementGroups(): ElementGroupSchema[] {
    return this._schema.groups ?? []
  }

  getElementGroupById(groupId: string): ElementGroupSchema | undefined {
    return this.getElementGroups().find(group => group.id === groupId)
  }

  getElementGroupForElement(elementId: string): ElementGroupSchema | undefined {
    return this.getElementGroups().find(group => group.memberIds.includes(elementId))
  }

  getElementById(id: string): MaterialNode | undefined {
    return findNodeById(this._schema, id)
  }

  addElement(node: MaterialNode): void {
    this._schema.elements.push(node)
  }

  removeElement(id: string): MaterialNode | undefined {
    const idx = this._schema.elements.findIndex(el => el.id === id)
    if (idx < 0)
      return undefined
    const [removed] = this._schema.elements.splice(idx, 1)
    if (this._schema.groups) {
      this._schema.groups = this._schema.groups
        .map(group => ({
          ...group,
          memberIds: group.memberIds.filter(memberId => memberId !== id),
        }))
        .filter(group => group.memberIds.length >= 2)
    }
    this.selection.remove(id)
    if (this.editingSession.activeNodeId === id) {
      this.editingSession.exit()
    }
    return removed
  }

  updateElement(id: string, updates: Partial<MaterialNode>): void {
    const el = this.getElementById(id)
    if (!el)
      return
    Object.assign(el, updates)
  }

  async activateDesignerFacet(type: string) {
    const instance = await this.materialFacetHost.activate<MaterialDesignerFacet>(this.materialProfile, type, 'designer')
    this.designerFacetCache.set(type, instance)
    return instance
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

  listEditableMaterialTypes(): readonly string[] {
    return [...this.materialProfile.editableTypes]
  }

  listEditableMaterialManifests() {
    return this.listEditableMaterialTypes().map(type => this.materialProfile.getManifest(type)!).filter(Boolean)
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
      const current = registration.locales?.[this._localeCode]
      if (current)
        return current
    }
    return registration.messages
  }

  private lookupLocaleMessage(locale: LocaleMessages | undefined, key: string): string | undefined {
    if (!locale)
      return undefined
    const parts = key.split('.')
    let current: unknown = locale
    for (const part of parts) {
      if (typeof current !== 'object' || current === null)
        return undefined
      current = (current as Record<string, unknown>)[part]
    }
    return typeof current === 'string' ? current : undefined
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
