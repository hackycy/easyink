import type { LayoutFragment, LayoutRuntimeRef, MaterialBindingDefinition, MaterialConditionCapability, MaterialConditionDefinition } from '@easyink/core'
import type { ResourceContext } from '@easyink/plugin-api'
import type { ViewerContext, ViewerSessionRenderer } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import type { createViewerMaterialHost } from './material-host'
import type { FragmentPaginator, ViewerMeasureContext, ViewerMeasureResult, ViewerRenderContext, ViewerRenderOutput, ViewerRenderSize } from './types'
import { createFragmentFromNode, resolveMaterialConditionCapability, trustedViewerHtml } from '@easyink/core'
import { deepClone, escapeHtml } from '@easyink/shared'

type MaterialConsumer = Awaited<ReturnType<typeof createViewerMaterialHost>>
export type MaterialRenderInput = ViewerRenderContext & Pick<ViewerContext, 'pageNumber' | 'totalPages' | 'copyIndex'>
  & { resources?: ResourceContext }

interface SourceInput {
  node: MaterialNode
  props: Record<string, unknown>
  resources: ResourceContext
  failed: boolean
}

interface ComputationResources {
  acquire: (type: string) => ResourceContext
  release: (context: ResourceContext) => void
}

/** Read-only framework consumer; declarations and acquired caches belong to the Host consumer. */
export class RenderSessionMaterials {
  private readonly loadFailures = new Map<string, unknown>()
  private readonly session = Symbol('render-session')
  private nextFragment = 0
  private readonly inputs = new Map<LayoutRuntimeRef, SourceInput>()
  private readonly sessions = new Map<string, ViewerSessionRenderer>()
  private readonly factoryFailures = new Map<string, unknown>()
  readonly runtimeRefs = new Map<string, LayoutRuntimeRef>()

  constructor(private readonly consumer: MaterialConsumer, private readonly document?: Document, private readonly computation?: ComputationResources) {}

  async load(types: readonly string[], signal?: AbortSignal): Promise<void> {
    for (const type of new Set(types)) {
      if (signal?.aborted)
        return
      try {
        await this.consumer.getRenderer(type)
        if (signal?.aborted)
          return
        this.loadFailures.delete(type)
      }
      catch (cause) {
        if (signal?.aborted || this.consumer.host.state !== 'active')
          return
        this.loadFailures.set(type, cause)
        continue
      }
      if (this.consumer.host.state !== 'active')
        return
    }
  }

  async prepare(nodes: MaterialNode[], props: ReadonlyMap<string, Record<string, unknown>>, context: ViewerMeasureContext, signal: AbortSignal): Promise<void> {
    // Allocate every source before any await; preparation cannot depend on another type's state.
    for (const node of nodes) {
      if (!this.has(node.type))
        continue
      const ref = this.allocateRef()
      this.runtimeRefs.set(node.id, ref)
      this.inputs.set(ref, {
        node,
        props: readonlySnapshot(props.get(node.id) ?? node.props),
        resources: this.acquire(node.type),
        failed: this.loadFailures.has(node.type),
      })
    }
    for (const node of nodes) {
      if (signal.aborted)
        return
      if (node.hidden || !this.has(node.type))
        continue
      const ref = this.runtimeRefs.get(node.id)!
      const entry = this.inputs.get(ref)!
      if (entry.failed)
        continue
      try {
        const renderer = this.renderer(node.type)
        if (signal.aborted || entry.resources.signal.aborted)
          return
        if (renderer?.prepare) {
          await renderer.prepare(freezeSnapshot({ ...node, props: entry.props }), this.context(node, { ...context, runtimeRef: ref }))
          if (signal.aborted || entry.resources.signal.aborted)
            return
        }
      }
      catch (cause) {
        if (signal.aborted || entry.resources.signal.aborted)
          return
        this.fail(entry, 'MATERIAL_PREPARE_ERROR', cause, context)
      }
    }
  }

  resolveProps(ref: LayoutRuntimeRef | undefined, fallback: Record<string, unknown>): Record<string, unknown> {
    return ref ? this.inputs.get(ref)?.props ?? fallback : fallback
  }

  has(type: string): boolean {
    return !!this.consumer.host.registry.getMaterial(type)
  }

  render(node: MaterialNode, context: ViewerRenderContext | MaterialRenderInput): ViewerRenderOutput {
    if (this.has(node.type) && !this.loadFailures.has(node.type)) {
      const entry = this.input(node, context)
      if (!entry || entry.failed)
        return renderUnknownMaterial(node, 'Unavailable')
      return synchronous(this.renderer(node.type)!.render(freezeSnapshot(node), this.context(node, context)))
    }
    const failed = this.loadFailures.has(node.type)
    context.reportDiagnostic?.({
      code: failed ? 'MATERIAL_LOAD_ERROR' : 'UNKNOWN_MATERIAL',
      severity: 'warning',
      message: failed ? `Material loader failed: ${node.type}` : `Material is not installed: ${node.type}`,
      nodeId: node.id,
      cause: this.loadFailures.get(node.type),
    })
    return renderUnknownMaterial(node, failed ? 'Unavailable' : 'Unknown')
  }

  measure(node: MaterialNode, context: ViewerMeasureContext): ViewerMeasureResult | null {
    if (!this.has(node.type))
      return null
    const entry = this.input(node, context)
    if (!entry || entry.failed || node.hidden)
      return null
    try {
      const renderer = this.renderer(node.type)
      return renderer?.measure ? synchronous(renderer.measure(freezeSnapshot(node), this.context(node, context))) : null
    }
    catch (cause) {
      this.fail(entry, 'MATERIAL_MEASURE_ERROR', cause, context)
      return null
    }
  }

  getRenderSize(node: MaterialNode, context: ViewerRenderContext | MaterialRenderInput): ViewerRenderSize {
    const entry = context.runtimeRef ? this.inputs.get(context.runtimeRef) : undefined
    const renderer = entry && entry.node.type === node.type && !entry.failed && !entry.resources.signal.aborted ? this.renderer(node.type) : undefined
    const size = renderer?.getRenderSize ? synchronous(renderer.getRenderSize(freezeSnapshot(node), this.context(node, context))) : undefined
    return { width: size?.width ?? node.width, height: size?.height ?? node.height }
  }

  getFragmentPaginator(fragment: LayoutFragment, context: ViewerMeasureContext): FragmentPaginator | undefined {
    const node = fragment.node
    if (!this.has(node.type) || node.hidden)
      return undefined
    const entry = this.input(node, { ...context, runtimeRef: fragment.runtimeRef })
    if (!entry || entry.failed)
      return undefined
    let paginator: FragmentPaginator | undefined
    try {
      paginator = this.renderer(node.type)?.fragmentPaginator
      if (!paginator || !synchronous(paginator.canPaginate(freezeSnapshot(node))))
        return undefined
    }
    catch (cause) {
      this.fail(entry, 'MATERIAL_PAGINATE_ERROR', cause, context)
      return { canPaginate: () => true, paginateFragment: input => ({ currentPage: placeholderFragment(input.fragment, entry.node), diagnostics: [] }) }
    }
    return {
      canPaginate: () => true,
      paginateFragment: (input) => {
        const derived = new Set<LayoutRuntimeRef>()
        try {
          const remaining = synchronous(paginator!.getRemainingContent?.(input.fragment))
          assertRemainingContent(remaining)
          const split = synchronous(paginator!.paginateFragment({
            ...input,
            createFragment: (childNode) => {
              const runtimeRef = this.allocateRef()
              derived.add(runtimeRef)
              this.inputs.set(runtimeRef, entry)
              return { ...createFragmentFromNode(childNode), sourceNodeId: fragment.sourceNodeId, flow: fragment.flow, runtimeRef }
            },
          }))
          for (const part of [split.currentPage, split.nextPage]) {
            if (part && (part.sourceNodeId !== fragment.sourceNodeId || part.node.type !== node.type
              || (part.runtimeRef !== fragment.runtimeRef && !derived.has(part.runtimeRef!)))) {
              throw new Error('Paginator returned an unowned fragment')
            }
          }
          if (split.nextPage) {
            const nextRemaining = synchronous(paginator!.getRemainingContent?.(split.nextPage))
            assertRemainingContent(nextRemaining)
            if (!derived.has(split.currentPage.runtimeRef!) || !derived.has(split.nextPage.runtimeRef!) || split.currentPage.runtimeRef === split.nextPage.runtimeRef || nextRemaining >= remaining)
              throw new Error('Paginator must reduce remaining content and assign a new reference')
          }
          return split
        }
        catch (cause) {
          for (const ref of derived)
            this.inputs.delete(ref)
          this.fail(entry, 'MATERIAL_PAGINATE_ERROR', cause, context)
          return { currentPage: placeholderFragment(input.fragment, entry.node), diagnostics: [] }
        }
      },
    }
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

  private renderer(type: string): ViewerSessionRenderer | undefined {
    if (this.consumer.host.state !== 'active')
      throw new Error('Viewer material consumer is disposed')
    const implementation = this.consumer.peekRenderer(type)
    if (!implementation)
      return undefined
    if ('render' in implementation)
      return implementation
    if (this.factoryFailures.has(type))
      throw this.factoryFailures.get(type)
    const existing = this.sessions.get(type)
    if (existing)
      return existing
    const resources = this.acquire(type)
    try {
      const renderer = synchronous(implementation.createSession(resources))
      if (!renderer || typeof renderer.render !== 'function')
        throw new TypeError('A synchronous session factory must return a renderer')
      this.sessions.set(type, renderer)
      return renderer
    }
    catch (cause) {
      this.computation?.release(resources)
      this.factoryFailures.set(type, cause)
      throw cause
    }
  }

  private context(node: MaterialNode, input: ViewerRenderContext | ViewerMeasureContext | MaterialRenderInput): ViewerContext {
    const entry = this.inputs.get(input.runtimeRef!)!
    const resources = 'resources' in input && input.resources ? input.resources : entry.resources
    const document = 'document' in input ? input.document : this.document
    return Object.freeze({
      ...resources,
      runtimeRef: input.runtimeRef!,
      get document() {
        if (!document)
          throw new Error('This material operation requires a target document')
        return document
      },
      data: readonlySnapshot(input.data),
      resolvedProps: readonlySnapshot('resolvedProps' in input ? input.resolvedProps : entry.props),
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

  private acquire(type: string): ResourceContext {
    return this.computation?.acquire(type) ?? this.consumer.host.resources(type)
  }

  private allocateRef(): LayoutRuntimeRef {
    return Object.freeze({ session: this.session, fragment: ++this.nextFragment })
  }

  private input(node: MaterialNode, context: ViewerRenderContext | ViewerMeasureContext): SourceInput | undefined {
    const entry = context.runtimeRef ? this.inputs.get(context.runtimeRef) : undefined
    if (!entry || entry.node.type !== node.type || (!entry.failed && entry.resources.signal.aborted)) {
      context.reportDiagnostic?.({ code: 'MATERIAL_RUNTIME_REF_ERROR', severity: 'warning', message: `Missing or invalid render reference for ${node.id}`, nodeId: node.id })
      return undefined
    }
    return entry
  }

  private fail(entry: SourceInput, code: string, cause: unknown, context: ViewerRenderContext | ViewerMeasureContext): void {
    if (entry.failed)
      return
    entry.failed = true
    this.computation?.release(entry.resources)
    context.reportDiagnostic?.({ code, severity: 'warning', message: `Material computation failed for ${entry.node.id}`, nodeId: entry.node.id, cause })
  }
}

function placeholderFragment(fragment: LayoutFragment, source: MaterialNode): LayoutFragment {
  return {
    ...fragment,
    node: { ...fragment.node, width: source.width, height: source.height },
    box: { ...fragment.box, width: source.width, height: source.height },
  }
}

function synchronous<T>(value: T): T {
  if (value && typeof value === 'object' && 'then' in value && typeof value.then === 'function') {
    // Observe a contract-violating Promise without allowing late rejection to escape.
    void Promise.resolve(value).catch(() => {})
    throw new TypeError('Only prepare may return a Promise')
  }
  return value
}

function assertRemainingContent(value: unknown): asserts value is number {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError('A paginator must report non-negative safe-integer remaining content')
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

function renderUnknownMaterial(node: MaterialNode, label: string): ViewerRenderOutput {
  const typeText = escapeHtml(node.type)
  return {
    html: trustedViewerHtml(`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#fff3f3;border:1px dashed #ff4d4f;color:#ff4d4f;font-size:12px;box-sizing:border-box;">[${label}: ${typeText}]</div>`),
  }
}
