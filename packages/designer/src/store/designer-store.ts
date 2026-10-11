import type { EphemeralPanelDef, FontLoadRequest, FontLoadStatus, FontManager, FontProvider, PropertyPanelOverlay } from '@easyink/core'
import type { DeepReadonly } from '@easyink/plugin-api'
import type { DesignerCommand, DesignerContext, MaterialPropertiesContext } from '@easyink/plugin-api/designer'
import type { LocaleTree } from '@easyink/plugin-api/material'
import type { DesignerExtension, DesignerMaterial } from '@easyink/plugin-api/ui'
import type { CapabilityPoint, CleanupError, ConsumerContext, ContributionOwner, DisposeResult, HostRegistry } from '@easyink/plugin-runtime'
import type { DocumentSchema, DocumentSchemaInput, ElementGroupSchema, MaterialNode } from '@easyink/schema'
import type { PaperPreset } from '@easyink/shared'
import type { DesignerRendererOperations } from '../materials/renderer-context'
import type { DesignerRuntimeConfig } from '../runtime-config'
import type { DesignerInteractionProvider, MaterialCatalogEntry, MaterialCatalogGroup, MaterialDefinition, MaterialDesignerExtension, PreferenceProvider, SnapLine, StatusBarState } from '../types'
import { CommandManager, SelectionModel } from '@easyink/core'
import { DataSourceRegistry } from '@easyink/datasource'
import { builtinLocales, zhCN } from '@easyink/locales'
import { findNodeById, normalizeDocumentSchema } from '@easyink/schema'
import { deepClone } from '@easyink/shared'
import { markRaw, reactive } from 'vue'
import { EditingSessionManager } from '../editing/editing-session-manager'
import { DesignerInteractionService } from '../interactions/interaction-service'
import { createDesignerMaterialHost } from '../materials/host-consumer'
import { createDesignerContext } from '../materials/renderer-context'
import { createStoreRendererOperations } from '../materials/store-operations'
import { UIMountScope } from '../materials/ui-mount-scope'
import { DiagnosticsChannel } from './diagnostics'
import { FontService } from './font-service'
import { LOADING_EXTENSION, MaterialConsumer } from './material-consumer'
import { PaperRegistry } from './paper-registry'
import { applyPersistedWorkbench, loadWorkbenchPreferences } from './preference-persistence'
import { SaveStatusManager } from './save-status-manager'
import { createDefaultSaveBranchMenu, createDefaultWorkbenchState } from './workbench'

export interface DesignerCreateOptions {
  schema?: DocumentSchemaInput
  materials?: readonly DesignerMaterial[]
  extensions?: readonly DesignerExtension[]
  locale?: { code?: string, messages?: LocaleTree }
  dataSources?: readonly import('@easyink/datasource').DataSourceDescriptor[]
  fontProvider?: FontProvider
  preferenceProvider?: PreferenceProvider
  interactionProvider?: DesignerInteractionProvider
  runtimeConfig?: DesignerRuntimeConfig
}

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

  private _materialConsumer!: MaterialConsumer
  private _assembly!: Awaited<ReturnType<typeof createDesignerMaterialHost<DesignerMaterial>>>
  private _consumerResources!: ConsumerContext
  private _registry!: HostRegistry<DesignerMaterial>
  private _rendererOperations!: DesignerRendererOperations
  private readonly _contexts = markRaw(new Map<string, DesignerContext>())
  private readonly _contextTokens = markRaw(new Map<string, object>())
  private readonly _uiMounts = markRaw(new Set<UIMountScope>())
  private readonly _uiCleanupErrors = markRaw<CleanupError[]>([])
  private _destruction?: Promise<DisposeResult>
  private _disposed = false
  private readonly _loadingTypes = markRaw(new Set<string>())
  localeRevision = 0
  readonly paperRegistry: PaperRegistry

  // ─── Editing Session Manager ─────────────────────────────────────
  readonly editingSession: EditingSessionManager

  // ─── Property panel overlay / ephemeral panel ──────────────────
  private _propertyOverlay: PropertyPanelOverlay | null = null
  private _ephemeralPanel: EphemeralPanelDef | null = null

  // ─── Page element provider (for coordinate conversion) ──────
  private _pageElProvider: () => HTMLElement | null = () => null

  private constructor(
    schema?: DocumentSchemaInput,
    preferenceProvider?: PreferenceProvider,
    interactionProvider?: DesignerInteractionProvider,
    runtimeConfig?: DesignerRuntimeConfig,
  ) {
    this._schema = normalizeDocumentSchema(schema)
    this.fontService = new FontService(this.diagnostics)
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

  static async create(options: DesignerCreateOptions = {}): Promise<DesignerStore> {
    let store!: DesignerStore
    const assembly = await createDesignerMaterialHost({
      kind: 'designer',
      materials: options.materials ?? [],
      extensions: [{ id: 'easyink.framework', locale: { messages: zhCN, locales: builtinLocales } }, ...(options.extensions ?? [])],
      locale: options.locale,
    }, (registry, resources) => {
      store = reactive(new DesignerStore(options.schema, options.preferenceProvider, options.interactionProvider, options.runtimeConfig)) as DesignerStore
      store.editingSession.setStore(store)
      store._registry = markRaw(registry)
      store._consumerResources = markRaw(resources)
      store._materialConsumer = markRaw(new MaterialConsumer(registry))
      const cleanups = [
        () => store.editingSession.exit(),
        () => store.commands.clear(),
        () => store.selection.clear(),
        () => store.dataSourceRegistry.clear(),
        () => store.fontService.clear(),
        () => store.paperRegistry.clear(),
        () => { store.clipboard = [] },
        () => {
          store._propertyOverlay = null
          store._ephemeralPanel = null
        },
        () => {
          store.setInteractionProvider(undefined)
          store.interactions.setFallbackProvider(undefined)
          store.refreshInteractionAvailability()
        },
        () => store._loadingTypes.clear(),
        () => store._contexts.clear(),
        () => store._contextTokens.clear(),
      ]
      // Scope cleanup is reverse ordered; all framework consumers stop independently.
      for (const cleanup of cleanups.reverse())
        resources.onDispose(cleanup)
      resources.onDispose(async () => {
        for (const mount of [...store._uiMounts].reverse())
          await mount.dispose()
        store._uiMounts.clear()
      })
      let invalidationFailure: { cause: unknown } | undefined
      resources.onDispose(() => {
        if (invalidationFailure)
          throw invalidationFailure.cause
      })
      resources.signal.addEventListener('abort', () => {
        store._disposed = true
        try {
          store.fontService.clear()
        }
        catch (cause) { invalidationFailure = { cause } }
      }, { once: true })
      store.setFontProvider(options.fontProvider)
      for (const source of options.dataSources ?? [])
        store.dataSourceRegistry.registerSource(deepClone(source))
      store._rendererOperations = markRaw(createStoreRendererOperations(store, {
        getMaterials: () => registry.materials.map(entry => entry.value),
        t: resources.t,
        executeCommand: (command, args) => store.executePluginCommand(command, args),
      }))
      return store._rendererOperations
    })
    store._assembly = markRaw(assembly)
    return store
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
    this.assertActive()
    this.fontService.setProvider(provider)
    void this.preloadDocumentFonts()
  }

  setFontTarget(target?: Document | ShadowRoot): void {
    this.assertActive()
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
    this.assertActive()
    return this.fontService.ensureLoaded(request, options)
  }

  async preloadDocumentFonts(): Promise<void> {
    this.assertActive()
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

  // ─── Material registry ────────────────────────────────────────

  getMaterial(type: string): MaterialDefinition | undefined {
    return this._materialConsumer.getMaterial(type)
  }

  listMaterials(): MaterialDefinition[] {
    return this._materialConsumer.listMaterials()
  }

  getCatalog(): MaterialCatalogEntry[] {
    return this._materialConsumer.getCatalog()
  }

  getCatalogGroups(): MaterialCatalogGroup[] {
    return this._materialConsumer.getCatalogGroups()
  }

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

  // ─── Extension Factory Registry ─────────────────────────────────

  /** Get or lazily instantiate an extension from its factory. */
  getDesignerExtension(type: string): MaterialDesignerExtension | undefined {
    this.assertActive()
    const cached = this._assembly.peekExtension(type)
    if (cached)
      return cached
    if (!this._registry.getMaterial(type)?.value.loadRenderer)
      return undefined
    if (!this._loadingTypes.has(type)) {
      this._loadingTypes.add(type)
      void this._assembly.getExtension(type).then(() => {
        if (!this._disposed)
          this.notifyMaterialExtensionLoaded()
      }).catch((cause) => {
        if (!this._disposed)
          this.diagnostics.push({ source: 'material-extension', severity: 'error', message: `Lazy material failed: ${type}`, detail: { cause } })
      }).finally(() => this._loadingTypes.delete(type))
    }
    return LOADING_EXTENSION
  }

  notifyMaterialExtensionLoaded(): void {
    this.materialExtensionRevision += 1
  }

  // ─── Locale ───────────────────────────────────────────────────

  setLocale(locale?: LocaleTree, code?: string): void {
    this.assertActive()
    this._assembly.host.setLocale(code, locale)
    this.localeRevision++
  }

  t(key: string): string {
    void this.localeRevision
    this.assertActive()
    return this._consumerResources.t(key)
  }

  get localeDiagnostics() {
    return this._assembly.host.localeDiagnostics
  }

  getMaterialDeclarations(): readonly DeepReadonly<DesignerMaterial>[] {
    this.assertActive()
    return this._registry.materials.map(entry => entry.value)
  }

  getContributions(point: CapabilityPoint) {
    this.assertActive()
    return this._registry.contributions(point)
  }

  getExtensionContext(owner: ContributionOwner): DesignerContext {
    this.assertActive()
    const key = `${owner.installationId}:${owner.pluginId}`
    const cached = this._contexts.get(key)
    if (cached)
      return cached
    const context = createDesignerContext(this._rendererOperations, this._consumerResources.resources(owner), this.contextToken(owner))
    this._contexts.set(key, context)
    return context
  }

  /** Framework UI consumers own a shorter context for each component mount. */
  mountUIContext(owner: ContributionOwner) {
    this.assertActive()
    const scope = markRaw(new UIMountScope(this._consumerResources.resources(owner), owner, this._uiCleanupErrors))
    this._uiMounts.add(scope)
    const context = createDesignerContext(this._rendererOperations, scope.resources, this.contextToken(owner))
    return {
      context,
      dispose: () => {
        const result = scope.dispose()
        void result.then(() => this._uiMounts.delete(scope))
        return result
      },
    }
  }

  mountPropertiesContext(owner: ContributionOwner, nodeId: string, getRoot: () => HTMLElement | null) {
    const mount = this.mountUIContext(owner)
    const node = this.getElementById(nodeId)
    const session = this.editingSession.activeSession
    const assertTarget = () => {
      mount.context.signal.throwIfAborted()
      if (!node || node !== this.getElementById(nodeId) || this.selection.ids.length !== 1 || this.selection.ids[0] !== nodeId || this.editingSession.activeSession !== session || node.locked || node.hidden)
        throw new Error('Material properties target is no longer current')
    }
    const context: MaterialPropertiesContext = Object.freeze({
      signal: mount.context.signal,
      onDispose: mount.context.onDispose,
      getSchema: mount.context.getSchema,
      getNode: mount.context.getNode,
      getSelection: mount.context.getSelection,
      isEditing: mount.context.isEditing,
      getDataSources: mount.context.getDataSources,
      getMaterials: mount.context.getMaterials,
      getBindingLabel: mount.context.getBindingLabel,
      t: mount.context.t,
      get node() {
        assertTarget()
        return mount.context.getNode(nodeId)!
      },
      tx: Object.freeze<MaterialPropertiesContext['tx']>({
        run: <TNode extends MaterialNode>(id: string, mutator: (draft: TNode) => void, options?: import('@easyink/core').TxOptions) => {
          assertTarget()
          if (id !== nodeId)
            throw new Error('Material properties may only edit their current node')
          mount.context.tx.run<TNode>(id, (draft) => {
            mutator(draft)
            assertTarget()
          }, options)
          this.markDraftModified()
        },
        batch: (run) => {
          assertTarget()
          return mount.context.tx.batch(() => {
            const result = run()
            assertTarget()
            return result
          })
        },
      }),
      flushPendingEdits: () => {
        assertTarget()
        const active = document.activeElement
        if (active instanceof HTMLElement && (getRoot()?.contains(active) || this.getPageEl()?.contains(active)))
          active.blur()
      },
    })
    return { context, dispose: mount.dispose }
  }

  private async executePluginCommand<TArgs, TResult>(command: DesignerCommand<TArgs, TResult>, args: TArgs): Promise<TResult> {
    this.assertActive()
    const entry = this._registry.getCommand(command.id)
    if (!entry || entry.value.handler !== command.handler)
      throw new Error(`Command is not installed: ${command.id}`)
    const context = this.getExtensionContext(entry.owner)
    context.signal.throwIfAborted()
    const installed = entry.value as DeepReadonly<DesignerCommand<TArgs, TResult>>
    const result = await installed.handler(args, context)
    this.assertActive()
    context.signal.throwIfAborted()
    return result
  }

  private assertActive(): void {
    if (this._disposed)
      throw new Error('Designer is disposed')
  }

  private contextToken(owner: ContributionOwner): object {
    const key = `${owner.installationId}:${owner.pluginId}`
    let token = this._contextTokens.get(key)
    if (!token) {
      token = {}
      this._contextTokens.set(key, token)
    }
    return token
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

  destroy(): Promise<DisposeResult> {
    if (this._destruction)
      return this._destruction
    this._disposed = true
    this._destruction = this._assembly.destroy().then(result => Object.freeze({ errors: Object.freeze([...result.errors, ...this._uiCleanupErrors]) }))
    return this._destruction
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
