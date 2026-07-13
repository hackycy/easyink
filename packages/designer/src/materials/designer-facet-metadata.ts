import type { MaterialDesignerFacet, RuntimeMaterialSurface } from '@easyink/core'

const LOCALE_LIMITS = Object.freeze({ maxDepth: 32, maxNodes: 10_000, maxStringBytes: 256 * 1024 })

export function prepareDesignerFacetMetadata(value: unknown, surface: RuntimeMaterialSurface): unknown {
  if (surface !== 'designer')
    return value
  const extension = readOwnEnumerableData(value, 'extension', true)
  const catalog = readOwnEnumerableData(value, 'catalog', true)
  const localeMessages = readOwnEnumerableData(value, 'localeMessages', false)
  const layout = readOwnEnumerableData(value, 'layout', false)
  const dispose = readOwnEnumerableData(value, 'dispose', false)
  const contextualProperties = readOwnEnumerableData(value, 'contextualProperties', false)
  if (dispose !== undefined && typeof dispose !== 'function')
    throw new Error('MATERIAL_DESIGNER_FACET_DISPOSE_INVALID')
  if (contextualProperties !== undefined && typeof contextualProperties !== 'function')
    throw new Error('MATERIAL_DESIGNER_FACET_CONTEXTUAL_PROPERTIES_INVALID')

  const prepared: MaterialDesignerFacet = {
    extension: extension as MaterialDesignerFacet['extension'],
    catalog: catalog as MaterialDesignerFacet['catalog'],
    ...(localeMessages === undefined ? {} : { localeMessages: cloneLocaleRegistration(localeMessages) }),
    ...(layout === undefined ? {} : { layout: layout as MaterialDesignerFacet['layout'] }),
    ...(typeof dispose === 'function' ? { dispose: () => Reflect.apply(dispose, value, []) as void | Promise<void> } : {}),
    ...(typeof contextualProperties === 'function' ? { contextualProperties: request => Reflect.apply(contextualProperties, value, [request]) } : {}),
  }
  return Object.freeze(prepared)
}

function cloneLocaleRegistration(value: unknown): NonNullable<MaterialDesignerFacet['localeMessages']> {
  const budget = { nodes: 0, stringBytes: 0 }
  const clone = cloneJsonData(value, 0, budget)
  if (!isRecord(clone))
    throw new Error('MATERIAL_FACET_LOCALE_INVALID')
  const keys = Object.keys(clone)
  if (keys.some(key => key !== 'messages' && key !== 'locales'))
    throw new Error('MATERIAL_FACET_LOCALE_INVALID')
  if (clone.messages !== undefined && !isRecord(clone.messages))
    throw new Error('MATERIAL_FACET_LOCALE_INVALID')
  if (clone.locales !== undefined) {
    if (!isRecord(clone.locales) || Object.values(clone.locales).some(messages => !isRecord(messages)))
      throw new Error('MATERIAL_FACET_LOCALE_INVALID')
  }
  return deepFreeze(clone) as NonNullable<MaterialDesignerFacet['localeMessages']>
}

function cloneJsonData(value: unknown, depth: number, budget: { nodes: number, stringBytes: number }): unknown {
  if (depth > LOCALE_LIMITS.maxDepth || ++budget.nodes > LOCALE_LIMITS.maxNodes)
    throw new Error('MATERIAL_FACET_LOCALE_BUDGET_EXCEEDED')
  if (value === null || typeof value === 'boolean')
    return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new Error('MATERIAL_FACET_LOCALE_NON_JSON')
    return value
  }
  if (typeof value === 'string') {
    budget.stringBytes += value.length * 2
    if (budget.stringBytes > LOCALE_LIMITS.maxStringBytes)
      throw new Error('MATERIAL_FACET_LOCALE_BUDGET_EXCEEDED')
    return value
  }
  if (typeof value !== 'object' || value === null)
    throw new Error('MATERIAL_FACET_LOCALE_NON_JSON')

  if (Array.isArray(value)) {
    const result: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor || descriptor.enumerable !== true || !('value' in descriptor))
        throw new Error('MATERIAL_FACET_LOCALE_DESCRIPTOR_INVALID')
      result.push(cloneJsonData(descriptor.value, depth + 1, budget))
    }
    if (Object.keys(value).some(key => !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length))
      throw new Error('MATERIAL_FACET_LOCALE_NON_JSON')
    return result
  }

  const result: Record<string, unknown> = Object.create(null)
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor || descriptor.enumerable !== true || !('value' in descriptor))
      throw new Error('MATERIAL_FACET_LOCALE_DESCRIPTOR_INVALID')
    result[key] = cloneJsonData(descriptor.value, depth + 1, budget)
  }
  return result
}

function readOwnEnumerableData(value: unknown, key: string, required: boolean): unknown {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function')
    throw new Error('MATERIAL_DESIGNER_FACET_INVALID')
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor) {
    if (required)
      throw new Error('MATERIAL_DESIGNER_FACET_INVALID')
    return undefined
  }
  if (descriptor.enumerable !== true || !('value' in descriptor))
    throw new Error(key === 'localeMessages' ? 'MATERIAL_FACET_LOCALE_DESCRIPTOR_INVALID' : 'MATERIAL_DESIGNER_FACET_INVALID')
  return descriptor.value
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>))
      deepFreeze(item)
    Object.freeze(value)
  }
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
