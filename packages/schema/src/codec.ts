import type { DocumentSchema, DocumentSchemaInput, MaterialNode, MaterialNodeInput, PageSchema } from './types'
import { isObject } from '@easyink/shared'

/** Benchmark (report-designer) compatibility input format. */
export interface BenchmarkDocumentInput {
  unit?: string
  x?: number[]
  y?: number[]
  g?: unknown[]
  page: Record<string, unknown>
  elements: BenchmarkElementInput[]
  [key: string]: unknown
}

export interface BenchmarkElementInput {
  id?: string
  type?: string
  x?: number
  y?: number
  left?: number
  top?: number
  width?: number
  height?: number
  [key: string]: unknown
}

const PAGE_FIELD_MAP: Record<string, keyof PageSchema> = {
  viewer: 'mode',
  width: 'width',
  height: 'height',
  pages: 'pages',
  scale: 'scale',
  radius: 'radius',
  xOffset: 'offsetX',
  yOffset: 'offsetY',
  copies: 'copies',
  blank: 'blankPolicy',
  font: 'font',
}

/** Decode benchmark data without resolving any material-private schema. */
export function decodeBenchmarkInput(input: BenchmarkDocumentInput): DocumentSchemaInput {
  const passthrough: Record<string, unknown> = {}
  const rawPage = isObject(input.page) ? input.page : {}
  const page: Record<string, unknown> = {}
  for (const [rawKey, canonicalKey] of Object.entries(PAGE_FIELD_MAP)) {
    if (rawKey in rawPage)
      page[canonicalKey] = rawPage[rawKey]
  }
  if ('gridWidth' in rawPage || 'gridHeight' in rawPage) {
    page.grid = { enabled: true, width: rawPage.gridWidth ?? 10, height: rawPage.gridHeight ?? 10 }
  }
  const background: Record<string, unknown> = {}
  if (typeof rawPage.background === 'string') {
    if (rawPage.background.startsWith('http') || rawPage.background.startsWith('data:'))
      background.image = rawPage.background
    else
      background.color = rawPage.background
  }
  for (const [rawKey, canonicalKey] of [
    ['backgroundRepeat', 'repeat'],
    ['backgroundWidth', 'width'],
    ['backgroundHeight', 'height'],
    ['backgroundXOffset', 'offsetX'],
    ['backgroundYOffset', 'offsetY'],
  ] as const) {
    if (rawKey in rawPage)
      background[canonicalKey] = rawPage[rawKey]
  }
  if (Object.keys(background).length > 0)
    page.background = background

  const knownPageKeys = new Set([
    ...Object.keys(PAGE_FIELD_MAP),
    'gridWidth',
    'gridHeight',
    'background',
    'backgroundRepeat',
    'backgroundWidth',
    'backgroundHeight',
    'backgroundXOffset',
    'backgroundYOffset',
  ])
  for (const [key, value] of Object.entries(rawPage)) {
    if (!knownPageKeys.has(key))
      passthrough[`page.${key}`] = value
  }
  for (const [key, value] of Object.entries(input)) {
    if (!['unit', 'x', 'y', 'g', 'page', 'elements'].includes(key))
      passthrough[key] = value
  }

  const result: DocumentSchemaInput = {
    unit: (input.unit as DocumentSchema['unit']) || 'mm',
    page: { mode: 'fixed', width: 210, height: 297, ...page } as DocumentSchemaInput['page'],
    guides: {
      x: Array.isArray(input.x) ? input.x : [],
      y: Array.isArray(input.y) ? input.y : [],
      ...(Array.isArray(input.g)
        ? { groups: input.g.map((group, index) => ({ id: `g_${index}`, x: [], y: [], ...(isObject(group) ? group : {}) })) as never }
        : {}),
    },
    elements: Array.isArray(input.elements) ? input.elements.map(decodeBenchmarkElement) : [],
  }
  if (Object.keys(passthrough).length > 0 || input.g)
    result.compat = { ...(input.g ? { rawGuideGroupKey: 'g' } : {}), ...(Object.keys(passthrough).length > 0 ? { passthrough } : {}) }
  return result
}

function decodeBenchmarkElement(input: BenchmarkElementInput): MaterialNodeInput {
  const result: Record<string, unknown> = { ...input }
  result.id = typeof input.id === 'string' && input.id ? input.id : `el_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
  result.type = typeof input.type === 'string' && input.type ? input.type : 'unknown'
  result.x = input.x ?? input.left ?? 0
  result.y = input.y ?? input.top ?? 0
  result.width = input.width ?? 100
  result.height = input.height ?? 50
  delete result.left
  delete result.top
  return result as MaterialNodeInput
}

/** Encode only admitted canonical documents. Material-private exports belong to profile tooling. */
export function encodeToBenchmark(schema: DocumentSchema): BenchmarkDocumentInput {
  assertCanonicalDocument(schema)
  const page: Record<string, unknown> = {}
  for (const [rawKey, canonicalKey] of Object.entries(PAGE_FIELD_MAP)) {
    const value = schema.page[canonicalKey]
    if (value !== undefined)
      page[rawKey] = value
  }
  if (schema.page.grid) {
    page.gridWidth = schema.page.grid.width
    page.gridHeight = schema.page.grid.height
  }
  if (schema.page.background) {
    const background = schema.page.background
    page.background = background.image || background.color
    if (background.repeat !== undefined)
      page.backgroundRepeat = background.repeat
    if (background.width !== undefined)
      page.backgroundWidth = background.width
    if (background.height !== undefined)
      page.backgroundHeight = background.height
    if (background.offsetX !== undefined)
      page.backgroundXOffset = background.offsetX
    if (background.offsetY !== undefined)
      page.backgroundYOffset = background.offsetY
  }
  const result: BenchmarkDocumentInput = {
    unit: schema.unit,
    x: schema.guides.x,
    y: schema.guides.y,
    page,
    elements: schema.elements.map(encodeBenchmarkElement),
  }
  if (schema.guides.groups)
    result.g = schema.guides.groups
  for (const [key, value] of Object.entries(schema.compat?.passthrough ?? {})) {
    if (!key.startsWith('page.'))
      result[key] = value
  }
  return result
}

function encodeBenchmarkElement(node: MaterialNode): BenchmarkElementInput {
  const result: BenchmarkElementInput = {
    id: node.id,
    type: node.type,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
    props: node.model,
  }
  for (const key of ['rotation', 'alpha', 'zIndex'] as const) {
    if (node[key] !== undefined)
      result[key] = node[key]
  }
  if (node.editorState?.name !== undefined)
    result.name = node.editorState.name
  if (node.editorState?.locked !== undefined)
    result.locked = node.editorState.locked
  if (node.editorState?.hidden !== undefined)
    result.hidden = node.editorState.hidden
  if (node.output.renderCondition !== undefined)
    result.renderCondition = node.output.renderCondition
  if (node.output.print !== undefined)
    result.print = node.output.print
  if (node.bindings.value !== undefined)
    result.bind = node.bindings.value
  if (node.slots.default !== undefined)
    result.children = node.slots.default
  return result
}

function assertCanonicalDocument(schema: DocumentSchema): void {
  const stack: unknown[] = Array.isArray(schema?.elements) ? [...schema.elements] : []
  while (stack.length > 0) {
    const node = stack.pop()
    if (!isObject(node)
      || typeof node.modelVersion !== 'number'
      || !isObject(node.model)
      || !isObject(node.slots)
      || !isObject(node.bindings)
      || !isObject(node.output)
      || ['props', 'binding', 'children', 'table', 'unit', 'hidden', 'locked', 'name'].some(key => Object.hasOwn(node, key))) {
      throw new Error('BENCHMARK_ENCODE_REQUIRES_CANONICAL_SCHEMA')
    }
    for (const children of Object.values(node.slots)) {
      if (!Array.isArray(children))
        throw new Error('BENCHMARK_ENCODE_REQUIRES_CANONICAL_SCHEMA')
      stack.push(...children)
    }
  }
}
