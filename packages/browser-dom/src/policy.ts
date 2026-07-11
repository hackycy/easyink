import {
  VIEWER_TREE_ABSOLUTE_MAX_ATTRIBUTES,
  VIEWER_TREE_ABSOLUTE_MAX_DEPTH,
  VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES,
} from '@easyink/core'

export interface ViewerTreePolicy {
  readonly htmlTags: ReadonlySet<string>
  readonly svgTags: ReadonlySet<string>
  readonly globalAttributes: ReadonlySet<string>
  readonly urlAttributes: ReadonlySet<string>
  readonly cssProperties: ReadonlySet<string>
  readonly maxDepth: number
  readonly maxAttributesPerElement: number
  readonly maxTextBytes: number
  readonly allowUrl: (value: string, baseUrl?: string) => boolean
}

export class ViewerTreePolicyError extends Error {
  readonly code: string

  constructor(code: string) {
    super(code)
    this.name = 'ViewerTreePolicyError'
    this.code = code
  }
}

const htmlTags = [
  'div',
  'span',
  'p',
  'br',
  'img',
  'table',
  'caption',
  'colgroup',
  'col',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
]
const svgTags = [
  'svg',
  'g',
  'defs',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'stop',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'text',
  'tspan',
  'image',
]
const globalAttributes = [
  'id',
  'class',
  'role',
  'aria-label',
  'aria-hidden',
  'title',
  'lang',
  'dir',
  'alt',
  'src',
  'href',
  'xlink:href',
  'width',
  'height',
  'colspan',
  'rowspan',
  'scope',
  'headers',
  'abbr',
  'span',
  'start',
  'reversed',
  'xmlns',
  'xmlns:xlink',
  'viewBox',
  'preserveAspectRatio',
  'x',
  'y',
  'x1',
  'y1',
  'x2',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'd',
  'points',
  'transform',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'opacity',
  'clip-path',
  'clip-rule',
  'clipPathUnits',
  'gradientUnits',
  'gradientTransform',
  'offset',
  'stop-color',
  'stop-opacity',
  'text-anchor',
  'dominant-baseline',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'letter-spacing',
  'image-rendering',
  'vector-effect',
  'pathLength',
  'marker-start',
  'marker-mid',
  'marker-end',
  'filter',
  'mask',
  'color',
  'decoding',
  'loading',
]
const urlAttributes = ['src', 'href', 'xlink:href']
const cssProperties = [
  'display',
  'visibility',
  'overflow',
  'overflow-x',
  'overflow-y',
  'box-sizing',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'background',
  'background-color',
  'color',
  'opacity',
  'border',
  'border-width',
  'border-style',
  'border-color',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-overflow',
  'text-transform',
  'white-space',
  'word-break',
  'overflow-wrap',
  'vertical-align',
  'direction',
  'flex',
  'flex-basis',
  'flex-direction',
  'flex-flow',
  'flex-grow',
  'flex-shrink',
  'flex-wrap',
  'align-content',
  'align-items',
  'align-self',
  'justify-content',
  'justify-items',
  'justify-self',
  'gap',
  'row-gap',
  'column-gap',
  'grid',
  'grid-area',
  'grid-auto-columns',
  'grid-auto-flow',
  'grid-auto-rows',
  'grid-column',
  'grid-column-end',
  'grid-column-start',
  'grid-row',
  'grid-row-end',
  'grid-row-start',
  'grid-template',
  'grid-template-areas',
  'grid-template-columns',
  'grid-template-rows',
  'object-fit',
  'object-position',
  'transform',
  'transform-origin',
  'table-layout',
  'border-collapse',
  'border-spacing',
  'caption-side',
  'empty-cells',
  'list-style',
  'list-style-position',
  'list-style-type',
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-opacity',
  'clip-path',
  'shape-rendering',
  'text-anchor',
  'dominant-baseline',
]

export const DEFAULT_VIEWER_TREE_POLICY: ViewerTreePolicy = Object.freeze({
  htmlTags: readonlySet(htmlTags),
  svgTags: readonlySet(svgTags),
  globalAttributes: readonlySet(globalAttributes),
  urlAttributes: readonlySet(urlAttributes),
  cssProperties: readonlySet(cssProperties),
  maxDepth: VIEWER_TREE_ABSOLUTE_MAX_DEPTH,
  maxAttributesPerElement: VIEWER_TREE_ABSOLUTE_MAX_ATTRIBUTES,
  maxTextBytes: VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES,
  allowUrl: defaultAllowUrl,
})

function defaultAllowUrl(value: string, baseUrl?: string): boolean {
  if (Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })) {
    return false
  }
  const normalized = value.trim()
  if (normalized.startsWith('//') && !baseUrl)
    return false
  if (/^data:/i.test(normalized))
    return /^data:image\/(?:png|gif|jpe?g|webp|avif|bmp);base64,[a-z0-9+/=\s]+$/i.test(normalized)
  try {
    const url = baseUrl ? new URL(normalized, baseUrl) : new URL(normalized, 'https://easyink.invalid/')
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'blob:'
  }
  catch {
    return false
  }
}

export function assertSafeCssValue(value: string): void {
  const normalized = value.toLowerCase().replace(/\s+/g, '')
  if (value.includes('\\') || normalized.includes('url(') || normalized.includes('expression(') || normalized.includes('@import'))
    throw new ViewerTreePolicyError('VIEWER_TREE_CSS_VALUE_REJECTED')
}

export function assertSafeSvgPresentationValue(value: string): void {
  const normalized = value.toLowerCase().replace(/\s+/g, '')
  if (value.includes('\\') || normalized.includes('expression(') || normalized.includes('@import'))
    throw new ViewerTreePolicyError('VIEWER_TREE_CSS_VALUE_REJECTED')
  if (normalized.includes('url(') && !/^url\(#[a-z_][\w.:-]*\)$/i.test(normalized))
    throw new ViewerTreePolicyError('VIEWER_TREE_URL_REJECTED')
}

export function assertKebabCaseProperty(property: string): void {
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(property))
    throw new ViewerTreePolicyError('VIEWER_TREE_CSS_PROPERTY_REJECTED')
}

export function readonlySet<T>(values: Iterable<T>): ReadonlySet<T> {
  const set = new Set(values)
  const facade: ReadonlySet<T> = Object.freeze({
    get size() {
      return set.size
    },
    has: (value: T) => set.has(value),
    entries: () => set.entries(),
    keys: () => set.keys(),
    values: () => set.values(),
    forEach: (callback: (value: T, value2: T, set: ReadonlySet<T>) => void, thisArg?: unknown) => {
      set.forEach(value => callback.call(thisArg, value, value, facade))
    },
    [Symbol.iterator]: () => set[Symbol.iterator](),
  })
  return facade
}
