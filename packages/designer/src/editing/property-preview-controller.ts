import type { DocumentOperationDescriptor, DocumentTransactionOptions, PropertyDescriptor } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { resolvePropertyAccessor } from '@easyink/core'

export interface PropertyPreviewHandle {
  replace: (recipe: (draft: DocumentSchema) => void) => void
  commit: () => void
  cancel: () => void
  replaceNode?: (nodeId: string, paths: readonly string[], writer: (node: MaterialNode) => void) => void
}

interface PreviewTransactionSource {
  beginPreview: (options: DocumentTransactionOptions) => PropertyPreviewHandle
}

type ScopedPreview = PropertyPreviewHandle & {
  replaceNode: (nodeId: string, paths: readonly string[], writer: (node: MaterialNode) => void) => void
}

export interface PropertyPreviewOptions {
  label: string
  mergeKey?: string
  operation: DocumentOperationDescriptor
}

/** Coordinates one reversible property preview window for the designer surface. */
export class PropertyPreviewController {
  private active: { key: string, preview: PropertyPreviewHandle } | undefined

  constructor(private readonly transactions: PreviewTransactionSource) {}

  get activeKey(): string | undefined { return this.active?.key }

  preview(key: string, options: PropertyPreviewOptions, replace: (preview: PropertyPreviewHandle) => void): void {
    try {
      if (this.active && this.active.key !== key)
        this.cancelActive()
      if (!this.active) {
        const preview = this.transactions.beginPreview(options as DocumentTransactionOptions)
        this.active = { key, preview }
      }
      replace(this.active.preview)
    }
    catch (error) {
      this.cleanupAfterError(key)
      throw error
    }
  }

  previewProperty<T>(
    key: string,
    node: MaterialNode,
    descriptor: PropertyDescriptor<T>,
    value: T,
    context: {
      sessionPath: readonly string[]
      selectionLineage: string | null
      label?: string
    },
  ): void {
    const accessor = resolvePropertyAccessor(descriptor)
    this.preview(key, {
      label: context.label ?? descriptor.label,
      mergeKey: `property:${node.id}:${key}`,
      operation: {
        kind: 'material.property',
        sessionPath: [...context.sessionPath],
        targetIds: [`node:${node.id}`],
        fieldPaths: [...accessor.paths],
        selectionLineage: context.selectionLineage,
        structural: false,
      },
    }, preview => (preview as ScopedPreview).replaceNode(node.id, accessor.paths, draft => accessor.write(draft, value)))
  }

  commit(key: string): void {
    if (!this.active || this.active.key !== key)
      return
    const current = this.active
    this.active = undefined
    try {
      current.preview.commit()
    }
    catch (error) {
      try {
        current.preview.cancel()
      }
      catch { /* preserve the commit failure */ }
      throw error
    }
  }

  cancel(key: string): void {
    if (!this.active || this.active.key !== key)
      return
    const current = this.active
    this.active = undefined
    current.preview.cancel()
  }

  cancelActive(): void {
    if (!this.active)
      return
    const current = this.active
    this.active = undefined
    try {
      current.preview.cancel()
    }
    catch { /* cancellation is best effort */ }
  }

  private cleanupAfterError(key: string): void {
    if (this.active?.key !== key)
      return
    const current = this.active
    this.active = undefined
    try {
      current.preview.cancel()
    }
    catch { /* retain the original error */ }
  }
}
