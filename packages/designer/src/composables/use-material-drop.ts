import type { DesignerStore } from '../store/designer-store'
import { AddMaterialCommand } from '@easyink/core'
import { createGeometryService } from '../editing/geometry-service'
import { selectOne } from '../interactions/selection-api'

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
 * 1. User drags a material button from the materials panel onto the canvas page.
 * 2. On drop, the material type is read from the dataTransfer.
 * 3. A new node is created via the material's factory at the drop position.
 * 4. An AddMaterialCommand is executed so the operation is undoable.
 */
export function useMaterialDrop(ctx: MaterialDropContext) {
  const geometry = createGeometryService(ctx.store, { getPageEl: ctx.getPageEl })

  function onDragOver(e: DragEvent) {
    if (!e.dataTransfer?.types.includes(MATERIAL_DRAG_MIME))
      return
    e.preventDefault()
    if (e.dataTransfer)
      e.dataTransfer.dropEffect = 'copy'
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    const dragData = e.dataTransfer?.getData(MATERIAL_DRAG_MIME)
    if (!dragData)
      return

    const { store } = ctx
    const manifest = store.materialProfile.editableTypes.has(dragData)
      ? store.materialProfile.getManifest(dragData)
      : undefined
    if (!manifest)
      return

    const pageEl = ctx.getPageEl()
    if (!pageEl)
      return

    const dropPoint = geometry.screenToDocument({ x: e.clientX, y: e.clientY })

    const node = store.materialProfile.createNode(manifest.type, {
      x: Math.max(0, dropPoint.x),
      y: Math.max(0, dropPoint.y),
    }, store.schema.unit)

    const cmd = new AddMaterialCommand(store.schema.elements, node)
    store.commands.execute(cmd)
    selectOne(store, node.id)
  }

  return { onDragOver, onDrop }
}
