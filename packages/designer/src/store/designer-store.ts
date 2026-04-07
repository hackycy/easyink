import type { DocumentSchema, MaterialNode, TableNode } from '@easyink/schema'
import type { TableSectionKind } from '@easyink/shared'
import type { LocaleMessages, MaterialCatalogEntry, MaterialDefinition, MaterialDesignerExtension, PreferenceProvider } from '../types'
import { CommandManager, SelectionModel } from '@easyink/core'
import { DataSourceRegistry } from '@easyink/datasource'
import { createDefaultSchema, isTableNode } from '@easyink/schema'
import { markRaw } from 'vue'
import { applyPersistedWorkbench, loadWorkbenchPreferences } from './preference-persistence'
import { createDefaultSaveBranchMenu, createDefaultTableEditing, createDefaultWorkbenchState } from './workbench'

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
  readonly tableEditing = createDefaultTableEditing()
  readonly saveBranch = createDefaultSaveBranchMenu()

  // ─── Material registry ────────────────────────────────────────
  private _materials = new Map<string, MaterialDefinition>()
  private _materialDesignerExtensions = new Map<string, MaterialDesignerExtension>()
  private _catalog: MaterialCatalogEntry[] = []

  // ─── Locale ───────────────────────────────────────────────────
  private _locale?: LocaleMessages

  constructor(schema?: DocumentSchema, preferenceProvider?: PreferenceProvider) {
    this._schema = schema || createDefaultSchema()
    markRaw(this._materials)
    markRaw(this._materialDesignerExtensions)
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
    // Exit deep editing if the removed element was being edited
    if (this.tableEditing.tableId === id) {
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

  registerDesignerExtension(type: string, ext: MaterialDesignerExtension): void {
    this._materialDesignerExtensions.set(type, ext)
  }

  getDesignerExtension(type: string): MaterialDesignerExtension | undefined {
    return this._materialDesignerExtensions.get(type)
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

  // ─── Deep Editing ───────────────────────────────────────────────

  get isInDeepEditing(): boolean {
    return this.tableEditing.phase !== 'idle'
  }

  get deepEditingNodeId(): string | undefined {
    return this.tableEditing.tableId
  }

  /** Enter deep editing for a table element. Validates capability, clears multi-selection. */
  enterDeepEditing(nodeId: string): boolean {
    const node = this.getElementById(nodeId)
    if (!node)
      return false

    const def = this.getMaterial(node.type)
    if (!def?.capabilities.hasDeepEditing)
      return false

    // Deep editing and multi-selection are mutually exclusive
    this.selection.clear()
    this.selection.add(nodeId)

    this.tableEditing.phase = 'table-selected'
    this.tableEditing.tableId = nodeId
    this.tableEditing.sectionKind = undefined
    this.tableEditing.cellPath = undefined
    return true
  }

  /** Exit deep editing, reset to idle. */
  exitDeepEditing(): void {
    this.tableEditing.phase = 'idle'
    this.tableEditing.tableId = undefined
    this.tableEditing.sectionKind = undefined
    this.tableEditing.cellPath = undefined
  }

  /** Select a cell in the current deep-editing table. */
  selectCell(row: number, col: number): void {
    if (!this.tableEditing.tableId)
      return

    this.tableEditing.phase = 'cell-selected'
    this.tableEditing.cellPath = { row, col }

    // Infer section kind from bands
    const node = this.getElementById(this.tableEditing.tableId)
    if (node && isTableNode(node)) {
      this.tableEditing.sectionKind = inferSectionKind(node, row)
    }
  }

  /** Enter content editing mode for the currently selected cell. */
  enterContentEditing(): void {
    if (this.tableEditing.phase !== 'cell-selected' || !this.tableEditing.cellPath)
      return
    this.tableEditing.phase = 'content-editing'
  }

  /** Exit content editing back to cell-selected. */
  exitContentEditing(): void {
    if (this.tableEditing.phase !== 'content-editing')
      return
    this.tableEditing.phase = 'cell-selected'
  }

  // ─── Cleanup ──────────────────────────────────────────────────

  destroy(): void {
    this.commands.clear()
    this.selection.clear()
    this.dataSourceRegistry.clear()
    this._materials.clear()
    this._materialDesignerExtensions.clear()
    this._catalog = []
    this.clipboard = []
  }
}

/** Infer which band/section a row belongs to based on bands[].rowRange. */
export function inferSectionKind(node: TableNode, rowIndex: number): TableSectionKind | undefined {
  for (const band of node.table.bands) {
    if (rowIndex >= band.rowRange.start && rowIndex < band.rowRange.end) {
      return band.kind
    }
  }
  return undefined
}
