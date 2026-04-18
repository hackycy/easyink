import type { GeometryService, Point, Rect } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import { UnitManager } from '@easyink/core'

/**
 * Create a GeometryService bound to the designer's viewport state.
 * Canvas coordinates are in the schema's document unit (mm/in/cm/pt),
 * not CSS pixels — use UnitManager for screen<->canvas conversion.
 */
export function createGeometryService(store: DesignerStore): GeometryService {
  return {
    screenToCanvas(px: { x: number, y: number }): Point {
      const { zoom, scrollLeft, scrollTop } = store.workbench.viewport
      const um = new UnitManager(store.schema.unit)
      const pageEl = store.getPageEl()
      const pageRect = pageEl?.getBoundingClientRect()
      const offsetX = pageRect?.left ?? 0
      const offsetY = pageRect?.top ?? 0
      return {
        x: um.screenToDocument(px.x, offsetX, scrollLeft, zoom),
        y: um.screenToDocument(px.y, offsetY, scrollTop, zoom),
      }
    },

    canvasToScreen(pt: Point): { x: number, y: number } {
      const { zoom, scrollLeft, scrollTop } = store.workbench.viewport
      const um = new UnitManager(store.schema.unit)
      const pageEl = store.getPageEl()
      const pageRect = pageEl?.getBoundingClientRect()
      const offsetX = pageRect?.left ?? 0
      const offsetY = pageRect?.top ?? 0
      return {
        x: um.documentToScreen(pt.x, offsetX, scrollLeft, zoom),
        y: um.documentToScreen(pt.y, offsetY, scrollTop, zoom),
      }
    },

    canvasToLocal(pt: Point, node: MaterialNode): Point {
      return {
        x: pt.x - node.x,
        y: pt.y - node.y,
      }
    },

    localToCanvas(pt: Point, node: MaterialNode): Point {
      return {
        x: pt.x + node.x,
        y: pt.y + node.y,
      }
    },

    getSelectionRects(): Rect[] {
      // Implemented by EditingSession based on current selection + material geometry
      return []
    },
  }
}
