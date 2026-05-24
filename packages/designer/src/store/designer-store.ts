import type { EphemeralPanelDef, FontLoadRequest, FontLoadStatus, FontManager, FontProvider, PropertyPanelOverlay } from '@easyink/core'
import type { DocumentSchema, DocumentSchemaInput, ElementGroupSchema, MaterialNode } from '@easyink/schema'
import type { DesignerInteractionProvider, LocaleMessages, MaterialCatalogEntry, MaterialDefinition, MaterialDesignerExtension, MaterialExtensionFactory, PreferenceProvider, SnapLine, StatusBarState } from '../types'
import { CommandManager, SelectionModel } from '@easyink/core'
import { DataSourceRegistry } from '@easyink/datasource'
import { normalizeDocumentSchema } from '@easyink/schema'
import { markRaw } from 'vue'
import { EditingSessionManager } from '../editing/editing-session-manager'
import { DesignerInteractionService } from '../interactions/interaction-service'
import { DiagnosticsChannel } from './diagnostics'
import { FontService } from './font-service'
import { MaterialRegistry } from './material-registry'
import { applyPersistedWorkbench, loadWorkbenchPreferences } from './preference-persistence'
import { SaveStatusManager } from './save-status-manager'
import { createDefaultSaveBranchMenu, createDefaultWorkbenchState } from './workbench'

/**
 * DesignerStore is the central state manager for the designer.
 * It composes template state, workbench state, and interaction context.
 */
export class DesignerStore {
  // ─── Template state (enters Schema + command history) ─────────
  private _schema: DocumentSchema

  // ─── Core services ────────────────────────────────────────────
  readonly commands = new CommandManager()
  readonly selection = new SelectionModel()
  readonly dataSourceRegistry = new DataSourceRegistry()
  readonly interactions = markRaw(new DesignerInteractionService())

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

  readonly materialRegistry: MaterialRegistry

  // ─── Editing Session Manager ─────────────────────────────────────
  readonly editingSession: EditingSessionManager

  // ─── Property panel overlay / ephemeral panel ──────────────────
  private _propertyOverlay: PropertyPanelOverlay | null = null
  private _ephemeralPanel: EphemeralPanelDef | null = null

  // ─── Page element provider (for coordinate conversion) ──────
  private _pageElProvider: () => HTMLElement | null = () => null

  // ─── Locale ───────────────────────────────────────────────────
  private _locale?: LocaleMessages

  constructor(schema?: DocumentSchemaInput, preferenceProvider?: PreferenceProvider, interactionProvider?: DesignerInteractionProvider) {
    this._schema = normalizeDocumentSchema(schema)
    this.fontService = new FontService(this.diagnostics)
    this.materialRegistry = new MaterialRegistry()
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

  setSchema(schema?: DocumentSchemaInput): void {
    this._schema = normalizeDocumentSchema(schema)
    this.selection.clear()
    this.commands.clear()
    this.editingSession.exit()
    void this.preloadDocumentFonts()
  }

  setInteractionProvider(provider?: DesignerInteractionProvider): void {
    this.interactions.setProvider(provider)
    this.refreshInteractionAvailability()
  }

  refreshInteractionAvailability(): void {
    this.hostAssetPickerAvailable = this.interactions.hasHostAssetPicker()
    this.hostAssetUploaderAvailable = this.interactions.hasHostAssetUploader()
    this.assetPickerAvailable = this.interactions.canPickAsset()
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
    return this._schema.elements.find(el => el.id === id)
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

  // ─── Material registry ────────────────────────────────────────

  registerMaterial(definition: MaterialDefinition): void {
    this.materialRegistry.registerMaterial(definition)
  }

  getMaterial(type: string): MaterialDefinition | undefined {
    return this.materialRegistry.getMaterial(type)
  }

  registerCatalogEntry(entry: MaterialCatalogEntry): void {
    this.materialRegistry.registerCatalogEntry(entry)
  }

  getCatalog(): MaterialCatalogEntry[] {
    return this.materialRegistry.getCatalog()
  }

  getQuickMaterials(): MaterialCatalogEntry[] {
    return this.materialRegistry.getQuickMaterials()
  }

  getGroupedMaterials(group: string): MaterialCatalogEntry[] {
    return this.materialRegistry.getGroupedMaterials(group)
  }

  // ─── Extension Factory Registry ─────────────────────────────────

  registerDesignerFactory(type: string, factory: MaterialExtensionFactory): void {
    this.materialRegistry.registerDesignerFactory(type, factory)
  }

  /** Get or lazily instantiate an extension from its factory. */
  getDesignerExtension(type: string): MaterialDesignerExtension | undefined {
    return this.materialRegistry.getDesignerExtension(type, this)
  }

  // ─── Locale ───────────────────────────────────────────────────

  setLocale(locale: LocaleMessages): void {
    this._locale = locale
  }

  t(key: string): string {
    if (!this._locale)
      return key
    const parts = key.split('.')
    let current: unknown = this._locale
    for (const part of parts) {
      if (typeof current !== 'object' || current === null)
        return key
      current = (current as Record<string, unknown>)[part]
    }
    return typeof current === 'string' ? current : key
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
    this.materialRegistry.clear()
    this.clipboard = []
    this._propertyOverlay = null
    this._ephemeralPanel = null
    this.setInteractionProvider(undefined)
    this.interactions.setFallbackProvider(undefined)
    this.refreshInteractionAvailability()
    this.editingSession.exit()
  }
}
