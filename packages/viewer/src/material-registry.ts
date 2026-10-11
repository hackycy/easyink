import type { MaterialBindingDefinition, MaterialConditionCapability, MaterialConditionDefinition } from '@easyink/core'
import type { ViewerContext, ViewerRenderer } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import type { createViewerMaterialHost } from './material-host'
import type { FragmentPaginator, ViewerMeasureContext, ViewerMeasureResult, ViewerRenderContext, ViewerRenderOutput, ViewerRenderSize } from './types'
import { resolveMaterialConditionCapability, trustedViewerHtml } from '@easyink/core'
import { deepClone, escapeHtml } from '@easyink/shared'

type MaterialConsumer = Awaited<ReturnType<typeof createViewerMaterialHost>>
export type MaterialRenderInput = ViewerRenderContext & Pick<ViewerContext, 'pageNumber' | 'totalPages' | 'copyIndex'>

/** Read-only framework consumer; declarations and acquired caches belong to the Host consumer. */
export class MaterialRendererRegistry {
  constructor(private readonly consumer: MaterialConsumer, private readonly document?: Document) {}

  async load(types: readonly string[]): Promise<void> {
    for (const type of new Set(types)) {
      const implementation = await this.consumer.getRenderer(type)
      if (this.consumer.host.state !== 'active')
        return
      if (implementation && !('render' in implementation))
        throw new Error(`Render Session consumer is not yet implemented for ${type}`)
    }
  }

  has(type: string): boolean {
    return !!this.consumer.host.registry.getMaterial(type)
  }

  render(node: MaterialNode, context: ViewerRenderContext | MaterialRenderInput): ViewerRenderOutput {
    const renderer = this.renderer(node.type)
    return renderer ? renderer.render(freezeSnapshot(node), this.context(node, context)) : renderUnknownMaterial(node)
  }

  measure(node: MaterialNode, context: ViewerMeasureContext): ViewerMeasureResult | null {
    const renderer = this.renderer(node.type)
    return renderer?.measure?.(freezeSnapshot(node), this.context(node, context)) ?? null
  }

  getRenderSize(node: MaterialNode, context: ViewerRenderContext | MaterialRenderInput): ViewerRenderSize {
    const size = this.renderer(node.type)?.getRenderSize?.(freezeSnapshot(node), this.context(node, context))
    return { width: size?.width ?? node.width, height: size?.height ?? node.height }
  }

  getFragmentPaginator(node: MaterialNode): FragmentPaginator | undefined {
    const paginator = this.renderer(node.type)?.fragmentPaginator
    return paginator?.canPaginate(node) ? paginator : undefined
  }

  isPageAware(type: string): boolean {
    return this.consumer.host.registry.getMaterial(type)?.value.model.pageAware ?? false
  }

  getBinding(type: string): MaterialBindingDefinition | undefined {
    return deepClone(this.consumer.host.registry.getMaterial(type)?.value.model.binding) as MaterialBindingDefinition | undefined
  }

  getCondition(type: string): MaterialConditionDefinition | undefined {
    return resolveMaterialConditionCapability(deepClone(this.consumer.host.registry.getMaterial(type)?.value.model.condition) as MaterialConditionCapability)
  }

  get registeredTypes(): string[] {
    return this.consumer.host.registry.materials.map(entry => entry.key)
  }

  private renderer(type: string): ViewerRenderer | undefined {
    if (this.consumer.host.state !== 'active')
      throw new Error('Viewer material consumer is disposed')
    const implementation = this.consumer.peekRenderer(type)
    return implementation && 'render' in implementation ? implementation : undefined
  }

  private context(node: MaterialNode, input: ViewerRenderContext | ViewerMeasureContext | MaterialRenderInput): ViewerContext {
    const resources = this.consumer.host.resources(node.type)
    const document = 'document' in input ? input.document : this.document
    if (!document)
      throw new Error('Viewer material context requires a target document')
    return Object.freeze({
      ...resources,
      document,
      data: readonlySnapshot(input.data),
      resolvedProps: readonlySnapshot('resolvedProps' in input ? input.resolvedProps : node.props),
      unit: input.unit,
      zoom: 'zoom' in input ? input.zoom : 1,
      pageIndex: 'pageIndex' in input ? input.pageIndex : 0,
      pageNumber: 'pageNumber' in input ? input.pageNumber : 'pageIndex' in input ? input.pageIndex + 1 : 1,
      totalPages: 'totalPages' in input ? input.totalPages : 1,
      copyIndex: 'copyIndex' in input ? input.copyIndex : 0,
      reportDiagnostic: (diagnostic: { code: string, message: string, nodeId?: string, cause?: unknown }) => {
        if (!resources.signal.aborted)
          input.reportDiagnostic?.({ ...diagnostic, severity: 'warning' })
      },
    })
  }
}

function readonlySnapshot<T>(value: T): T {
  return freezeSnapshot(deepClone(value))
}

function freezeSnapshot<T>(value: T): T {
  const seen = new WeakSet<object>()
  function freeze(current: unknown) {
    if (!current || typeof current !== 'object' || seen.has(current))
      return
    seen.add(current)
    for (const child of Object.values(current))
      freeze(child)
    Object.freeze(current)
  }
  freeze(value)
  return value
}

function renderUnknownMaterial(node: MaterialNode): ViewerRenderOutput {
  const typeText = escapeHtml(node.type)
  return {
    html: trustedViewerHtml(`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff3f3;border:1px dashed #ff4d4f;color:#ff4d4f;font-size:12px;box-sizing:border-box;">[Unknown: ${typeText}]</div>`),
  }
}
