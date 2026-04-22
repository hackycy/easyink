import type { PagePlanEntry } from '@easyink/core'
import type { MaterialNode, PageBackground, PageSchema } from '@easyink/schema'
import type { MaterialRendererRegistry } from './material-registry'
import type { ViewerDiagnosticEvent, ViewerRenderContext } from './types'
import { getLineThickness, LINE_TYPE } from '@easyink/material-line'
import { isTableNode } from '@easyink/schema'
import { UNIT_FACTOR } from '@easyink/shared'
import { isErrorSentinel, safeRender } from './diagnostic-middleware'

export interface RenderSurfaceOptions {
  container: HTMLElement
  zoom: number
  unit: string
  data: Record<string, unknown>
  resolvedPropsMap: Map<string, Record<string, unknown>>
  pageSchema: PageSchema
}

export interface PageDOM {
  pageIndex: number
  element: HTMLElement
}

/**
 * Render all pages into the container element.
 * Each page becomes a positioned div with child element wrappers inside.
 * All positioning uses CSS physical units (mm/pt/in) directly.
 * Zoom is applied via transform: scale() on each page element.
 */
export function renderPages(
  pages: PagePlanEntry[],
  registry: MaterialRendererRegistry,
  options: RenderSurfaceOptions,
  diagnostics: ViewerDiagnosticEvent[],
): PageDOM[] {
  const { container, zoom, unit, data, resolvedPropsMap, pageSchema } = options
  container.innerHTML = ''

  const pageDOMs: PageDOM[] = []

  for (const page of pages) {
    const { wrapper, pageEl } = createPageElement(page, pageSchema, unit, zoom)

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

      // Render through the material registry, wrapped by unified diagnostic middleware.
      const nodeForRender: MaterialNode = { ...node, props: resolved }
      const fallbackHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff3f3;border:1px dashed #ff4d4f;color:#ff4d4f;font-size:11px;box-sizing:border-box;" title="Render failed">&#x26A0; [${escapeHtml(node.type)}]</div>`

      const safeResult = safeRender(
        () => registry.render(nodeForRender, context),
        {
          scope: 'material',
          code: 'MATERIAL_RENDER_ERROR',
          nodeId: node.id,
          placeholderHtml: fallbackHtml,
        },
        diagnostics,
      )

      let output
      if (isErrorSentinel(safeResult)) {
        output = { html: safeResult.html }
      }
      else {
        output = safeResult
      }

      const elWrapper = createElementWrapper(node, page, unit)
      if (output.element) {
        elWrapper.appendChild(output.element)
      }
      else if (output.html) {
        elWrapper.innerHTML = output.html
      }

      pageEl.appendChild(elWrapper)
    }

    container.appendChild(wrapper)
    pageDOMs.push({ pageIndex: page.index, element: pageEl })
  }

  return pageDOMs
}

function createPageElement(
  page: PagePlanEntry,
  pageSchema: PageSchema,
  unit: string,
  zoom: number,
): { wrapper: HTMLElement, pageEl: HTMLElement } {
  const pageEl = document.createElement('div')
  pageEl.className = 'ei-viewer-page'
  pageEl.setAttribute('data-page-index', String(page.index))
  pageEl.style.position = 'relative'
  pageEl.style.width = `${page.width}${unit}`
  pageEl.style.height = `${page.height}${unit}`
  pageEl.style.overflow = 'hidden'
  pageEl.style.boxShadow = '0 1px 4px rgba(0,0,0,0.15)'
  pageEl.style.boxSizing = 'border-box'

  // Background
  applyPageBackground(pageEl, pageSchema.background, unit)

  // Border radius
  if (pageSchema.radius) {
    pageEl.style.borderRadius = pageSchema.radius
  }

  // Zoom via transform: scale() — print CSS resets this to none
  if (zoom !== 1) {
    pageEl.style.transform = `scale(${zoom})`
    pageEl.style.transformOrigin = 'top left'
  }

  // Zoom wrapper: adjusts flow layout dimensions since transform doesn't affect flow.
  // Uses px because the parent container reports size in px (clientWidth/clientHeight).
  let wrapper: HTMLElement
  if (zoom !== 1) {
    wrapper = document.createElement('div')
    wrapper.className = 'ei-viewer-page-zoom'
    const pxFactor = getPxFactorForLayout(unit)
    wrapper.style.width = `${page.width * pxFactor * zoom}px`
    wrapper.style.height = `${page.height * pxFactor * zoom}px`
    wrapper.style.margin = '0 auto 16px auto'
    wrapper.style.overflow = 'hidden'
    wrapper.appendChild(pageEl)
  }
  else {
    wrapper = pageEl
    pageEl.style.margin = '0 auto 16px auto'
  }

  return { wrapper, pageEl }
}

function applyPageBackground(el: HTMLElement, bg: PageBackground | undefined, unit: string): void {
  if (!bg) {
    el.style.background = 'white'
    return
  }

  // Background color
  el.style.backgroundColor = bg.color || 'white'

  // Background image
  if (bg.image) {
    el.style.backgroundImage = `url(${bg.image})`

    // Repeat mode -> CSS background-repeat + background-size
    const repeat = bg.repeat || 'none'
    if (repeat === 'full') {
      el.style.backgroundSize = '100% 100%'
      el.style.backgroundRepeat = 'no-repeat'
    }
    else {
      if (repeat === 'repeat') {
        el.style.backgroundRepeat = 'repeat'
      }
      else if (repeat === 'repeat-x') {
        el.style.backgroundRepeat = 'repeat-x'
      }
      else if (repeat === 'repeat-y') {
        el.style.backgroundRepeat = 'repeat-y'
      }
      else {
        el.style.backgroundRepeat = 'no-repeat'
      }

      // Explicit image dimensions in document units
      if (bg.width != null && bg.height != null) {
        el.style.backgroundSize = `${bg.width}${unit} ${bg.height}${unit}`
      }
      else if (bg.width != null) {
        el.style.backgroundSize = `${bg.width}${unit} auto`
      }
      else if (bg.height != null) {
        el.style.backgroundSize = `auto ${bg.height}${unit}`
      }
    }

    // Background position offset in document units
    if (bg.offsetX != null || bg.offsetY != null) {
      const x = bg.offsetX ?? 0
      const y = bg.offsetY ?? 0
      el.style.backgroundPosition = `${x}${unit} ${y}${unit}`
    }
  }
}

function createElementWrapper(
  node: MaterialNode,
  page: PagePlanEntry,
  unit: string,
): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.className = 'ei-viewer-element'
  wrapper.setAttribute('data-element-id', node.id)
  wrapper.setAttribute('data-element-type', node.type)

  // Compute position relative to page
  const relativeY = node.y - page.yOffset

  wrapper.style.position = 'absolute'
  wrapper.style.left = `${node.x}${unit}`
  wrapper.style.top = `${relativeY}${unit}`
  wrapper.style.width = `${node.width}${unit}`
  const renderHeight = node.type === LINE_TYPE ? getLineThickness(node) : node.height
  wrapper.style.height = `${renderHeight}${unit}`
  // Tables use border-collapse:collapse where outer borders overflow by half
  // the border width. Use overflow:visible to avoid clipping bottom/right borders.
  // Page-level overflow:hidden still prevents content from escaping the page.
  wrapper.style.overflow = isTableNode(node) ? 'visible' : 'hidden'

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
 * CSS pixels per document unit. Only used for zoom wrapper flow layout,
 * NOT for content rendering. CSS reference: 96 dpi.
 */
function getPxFactorForLayout(unit: string): number {
  const factor = UNIT_FACTOR[unit]
  if (!factor)
    return 1
  return 96 / factor
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
