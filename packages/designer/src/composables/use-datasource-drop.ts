import type { BindingRef } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import { BindFieldCommand, pointInRect, UnitManager } from '@easyink/core'

/**
 * MIME type used for datasource field drag data.
 */
export const DATASOURCE_DRAG_MIME = 'application/x-easyink-field'

export interface DatasourceFieldDragData {
  sourceId: string
  sourceName?: string
  sourceTag?: string
  fieldPath: string
  fieldKey?: string
  fieldLabel?: string
  use?: string
}

export interface DatasourceDropContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
}

/**
 * Creates drag-and-drop handlers for binding datasource fields to canvas elements.
 *
 * Architecture ref (10.8):
 * 1. User drags a leaf field from the datasource tree onto a canvas element.
 * 2. Hit-test determines the target element.
 * 3. A BindingRef is generated and the element is updated via BindFieldCommand.
 * 4. Properties panel and canvas badge sync to reflect the binding.
 */
export function useDatasourceDrop(ctx: DatasourceDropContext) {
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(DATASOURCE_DRAG_MIME))
      return
    e.preventDefault()
    if (e.dataTransfer)
      e.dataTransfer.dropEffect = 'link'
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const raw = e.dataTransfer?.getData(DATASOURCE_DRAG_MIME)
    if (!raw)
      return

    let fieldData: DatasourceFieldDragData
    try {
      fieldData = JSON.parse(raw)
    }
    catch {
      return
    }

    const { store } = ctx
    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return

    const unitManager = new UnitManager(store.schema.unit)
    const zoom = store.workbench.viewport.zoom
    const pageRect = pageEl.getBoundingClientRect()

    const docX = unitManager.screenToDocument(e.clientX, pageRect.left, 0, zoom)
    const docY = unitManager.screenToDocument(e.clientY, pageRect.top, 0, zoom)

    // Hit-test: find the topmost element under the drop point
    const elements = store.getElements()
    let target = undefined as typeof elements[number] | undefined
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i]!
      if (el.hidden || el.locked)
        continue
      if (pointInRect({ x: docX, y: docY }, { x: el.x, y: el.y, width: el.width, height: el.height })) {
        // Check if the material supports binding
        const mat = store.getMaterial(el.type)
        if (mat && mat.capabilities.bindable === false)
          continue
        target = el
        break
      }
    }

    if (!target)
      return

    const binding: BindingRef = {
      sourceId: fieldData.sourceId,
      sourceName: fieldData.sourceName,
      sourceTag: fieldData.sourceTag,
      fieldPath: fieldData.fieldPath,
      fieldKey: fieldData.fieldKey,
      fieldLabel: fieldData.fieldLabel,
    }

    const cmd = new BindFieldCommand(store.schema.elements, target.id, binding)
    store.commands.execute(cmd)

    // Select the bound element
    store.selection.select(target.id)
  }

  return { onDragOver, onDrop }
}
