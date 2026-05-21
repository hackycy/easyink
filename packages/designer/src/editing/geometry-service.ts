import type { GeometryService, LocalCoordinateOptions, PageGeometrySnapshot, Point, Rect } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import {
  createEditorSurfacePlan,
  projectDocumentPointToEditorSurface,
  projectEditorSurfacePointToDocument,
  UnitManager,
} from '@easyink/core'

export interface GeometryServiceOptions {
  getPageEl?: () => HTMLElement | null
}

type TransformableNode = MaterialNode & {
  scaleX?: number
  scaleY?: number
}

/**
 * Create a GeometryService bound to the designer's viewport state.
 * Document coordinates are the schema unit values used by page and nodes.
 */
export function createGeometryService(store: DesignerStore, options: GeometryServiceOptions = {}): GeometryService {
  function getPageEl(): HTMLElement | null {
    return options.getPageEl?.() ?? store.getPageEl()
  }

  function getPageGeometry(): PageGeometrySnapshot {
    const { zoom, scrollLeft, scrollTop } = store.workbench.viewport
    const pageRect = getPageEl()?.getBoundingClientRect()
    return {
      pageOffset: {
        x: (pageRect?.left ?? 0) + scrollLeft,
        y: (pageRect?.top ?? 0) + scrollTop,
      },
      zoom,
      scroll: { x: scrollLeft, y: scrollTop },
      documentUnit: store.schema.unit,
    }
  }

  function getNodeSize(node: MaterialNode): { width: number, height: number } {
    return store.getElementSize(node)
  }

  function shouldIncludeTransform(options?: LocalCoordinateOptions): boolean {
    return options?.includeTransform !== false
  }

  function getNodeTransform(node: MaterialNode) {
    const transformable = node as TransformableNode
    const scaleX = transformable.scaleX ?? 1
    const scaleY = transformable.scaleY ?? 1
    return {
      rotation: node.rotation ?? 0,
      scaleX: Math.abs(scaleX) > Number.EPSILON ? scaleX : 1,
      scaleY: Math.abs(scaleY) > Number.EPSILON ? scaleY : 1,
    }
  }

  function rotate(point: Point, radians: number): Point {
    const cos = Math.cos(radians)
    const sin = Math.sin(radians)
    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos,
    }
  }

  return {
    getPageGeometry,

    screenToDocument(px: Point): Point {
      const { pageOffset, scroll, zoom, documentUnit } = getPageGeometry()
      const unitManager = new UnitManager(documentUnit)
      const surfacePoint = {
        x: unitManager.screenToDocument(px.x, pageOffset.x, scroll.x, zoom),
        y: unitManager.screenToDocument(px.y, pageOffset.y, scroll.y, zoom),
      }
      const plan = createEditorSurfacePlan(store.schema)
      const projected = projectEditorSurfacePointToDocument(plan, surfacePoint)
      return { x: projected.x, y: projected.y }
    },

    documentToScreen(pt: Point): Point {
      const { pageOffset, scroll, zoom, documentUnit } = getPageGeometry()
      const unitManager = new UnitManager(documentUnit)
      const plan = createEditorSurfacePlan(store.schema)
      const surfacePoint = projectDocumentPointToEditorSurface(plan, pt)
      return {
        x: unitManager.documentToScreen(surfacePoint.x, pageOffset.x, scroll.x, zoom),
        y: unitManager.documentToScreen(surfacePoint.y, pageOffset.y, scroll.y, zoom),
      }
    },

    documentToLocal(pt: Point, node: MaterialNode, options?: LocalCoordinateOptions): Point {
      if (!shouldIncludeTransform(options)) {
        return {
          x: pt.x - node.x,
          y: pt.y - node.y,
        }
      }

      const size = getNodeSize(node)
      const center = { x: node.x + size.width / 2, y: node.y + size.height / 2 }
      const transform = getNodeTransform(node)
      const unrotated = rotate({ x: pt.x - center.x, y: pt.y - center.y }, -(transform.rotation * Math.PI) / 180)
      return {
        x: unrotated.x / transform.scaleX + size.width / 2,
        y: unrotated.y / transform.scaleY + size.height / 2,
      }
    },

    localToDocument(pt: Point, node: MaterialNode, options?: LocalCoordinateOptions): Point {
      if (!shouldIncludeTransform(options)) {
        return {
          x: pt.x + node.x,
          y: pt.y + node.y,
        }
      }

      const size = getNodeSize(node)
      const center = { x: node.x + size.width / 2, y: node.y + size.height / 2 }
      const transform = getNodeTransform(node)
      const scaled = {
        x: (pt.x - size.width / 2) * transform.scaleX,
        y: (pt.y - size.height / 2) * transform.scaleY,
      }
      const rotated = rotate(scaled, (transform.rotation * Math.PI) / 180)
      return {
        x: center.x + rotated.x,
        y: center.y + rotated.y,
      }
    },

    getSelectionRects(): Rect[] {
      // Implemented by EditingSession based on current selection + material geometry
      return []
    },
  }
}
