import type { DocumentSchema, TemplateVersion } from '@easyink/schema'
import { generateId } from '@easyink/shared'

const STORAGE_KEY = 'easyink_template_history'

/**
 * Manager for template version history.
 * Handles saving, switching, and persisting template versions.
 */
export class TemplateHistoryManager {
  private _versions: TemplateVersion[] = []
  private _currentId: string | null = null
  private _maxVersions = 50

  constructor(maxVersions = 50) {
    this._maxVersions = maxVersions
    this.load()
  }

  /**
   * Save a new version of the schema.
   * @returns The ID of the saved version
   */
  saveVersion(
    schema: DocumentSchema,
    metadata: {
      prompt?: string
      source: TemplateVersion['source']
      parentId?: string
      metadata?: Record<string, unknown>
    },
  ): string {
    const id = generateId('ver')
    const version: TemplateVersion = {
      id,
      schema: JSON.parse(JSON.stringify(schema)), // Deep clone
      prompt: metadata.prompt,
      source: metadata.source,
      timestamp: Date.now(),
      parentId: metadata.parentId ?? this._currentId ?? undefined,
      metadata: metadata.metadata,
    }

    this._versions.push(version)
    this._currentId = id

    // Trim if exceeding max versions
    if (this._versions.length > this._maxVersions) {
      this._versions = this._versions.slice(-this._maxVersions)
    }

    this.save()
    return id
  }

  /**
   * Get a specific version by ID.
   */
  getVersion(id: string): TemplateVersion | undefined {
    return this._versions.find(v => v.id === id)
  }

  /**
   * Get the currently active version.
   */
  getCurrentVersion(): TemplateVersion | undefined {
    return this._currentId ? this.getVersion(this._currentId) : undefined
  }

  /**
   * Get the current schema (from current version or provided fallback).
   */
  getCurrentSchema(fallback?: DocumentSchema): DocumentSchema | undefined {
    const version = this.getCurrentVersion()
    return version?.schema ?? fallback
  }

  /**
   * Switch to a different version.
   * @returns The schema of the switched version, or undefined if not found
   */
  switchTo(id: string): DocumentSchema | undefined {
    const version = this.getVersion(id)
    if (!version)
      return undefined

    this._currentId = id
    return JSON.parse(JSON.stringify(version.schema))
  }

  /**
   * Get history with optional filtering.
   */
  getHistory(options?: {
    source?: string
    limit?: number
    offset?: number
  }): TemplateVersion[] {
    let list = this._versions

    if (options?.source) {
      list = list.filter(v => v.source === options.source)
    }

    const offset = options?.offset ?? 0
    const limit = options?.limit ?? this._maxVersions

    return list.slice(offset, offset + limit)
  }

  /**
   * Delete a specific version.
   */
  deleteVersion(id: string): boolean {
    const index = this._versions.findIndex(v => v.id === id)
    if (index < 0)
      return false

    this._versions.splice(index, 1)

    // If we deleted the current version, switch to the last one
    if (this._currentId === id) {
      this._currentId = this._versions.length > 0
        ? this._versions[this._versions.length - 1]!.id
        : null
    }

    this.save()
    return true
  }

  /**
   * Clear all history.
   */
  clear(): void {
    this._versions = []
    this._currentId = null
    this.save()
  }

  /**
   * Get total version count.
   */
  get count(): number {
    return this._versions.length
  }

  /**
   * Check if history is empty.
   */
  get isEmpty(): boolean {
    return this._versions.length === 0
  }

  /**
   * Export all versions for serialization.
   */
  exportVersions(): TemplateVersion[] {
    return JSON.parse(JSON.stringify(this._versions))
  }

  /**
   * Import versions from serialized data.
   */
  importVersions(versions: TemplateVersion[], currentId?: string): void {
    this._versions = versions
    this._currentId = currentId ?? versions[versions.length - 1]?.id ?? null
  }

  /**
   * Save to localStorage.
   */
  save(): void {
    try {
      const data = {
        versions: this._versions,
        currentId: this._currentId,
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    }
    catch (error) {
      console.error('Failed to save template history:', error)
    }
  }

  /**
   * Load from localStorage.
   */
  load(): void {
    try {
      const data = localStorage.getItem(STORAGE_KEY)
      if (data) {
        const parsed = JSON.parse(data) as {
          versions: TemplateVersion[]
          currentId: string | null
        }
        this._versions = parsed.versions ?? []
        this._currentId = parsed.currentId ?? null
      }
    }
    catch (error) {
      console.error('Failed to load template history:', error)
      this._versions = []
      this._currentId = null
    }
  }
}
