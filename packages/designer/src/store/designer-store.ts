import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { LocaleMessages, MaterialCatalogEntry, MaterialDefinition, MaterialDesignerExtension } from '../types'
import { CommandManager, SelectionModel } from '@easyink/core'
import { DataSourceRegistry } from '@easyink/datasource'
import { createDefaultSchema } from '@easyink/schema'
import { markRaw } from 'vue'
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

  constructor(schema?: DocumentSchema) {
    this._schema = schema || createDefaultSchema()
    markRaw(this._materials)
    markRaw(this._materialDesignerExtensions)
    markRaw(this.dataSourceRegistry)
  }

  // ─── Schema access ────────────────────────────────────────────

  get schema(): DocumentSchema {
    return this._schema
  }

  setSchema(schema: DocumentSchema): void {
    this._schema = schema
    this.selection.clear()
    this.commands.clear()
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
