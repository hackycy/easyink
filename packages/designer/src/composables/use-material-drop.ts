import type { DesignerStore } from '../store/designer-store'
import { AddMaterialCommand, UnitManager } from '@easyink/core'

/**
 * MIME type used when dragging a material type from the toolbar.
 */
export const MATERIAL_DRAG_MIME = 'application/x-easyink-material'

export interface MaterialDropContext {
  store: DesignerStore
  getPageEl: () => HTMLElement | null
}

/**
 * Creates drag-and-drop handlers for adding materials from the toolbar onto the canvas.
 *
 * Architecture ref (10.2 / 11.1):
 * 1. User drags a material button from TopBarA onto the canvas page.
 * 2. On drop, the material type is read from the dataTransfer.
 * 3. A new node is created via the material's factory at the drop position.
 * 4. An AddMaterialCommand is executed so the operation is undoable.
 */
export function useMaterialDrop(ctx: MaterialDropContext) {
  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(MATERIAL_DRAG_MIME))
      return
    e.preventDefault()
    if (e.dataTransfer)
      e.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const materialType = e.dataTransfer?.getData(MATERIAL_DRAG_MIME)
    if (!materialType)
      return

    const { store } = ctx
    const definition = store.getMaterial(materialType)
    if (!definition)
      return

    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return

    const unitManager = new UnitManager(store.schema.unit)
    const zoom = store.workbench.viewport.zoom
    const pageRect = pageEl.getBoundingClientRect()

    // Convert screen coordinates to document units
    const docX = unitManager.screenToDocument(e.clientX, pageRect.left, 0, zoom)
    const docY = unitManager.screenToDocument(e.clientY, pageRect.top, 0, zoom)

    const node = definition.createDefaultNode({
      x: Math.max(0, docX),
      y: Math.max(0, docY),
    })

    const cmd = new AddMaterialCommand(store.schema.elements, node)
    store.commands.execute(cmd)
    store.selection.select(node.id)
  }

  return { onDragOver, onDrop }
}
