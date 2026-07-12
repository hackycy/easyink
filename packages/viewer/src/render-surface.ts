import type { BrowserDomCapabilities, ViewerTreeMount, ViewerTreePolicy } from '@easyink/browser-dom'
import type { MaterialNodeLoadState, PageLayerRenderPlan, PageLayerRenderPlanBuckets, PagePlanEntry, TextWatermarkPageLayerPlan } from '@easyink/core'
import type { MaterialNode, PageBackground, PageSchema } from '@easyink/schema'
import type { UnitType } from '@easyink/shared'
import type { ProfileMaterialRuntime } from './material-runtime'
import type { ViewerDiagnosticEvent, ViewerRenderContext, ViewerRenderSize } from './types'
import { createBrowserDomCapabilities, renderViewerTree } from '@easyink/browser-dom'
import { groupPageLayerPlansByPlacement, inspectMaterialNode, PAGE_CONTENT_LAYER_STACK_INDEX, resolvePageLayerPlans, resolvePageLayerStackIndex } from '@easyink/core'
import { UNIT_FACTOR } from '@easyink/shared'

export interface RenderSurfaceOptions {
  container: HTMLElement
  document: Document
  zoom: number
  unit: string
  data: Record<string, unknown>
  resolvedPropsMap: Map<string, Record<string, unknown>>
  pageSchema: PageSchema
  nodeStates?: ReadonlyMap<string, MaterialNodeLoadState>
  browserDom?: {
    policy?: ViewerTreePolicy
    imperativeDom?: Iterable<string>
    maxNodes: number
  }
}

export interface PageDOM {
  pageIndex: number
  element: HTMLElement
  dispose: () => void
}

const deniedRenderCapabilities: ViewerRenderContext['capabilities'] = Object.freeze({
  sanitizeMarkup() {
    throw new Error('VIEWER_SANITIZED_MARKUP_NOT_DECLARED')
  },
})

/**
 * Render all pages into the container element.
 * Each page becomes a positioned div with child element wrappers inside.
 * All positioning uses CSS physical units (mm/pt/in) directly.
 * Zoom is applied via transform: scale() on each page element.
 */
export function renderPages(
  pages: PagePlanEntry[],
  materials: ProfileMaterialRuntime,
  options: RenderSurfaceOptions,
  diagnostics: ViewerDiagnosticEvent[],
): PageDOM[] {
  const { container, document, zoom, unit, data, resolvedPropsMap, pageSchema, browserDom } = options
  const nodeStates = options.nodeStates ?? new Map<string, MaterialNodeLoadState>()
  container.replaceChildren()

  const pageDOMs: PageDOM[] = []
  const pageLayerBucketsBySize = new Map<string, PageLayerRenderPlanBuckets>()
  const hostImperativeDom = new Set(browserDom?.imperativeDom ?? [])

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
      capabilities: deniedRenderCapabilities,
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

    const mounts: ViewerTreeMount[] = []
    for (const node of sorted) {
      if (node.editorState?.hidden)
        continue

      const resolved = resolvedPropsMap.get(node.id) ?? node.model as Record<string, unknown>
      context.resolvedProps = resolved

      const nodeForRender: MaterialNode<unknown> = { ...node, model: resolved }
      try {
        const facetCapabilities = materials.getCapabilities(node.type)
        const imperativeDom = facetCapabilities?.imperativeDom?.filter(capability => hostImperativeDom.has(capability)) ?? []
        const capabilities = createBrowserDomCapabilities({
          document,
          policy: browserDom?.policy,
          imperativeDom,
        })
        context.capabilities = facetCapabilities?.sanitizedMarkup ? capabilities : deniedRenderCapabilities
        const admitted = nodeStates.get(node.id)?.status !== 'quarantined'
        context.slotOutputs = admitted ? renderSlotOutputs(nodeForRender, materials, context, capabilities, nodeStates, resolvedPropsMap) : undefined
        const output = materials.render(nodeForRender, context, admitted)
        const renderSize = admitted ? materials.getRenderSize(nodeForRender, context) : { width: node.width, height: node.height }
        const elWrapper = createElementWrapper(document, nodeForRender, page, unit, renderSize)
        mounts.push(renderViewerTree(elWrapper, output.tree, {
          document,
          capabilities,
          maxNodes: browserDom?.maxNodes,
        }))
        contentLayer.appendChild(elWrapper)
      }
      catch (error) {
        diagnostics.push(materialRenderDiagnostic(node, error))
        contentLayer.appendChild(createMaterialRenderFallback(document, nodeForRender, page, unit))
      }
    }

    appendPageLayers(document, pageEl, pageLayerBuckets.overContent, page, unit, diagnostics)
    appendPageLayers(document, pageEl, pageLayerBuckets.top, page, unit, diagnostics)

    container.appendChild(wrapper)
    pageDOMs.push({
      pageIndex: page.index,
      element: pageEl,
      dispose: () => disposeMounts(mounts),
    })
  }

  return pageDOMs
}

function renderSlotOutputs(
  owner: MaterialNode<unknown>,
  materials: ProfileMaterialRuntime,
  context: ViewerRenderContext,
  browserCapabilities: BrowserDomCapabilities,
  nodeStates: ReadonlyMap<string, MaterialNodeLoadState>,
  resolvedPropsMap: ReadonlyMap<string, Record<string, unknown>>,
): Readonly<Record<string, readonly ReturnType<ProfileMaterialRuntime['render']>['tree'][]>> {
  const slots = new Map<string, MaterialNode<unknown>[]>()
  for (const structure of inspectMaterialNode(owner as MaterialNode, materials.profile, context.unit as UnitType).introspection.structures) {
    const children = slots.get(structure.slot) ?? []
    for (const child of structure.children) {
      if (!children.includes(child))
        children.push(child)
    }
    slots.set(structure.slot, children)
  }
  return Object.freeze(Object.fromEntries([...slots].map(([key, nodes]) => [
    key,
    Object.freeze(nodes.map((node) => {
      const admitted = nodeStates.get(node.id)?.status !== 'quarantined'
      const childContext: ViewerRenderContext = { ...context, resolvedProps: resolvedPropsMap.get(node.id) ?? node.model as Record<string, unknown>, slotOutputs: undefined }
      childContext.capabilities = materials.getCapabilities(node.type)?.sanitizedMarkup ? browserCapabilities : deniedRenderCapabilities
      childContext.slotOutputs = admitted ? renderSlotOutputs(node, materials, childContext, browserCapabilities, nodeStates, resolvedPropsMap) : undefined
      const childForRender = { ...node, model: childContext.resolvedProps }
      const output = materials.render(childForRender, childContext, admitted).tree
      return output
    })),
  ])))
}

function disposeMounts(mounts: readonly ViewerTreeMount[]): void {
  let firstError: unknown
  for (let index = mounts.length - 1; index >= 0; index--) {
    try {
      mounts[index]!.dispose()
    }
    catch (error) {
      firstError ??= error
    }
  }
  if (firstError)
    throw firstError
}

function materialRenderDiagnostic(node: MaterialNode<unknown>, error: unknown): ViewerDiagnosticEvent {
  const message = error instanceof Error ? error.message : String(error)
  return {
    category: 'viewer',
    severity: 'error',
    code: 'MATERIAL_RENDER_ERROR',
    message: `MATERIAL_RENDER_ERROR for node "${node.id}": ${message}`,
    nodeId: node.id,
    scope: 'material',
    cause: error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : error,
  }
}

function createMaterialRenderFallback(
  document: Document,
  node: MaterialNode<unknown>,
  page: PagePlanEntry,
  unit: string,
): HTMLElement {
  const wrapper = createElementWrapper(document, node, page, unit, { width: node.width, height: node.height })
  wrapper.setAttribute('data-render-error', 'true')
  const fallback = document.createElement('div')
  fallback.setAttribute('title', 'Render failed')
  fallback.style.width = '100%'
  fallback.style.height = '100%'
  fallback.style.display = 'flex'
  fallback.style.alignItems = 'center'
  fallback.style.justifyContent = 'center'
  fallback.style.backgroundColor = '#fff3f3'
  fallback.style.border = '1px dashed #ff4d4f'
  fallback.style.color = '#ff4d4f'
  fallback.style.fontSize = '11px'
  fallback.style.boxSizing = 'border-box'
  fallback.textContent = `[${node.type}]`
  wrapper.appendChild(fallback)
  return wrapper
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
  node: MaterialNode<unknown>,
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
