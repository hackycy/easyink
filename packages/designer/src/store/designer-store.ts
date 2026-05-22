import type { EphemeralPanelDef, PropertyPanelOverlay } from '@easyink/core'
import type { DocumentSchema, DocumentSchemaInput, ElementGroupSchema, MaterialNode } from '@easyink/schema'
import type { DesignerInteractionProvider, LocaleMessages, MaterialCatalogEntry, MaterialDefinition, MaterialDesignerExtension, MaterialExtensionFactory, PreferenceProvider, SnapLine, StatusBarState } from '../types'
import { CommandManager, FontManager, SelectionModel } from '@easyink/core'
import { DataSourceRegistry } from '@easyink/datasource'
import { normalizeDocumentSchema } from '@easyink/schema'
import { markRaw } from 'vue'
import { EditingSessionManager } from '../editing/editing-session-manager'
import { DesignerInteractionService } from '../interactions/interaction-service'
import { createMaterialExtensionContext } from '../materials/extension-context'
import { DiagnosticsChannel } from './diagnostics'
import { applyPersistedWorkbench, loadWorkbenchPreferences } from './preference-persistence'
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
  readonly fontManager = new FontManager()
  // ─── Clipboard (internal, not in Schema) ──────────────────────
  clipboard: MaterialNode[] = []

  // ─── Workbench state (NOT in Schema, NOT in undo/redo) ───────
  readonly workbench = createDefaultWorkbenchState()
  readonly saveBranch = createDefaultSaveBranchMenu()

  /**
   * Active snap-line feedback for the overlay. Held as a top-level field
   * (outside `workbench.snap`) and reassigned each frame with a `markRaw`
   * array so the surrounding `reactive(store)` proxy notifies on the
   * single property write but never deep-tracks individual SnapLine
   * fields. Reading sites consume this directly; the property reassignment
   * itself is reactive.
   */
  snapActiveLines: readonly SnapLine[] = []

  // ─── Material registry ────────────────────────────────────────
  private _materials = new Map<string, MaterialDefinition>()
  private _materialFactories = new Map<string, MaterialExtensionFactory>()
  private _cachedExtensions = new Map<string, MaterialDesignerExtension>()
  private _catalog: MaterialCatalogEntry[] = []

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
    this.interactions.setProvider(interactionProvider)
    // Mark editing session manager as raw: it owns Vue refs internally and
    // must not be auto-unwrapped by the surrounding reactive(store) proxy.
    this.editingSession = markRaw(new EditingSessionManager(this))
    markRaw(this._materials)
    markRaw(this._materialFactories)
    markRaw(this._cachedExtensions)
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
  }

  // ─── Template Save Status ─────────────────────────────────────

  markDraftModified(): void {
    this.workbench.status.draft = 'modified'
  }

  queueSave(): void {
    this.workbench.status.draft = 'modified'
    this.workbench.status.savePhase = 'queued'
    this.workbench.status.saveMessage = undefined
  }

  startSave(): void {
    this.workbench.status.savePhase = 'saving'
    this.workbench.status.saveMessage = undefined
  }

  completeSave(): void {
    this.workbench.status.draft = 'clean'
    this.workbench.status.savePhase = 'success'
    this.workbench.status.saveMessage = undefined
    this.workbench.status.saveUpdatedAt = Date.now()
  }

  failSave(message?: string): void {
    this.workbench.status.draft = 'modified'
    this.workbench.status.savePhase = 'failed'
    this.workbench.status.saveMessage = message
    this.workbench.status.saveUpdatedAt = Date.now()
  }

  resetSaveIndicator(): void {
    this.workbench.status.savePhase = 'idle'
    this.workbench.status.saveMessage = undefined
  }

  resetTemplateSaveState(): void {
    this.workbench.status.draft = 'clean'
    this.workbench.status.savePhase = 'idle'
    this.workbench.status.saveMessage = undefined
    this.workbench.status.saveUpdatedAt = undefined
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
    this._materials.set(definition.type, markRaw({
      ...definition,
      icon: markRaw(definition.icon),
    }))
  }

  getMaterial(type: string): MaterialDefinition | undefined {
    return this._materials.get(type)
  }

  registerCatalogEntry(entry: MaterialCatalogEntry): void {
    this._catalog.push(markRaw({
      ...entry,
      icon: markRaw(entry.icon),
    }))
  }

  getCatalog(): MaterialCatalogEntry[] {
    return this._catalog
  }

  getQuickMaterials(): MaterialCatalogEntry[] {
    return this._catalog.filter(e => e.priority === 'quick')
  }

  getGroupedMaterials(group: string): MaterialCatalogEntry[] {
    return this._catalog.filter(e => e.group === group && e.priority !== 'quick')
  }

  // ─── Extension Factory Registry ─────────────────────────────────

  registerDesignerFactory(type: string, factory: MaterialExtensionFactory): void {
    this._materialFactories.set(type, factory)
  }

  /** Get or lazily instantiate an extension from its factory. */
  getDesignerExtension(type: string): MaterialDesignerExtension | undefined {
    let ext = this._cachedExtensions.get(type)
    if (ext)
      return ext

    const factory = this._materialFactories.get(type)
    if (!factory)
      return undefined

    const context = createMaterialExtensionContext(this)
    ext = factory(context)
    this._cachedExtensions.set(type, ext)
    return ext
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
    this._materials.clear()
    this._materialFactories.clear()
    this._cachedExtensions.clear()
    this._catalog = []
    this.clipboard = []
    this._propertyOverlay = null
    this._ephemeralPanel = null
    this.interactions.setProvider(undefined)
    this.interactions.setFallbackProvider(undefined)
    this.editingSession.exit()
  }
}
