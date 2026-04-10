import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { DeepEditingRuntimeState, LocaleMessages, MaterialCatalogEntry, MaterialDefinition, MaterialDesignerExtension, MaterialExtensionFactory, PreferenceProvider } from '../types'
import { CommandManager, SelectionModel } from '@easyink/core'
import { DataSourceRegistry } from '@easyink/datasource'
import { createDefaultSchema } from '@easyink/schema'
import { markRaw } from 'vue'
import { createMaterialExtensionContext } from '../materials/extension-context'
import { applyPersistedWorkbench, loadWorkbenchPreferences } from './preference-persistence'
import { createDefaultDeepEditing, createDefaultSaveBranchMenu, createDefaultWorkbenchState } from './workbench'

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

  // ─── Clipboard (internal, not in Schema) ──────────────────────
  clipboard: MaterialNode[] = []

  // ─── Workbench state (NOT in Schema, NOT in undo/redo) ───────
  readonly workbench = createDefaultWorkbenchState()
  readonly saveBranch = createDefaultSaveBranchMenu()

  // ─── Material registry ────────────────────────────────────────
  private _materials = new Map<string, MaterialDefinition>()
  private _materialFactories = new Map<string, MaterialExtensionFactory>()
  private _cachedExtensions = new Map<string, MaterialDesignerExtension>()
  private _catalog: MaterialCatalogEntry[] = []

  // ─── Generic deep editing ─────────────────────────────────────
  readonly deepEditing: DeepEditingRuntimeState = createDefaultDeepEditing()
  /** Registered callback for FSM-level cleanup before resetting deep editing state. */
  private _deepEditingCleanup: (() => void) | null = null

  // ─── Page element provider (for coordinate conversion) ──────
  private _pageElProvider: () => HTMLElement | null = () => null

  // ─── Locale ───────────────────────────────────────────────────
  private _locale?: LocaleMessages

  constructor(schema?: DocumentSchema, preferenceProvider?: PreferenceProvider) {
    this._schema = schema || createDefaultSchema()
    markRaw(this._materials)
    markRaw(this._materialFactories)
    markRaw(this._cachedExtensions)
    markRaw(this.dataSourceRegistry)

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

  setSchema(schema: DocumentSchema): void {
    this._schema = schema
    this.selection.clear()
    this.commands.clear()
    this.exitDeepEditing()
  }

  // ─── Element operations ───────────────────────────────────────

  getElements(): MaterialNode[] {
    return this._schema.elements
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
    if (this.deepEditing.nodeId === id) {
      this.exitDeepEditing()
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
    this._materials.set(definition.type, definition)
  }

  getMaterial(type: string): MaterialDefinition | undefined {
    return this._materials.get(type)
  }

  registerCatalogEntry(entry: MaterialCatalogEntry): void {
    this._catalog.push(entry)
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

  // ─── Visual geometry ─────────────────────────────────────────────

  /** Visual height in the designer, accounting for virtual content (e.g. placeholder rows). Falls back to node.height. */
  getVisualHeight(node: MaterialNode): number {
    const ext = this.getDesignerExtension(node.type)
    return ext?.getVisualHeight?.(node) ?? node.height
  }

  // ─── Deep Editing ───────────────────────────────────────────────

  /** Register the page DOM element provider (called by CanvasWorkspace on mount). */
  setPageElProvider(provider: () => HTMLElement | null): void {
    this._pageElProvider = provider
  }

  /** Get the page DOM element for coordinate conversion. */
  getPageEl(): HTMLElement | null {
    return this._pageElProvider()
  }

  /** Whether a deep editing session is active. */
  get isInDeepEditing(): boolean {
    return this.deepEditing.nodeId !== undefined
  }

  /** Get the node ID being deep-edited. */
  get deepEditingNodeId(): string | undefined {
    return this.deepEditing.nodeId
  }

  /** Enter deep editing for an element with a declared FSM. */
  enterDeepEditing(nodeId: string): boolean {
    const node = this.getElementById(nodeId)
    if (!node)
      return false

    const ext = this.getDesignerExtension(node.type)
    if (!ext?.deepEditing)
      return false

    // Deep editing and multi-selection are mutually exclusive
    this.selection.clear()
    this.selection.add(nodeId)

    this.deepEditing.nodeId = nodeId
    this.deepEditing.materialType = node.type
    this.deepEditing.currentPhase = ext.deepEditing.initialPhase
    this.deepEditing.materialState = undefined
    return true
  }

  /** Exit deep editing, reset to idle. */
  exitDeepEditing(): void {
    if (this._deepEditingCleanup) {
      this._deepEditingCleanup()
    }
    this.deepEditing.nodeId = undefined
    this.deepEditing.materialType = undefined
    this.deepEditing.currentPhase = undefined
    this.deepEditing.materialState = undefined
  }

  /** Register a callback for FSM-level phase cleanup (called before state reset in exitDeepEditing). */
  setDeepEditingCleanup(fn: (() => void) | null): void {
    this._deepEditingCleanup = fn
  }

  /** Transition to a specific phase within the active deep editing FSM. */
  transitionPhase(phaseId: string): void {
    if (!this.deepEditing.nodeId)
      return
    this.deepEditing.currentPhase = phaseId
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
    this.exitDeepEditing()
  }
}
