import type { PagePlanEntry } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { MaterialRendererRegistry } from './material-registry'
import type { ViewerDiagnosticEvent, ViewerRenderContext } from './types'
import { UNIT_FACTOR } from '@easyink/shared'

export interface RenderSurfaceOptions {
  container: HTMLElement
  zoom: number
  unit: string
  data: Record<string, unknown>
  resolvedPropsMap: Map<string, Record<string, unknown>>
}

export interface PageDOM {
  pageIndex: number
  element: HTMLElement
}

/**
 * Render all pages into the container element.
 * Each page becomes a positioned div with child element wrappers inside.
 */
export function renderPages(
  pages: PagePlanEntry[],
  registry: MaterialRendererRegistry,
  options: RenderSurfaceOptions,
  diagnostics: ViewerDiagnosticEvent[],
): PageDOM[] {
  const { container, zoom, unit, data, resolvedPropsMap } = options
  container.innerHTML = ''

  const pxFactor = getPxFactor(unit)
  const pageDOMs: PageDOM[] = []

  for (const page of pages) {
    const pageEl = createPageElement(page, pxFactor, zoom)

    const context: ViewerRenderContext = {
      data,
      resolvedProps: {},
      pageIndex: page.index,
      unit,
      zoom,
    }

    // Sort elements by zIndex for proper layering
    const sorted = [...page.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))

    for (const node of sorted) {
      if (node.hidden)
        continue

      const resolved = resolvedPropsMap.get(node.id) ?? node.props
      context.resolvedProps = resolved

      // Render through the material registry
      const nodeForRender: MaterialNode = { ...node, props: resolved }
      let output
      try {
        output = registry.render(nodeForRender, context)
      }
      catch (err) {
        diagnostics.push({
          category: 'material',
          severity: 'error',
          code: 'MATERIAL_RENDER_ERROR',
          message: `Failed to render ${node.type} (${node.id}): ${err instanceof Error ? err.message : String(err)}`,
          nodeId: node.id,
        })
        output = { html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff3f3;border:1px dashed #ff4d4f;color:#ff4d4f;font-size:11px;box-sizing:border-box;">[Render Error]</div>` }
      }

      const wrapper = createElementWrapper(node, page, pxFactor, zoom)
      if (output.element) {
        wrapper.appendChild(output.element)
      }
      else if (output.html) {
        wrapper.innerHTML = output.html
      }

      pageEl.appendChild(wrapper)
    }

    container.appendChild(pageEl)
    pageDOMs.push({ pageIndex: page.index, element: pageEl })
  }

  return pageDOMs
}

function createPageElement(page: PagePlanEntry, pxFactor: number, zoom: number): HTMLElement {
  const el = document.createElement('div')
  el.className = 'ei-viewer-page'
  el.setAttribute('data-page-index', String(page.index))
  el.style.position = 'relative'
  el.style.width = `${page.width * pxFactor * zoom}px`
  el.style.height = `${page.height * pxFactor * zoom}px`
  el.style.overflow = 'hidden'
  el.style.background = 'white'
  el.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)'
  el.style.margin = '0 auto 16px auto'
  el.style.boxSizing = 'border-box'
  return el
}

function createElementWrapper(
  node: MaterialNode,
  page: PagePlanEntry,
  pxFactor: number,
  zoom: number,
): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'ei-viewer-element'
  wrapper.setAttribute('data-element-id', node.id)
  wrapper.setAttribute('data-element-type', node.type)

  // Compute position relative to page
  const relativeY = node.y - page.yOffset

  wrapper.style.position = 'absolute'
  wrapper.style.left = `${node.x * pxFactor * zoom}px`
  wrapper.style.top = `${relativeY * pxFactor * zoom}px`
  wrapper.style.width = `${node.width * pxFactor * zoom}px`
  wrapper.style.height = `${node.height * pxFactor * zoom}px`
  wrapper.style.overflow = 'hidden'

  if (node.rotation) {
    wrapper.style.transform = `rotate(${node.rotation}deg)`
    wrapper.style.transformOrigin = 'center center'
  }

  if (node.alpha != null && node.alpha !== 1) {
    wrapper.style.opacity = String(node.alpha)
  }

  return wrapper
}

/**
 * CSS pixels per document unit.
 * CSS reference: 96 dpi.
 */
function getPxFactor(unit: string): number {
  const factor = UNIT_FACTOR[unit]
  if (!factor)
    return 1
  return 96 / factor
}
