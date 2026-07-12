import type { PageLayerRenderPlan, PageLayerRenderPlanBuckets, PagePlanEntry, TextWatermarkPageLayerPlan, TrustedViewerHtml } from '@easyink/core'
import type { MaterialNode, PageBackground, PageSchema } from '@easyink/schema'
import type { MaterialRendererRegistry } from './material-registry'
import type { ViewerDiagnosticEvent, ViewerRenderContext, ViewerRenderSize } from './types'
import { groupPageLayerPlansByPlacement, PAGE_CONTENT_LAYER_STACK_INDEX, readTrustedViewerHtml, resolvePageLayerPlans, resolvePageLayerStackIndex, trustedViewerHtml } from '@easyink/core'
import { escapeHtml, UNIT_FACTOR } from '@easyink/shared'
import { isErrorSentinel, safeRender } from './diagnostic-middleware'

export interface RenderSurfaceOptions {
  container: HTMLElement
  document: Document
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
  const { container, document, zoom, unit, data, resolvedPropsMap, pageSchema } = options
  container.replaceChildren()

  const pageDOMs: PageDOM[] = []
  const pageLayerBucketsBySize = new Map<string, PageLayerRenderPlanBuckets>()

  for (const page of pages) {
    const { wrapper, pageEl } = createPageElement(document, page, pageSchema, unit, zoom)
    const contentLayer = createContentLayer(document)
    const pageLayerBuckets = resolveCachedPageLayerBuckets(pageLayerBucketsBySize, pageSchema, page)

    appendPageLayers(document, pageEl, pageLayerBuckets.underContent, page, unit, diagnostics)
    pageEl.appendChild(contentLayer)

    const context: ViewerRenderContext = {
      data,
      resolvedProps: {},
      pageIndex: page.index,
      unit,
      zoom,
      reportDiagnostic: diagnostic => diagnostics.push({
        category: 'datasource',
        severity: diagnostic.severity,
        code: diagnostic.code,
        message: diagnostic.message,
        nodeId: diagnostic.nodeId,
        scope: 'datasource',
        cause: diagnostic.cause,
      }),
    }

    // Sort elements by zIndex for proper layering
    const sorted = [...page.elements].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))

    for (const node of sorted) {
      if (node.editorState?.hidden)
        continue

      const resolved = resolvedPropsMap.get(node.id) ?? node.model as Record<string, unknown>
      context.resolvedProps = resolved

      // Render through the material registry, wrapped by unified diagnostic middleware.
      const nodeForRender: MaterialNode = { ...node, model: resolved }
      const fallbackHtml = trustedViewerHtml(`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff3f3;border:1px dashed #ff4d4f;color:#ff4d4f;font-size:11px;box-sizing:border-box;" title="Render failed">&#x26A0; [${escapeHtml(node.type)}]</div>`)

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

      const renderSize = registry.getRenderSize(nodeForRender, context)
      const elWrapper = createElementWrapper(document, nodeForRender, page, unit, renderSize)
      if (output.element) {
        elWrapper.appendChild(output.element)
      }
      else if (output.html) {
        setMaterialHtml(elWrapper, output.html)
      }

      contentLayer.appendChild(elWrapper)
    }

    appendPageLayers(document, pageEl, pageLayerBuckets.overContent, page, unit, diagnostics)
    appendPageLayers(document, pageEl, pageLayerBuckets.top, page, unit, diagnostics)

    container.appendChild(wrapper)
    pageDOMs.push({ pageIndex: page.index, element: pageEl })
  }

  return pageDOMs
}

function resolveCachedPageLayerBuckets(
  cache: Map<string, PageLayerRenderPlanBuckets>,
  pageSchema: PageSchema,
  page: Pick<PagePlanEntry, 'width' | 'height'>,
): PageLayerRenderPlanBuckets {
  const key = createPageSizeKey(page.width, page.height)
  const cached = cache.get(key)
  if (cached)
    return cached

  const buckets = groupPageLayerPlansByPlacement(resolvePageLayerPlans(pageSchema, {
    width: page.width,
    height: page.height,
  }))
  cache.set(key, buckets)
  return buckets
}

function appendPageLayers(
  document: Document,
  pageEl: HTMLElement,
  plans: PageLayerRenderPlan[],
  page: PagePlanEntry,
  unit: string,
  diagnostics: ViewerDiagnosticEvent[],
): void {
  if (plans.length === 0)
    return

  for (const plan of plans) {
    if (isTextWatermarkLayerPlan(plan))
      appendTextWatermarkLayer(document, pageEl, plan, page, unit, diagnostics)
  }
}

function appendTextWatermarkLayer(
  document: Document,
  pageEl: HTMLElement,
  plan: TextWatermarkPageLayerPlan,
  page: PagePlanEntry,
  unit: string,
  diagnostics: ViewerDiagnosticEvent[],
): void {
  const layer = document.createElement('div')
  layer.className = 'ei-viewer-page-layer ei-viewer-page-layer--watermark'
  layer.setAttribute('data-page-layer-id', plan.layer.id)
  layer.setAttribute('data-page-layer-kind', plan.layer.kind)
  layer.style.position = 'absolute'
  layer.style.inset = '0'
  layer.style.zIndex = String(resolveViewerLayerZIndex(plan))
  layer.style.pointerEvents = 'none'
  layer.style.userSelect = 'none'
  layer.style.overflow = 'hidden'
  layer.style.color = plan.layer.color
  layer.style.opacity = String(plan.layer.opacity)

  for (const tile of plan.tiles) {
    const text = document.createElement('span')
    text.className = 'ei-viewer-page-layer__watermark-tile'
    text.textContent = plan.layer.text
    text.style.position = 'absolute'
    text.style.display = 'inline-flex'
    text.style.alignItems = 'center'
    text.style.justifyContent = 'center'
    text.style.left = `${tile.x}${unit}`
    text.style.top = `${tile.y}${unit}`
    text.style.fontSize = `${plan.layer.fontSize}${unit}`
    text.style.fontWeight = '500'
    text.style.lineHeight = '1'
    text.style.whiteSpace = 'nowrap'
    text.style.transform = `translate(-50%, -50%) rotate(${plan.layer.rotation}deg)`
    text.style.transformOrigin = 'center center'
    layer.appendChild(text)
  }

  if (plan.truncated) {
    diagnostics.push({
      category: 'viewer',
      severity: 'warning',
      code: 'PAGE_WATERMARK_TRUNCATED',
      message: `Page ${page.index + 1} layer ${plan.layer.id} generated too many watermark tiles and was truncated.`,
      detail: { pageIndex: page.index, layerId: plan.layer.id, tileCount: plan.tiles.length },
    })
  }

  pageEl.appendChild(layer)
}

function isTextWatermarkLayerPlan(plan: PageLayerRenderPlan): plan is TextWatermarkPageLayerPlan {
  return plan.layer.kind === 'watermark' && plan.layer.type === 'text'
}

function resolveViewerLayerZIndex(plan: PageLayerRenderPlan): number {
  return resolvePageLayerStackIndex(plan)
}

function createContentLayer(document: Document): HTMLElement {
  const layer = document.createElement('div')
  layer.className = 'ei-viewer-content-layer'
  layer.style.position = 'absolute'
  layer.style.inset = '0'
  layer.style.zIndex = String(PAGE_CONTENT_LAYER_STACK_INDEX)
  return layer
}

function createPageElement(
  document: Document,
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
  if (pageSchema.font) {
    pageEl.style.fontFamily = pageSchema.font
  }

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
    el.style.backgroundImage = `url(${JSON.stringify(bg.image)})`

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
  document: Document,
  node: MaterialNode,
  page: PagePlanEntry,
  unit: string,
  renderSize: ViewerRenderSize,
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
  wrapper.style.width = `${renderSize.width}${unit}`
  wrapper.style.height = `${renderSize.height}${unit}`
  wrapper.style.overflow = 'hidden'
  wrapper.style.zIndex = String(node.zIndex ?? 0)

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

function createPageSizeKey(width: number, height: number): string {
  return `${width}:${height}`
}

function setMaterialHtml(element: HTMLElement, html: TrustedViewerHtml): void {
  const template = element.ownerDocument.createElement('template')
  template.innerHTML = readTrustedViewerHtml(html)
  element.replaceChildren(template.content.cloneNode(true))
}
