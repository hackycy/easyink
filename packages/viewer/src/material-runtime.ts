import type {
  CompiledMaterialProfile,
  FacetDiagnostic,
  FacetInstance,
  FragmentPaginator,
  MaterialConditionDefinition,
  MaterialViewerExtension,
  MaterialViewerFacet,
  MaterialViewerLayoutFacet,
  ViewerMeasureContext,
  ViewerMeasureResult,
  ViewerRenderContext,
  ViewerRenderOutput,
  ViewerRenderSize,
} from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { MaterialFacetHost, resolveMaterialConditionCapability, viewerElement, viewerText } from '@easyink/core'

export type ViewerFacetServices = (
  profile: CompiledMaterialProfile,
  materialType: string,
) => unknown

/** Viewer-facing facade over the profile-owned material manifests and facet host. */
export class ProfileMaterialRuntime {
  readonly profile: CompiledMaterialProfile
  readonly facetHost: MaterialFacetHost

  constructor(profile: CompiledMaterialProfile, getServices?: ViewerFacetServices) {
    this.profile = profile
    this.facetHost = new MaterialFacetHost({
      getActivationServices: (activeProfile, materialType) => getServices?.(activeProfile, materialType),
      prepareValue: value => assertViewerFacet(value),
    })
  }

  async prepare(types: Iterable<string>): Promise<readonly FacetDiagnostic[]> {
    const uniqueTypes = [...new Set(types)]
    const instances = await Promise.all(uniqueTypes.map(type => this.facetHost.activate<MaterialViewerFacet>(this.profile, type, 'viewer')))
    return Object.freeze(instances.flatMap(instance => instance.diagnostic ? [instance.diagnostic] : []))
  }

  get(type: string): FacetInstance<MaterialViewerFacet> | undefined {
    return this.facetHost.peek(this.profile, type, 'viewer')
  }

  getExtension(type: string): MaterialViewerExtension | undefined {
    const instance = this.get(type)
    return instance?.state === 'active' ? instance.value?.extension : undefined
  }

  getCapabilities(type: string): MaterialViewerFacet['capabilities'] | undefined {
    const instance = this.get(type)
    return instance?.state === 'active' ? instance.value?.capabilities : undefined
  }

  render(node: MaterialNode<unknown>, context: ViewerRenderContext, admitted = true): ViewerRenderOutput {
    return admitted
      ? this.getExtension(node.type)?.render(node as MaterialNode, context) ?? renderUnavailableMaterial(node)
      : renderUnavailableMaterial(node)
  }

  measure(node: MaterialNode<unknown>, context: ViewerMeasureContext): ViewerMeasureResult | null {
    return this.getExtension(node.type)?.measure?.(node as MaterialNode, context) ?? null
  }

  getRenderSize(node: MaterialNode<unknown>, context: ViewerRenderContext): ViewerRenderSize {
    const size = this.getExtension(node.type)?.getRenderSize?.(node as MaterialNode, context)
    return { width: size?.width ?? node.width, height: size?.height ?? node.height }
  }

  getFragmentPaginator(node: MaterialNode<unknown>): FragmentPaginator | undefined {
    const paginator = this.getExtension(node.type)?.fragmentPaginator
    return paginator?.canPaginate(node as MaterialNode) ? paginator : undefined
  }

  getBinding(type: string) {
    return this.profile.getManifest(type)?.common.binding
  }

  getCondition(type: string): MaterialConditionDefinition | undefined {
    return resolveMaterialConditionCapability(this.profile.getManifest(type)?.common.condition)
  }

  isPageRepeated(type: string): boolean {
    return this.profile.getManifest(type)?.common.layout.pageRepeat === 'every-output-page'
  }

  dispose(): Promise<readonly FacetDiagnostic[]> {
    return this.facetHost.dispose()
  }
}

function assertViewerFacet(value: unknown): MaterialViewerFacet {
  if (!isRecord(value))
    throw new Error('MATERIAL_VIEWER_FACET_INVALID')
  const extension = readOwnDataValue(value, 'extension')
  const capabilities = readOwnDataValue(value, 'capabilities')
  if (!isRecord(extension) || !readOwnDataMethod(extension, 'render') || !isRecord(capabilities))
    throw new Error('MATERIAL_VIEWER_FACET_INVALID')
  const imperativeDom = readOwnDataValue(capabilities, 'imperativeDom')
  if (imperativeDom !== undefined && (!Array.isArray(imperativeDom) || imperativeDom.some(item => typeof item !== 'string')))
    throw new Error('MATERIAL_VIEWER_FACET_CAPABILITIES_INVALID')
  const sanitizedMarkup = readOwnDataValue(capabilities, 'sanitizedMarkup')
  if (sanitizedMarkup !== undefined && typeof sanitizedMarkup !== 'boolean')
    throw new Error('MATERIAL_VIEWER_FACET_CAPABILITIES_INVALID')
  Object.freeze(extension)
  const layout = readOwnDataValue(value, 'layout')
  if (layout !== undefined && !isRecord(layout))
    throw new Error('MATERIAL_VIEWER_LAYOUT_FACET_INVALID')
  const layoutSnapshot = layout ? snapshotViewerLayoutFacet(layout) : undefined
  const dispose = readOwnDataMethod(value, 'dispose')
  return Object.freeze({
    extension,
    ...(layoutSnapshot ? { layout: layoutSnapshot } : {}),
    capabilities: Object.freeze({
      ...(sanitizedMarkup === undefined ? {} : { sanitizedMarkup }),
      ...(imperativeDom === undefined ? {} : { imperativeDom: Object.freeze([...imperativeDom]) }),
    }),
    ...(dispose ? { dispose: () => Reflect.apply(dispose, value, []) } : {}),
  }) as unknown as MaterialViewerFacet
}

function snapshotViewerLayoutFacet(value: Record<string, unknown>): MaterialViewerLayoutFacet {
  const resolveRuntimeModel = readOptionalMethod(value, 'resolveRuntimeModel')
  const measure = readOptionalMethod(value, 'measure')
  const fragmentValue = readOwnDataValue(value, 'fragment')
  if (fragmentValue !== undefined && !isRecord(fragmentValue))
    throw new Error('MATERIAL_VIEWER_LAYOUT_FACET_INVALID')
  const createFragment = fragmentValue ? readOptionalMethod(fragmentValue, 'createFragment') : undefined
  if (fragmentValue && !createFragment)
    throw new Error('MATERIAL_VIEWER_LAYOUT_FACET_INVALID')

  return Object.freeze({
    ...(resolveRuntimeModel ? { resolveRuntimeModel } : {}),
    ...(measure ? { measure } : {}),
    ...(createFragment ? { fragment: Object.freeze({ createFragment }) } : {}),
  }) as MaterialViewerLayoutFacet
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readOwnDataValue(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  return descriptor && 'value' in descriptor ? descriptor.value : undefined
}

function readOwnDataMethod(value: object, key: string): ((...args: unknown[]) => unknown) | undefined {
  const candidate = readOwnDataValue(value, key)
  return typeof candidate === 'function' ? candidate as (...args: unknown[]) => unknown : undefined
}

function readOptionalMethod(value: object, key: string): ((...args: unknown[]) => unknown) | undefined {
  const candidate = readOwnDataValue(value, key)
  if (candidate !== undefined && typeof candidate !== 'function')
    throw new Error('MATERIAL_VIEWER_LAYOUT_FACET_INVALID')
  return candidate as ((...args: unknown[]) => unknown) | undefined
}

function renderUnavailableMaterial(node: MaterialNode<unknown>): ViewerRenderOutput {
  return {
    tree: viewerElement('div', { style: {
      'width': '100%',
      'height': '100%',
      'display': 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      'background-color': '#fff3f3',
      'border': '1px dashed #ff4d4f',
      'color': '#ff4d4f',
      'font-size': '12px',
      'box-sizing': 'border-box',
    } }, [viewerText(`[Unavailable: ${node.type}]`)]),
  }
}
