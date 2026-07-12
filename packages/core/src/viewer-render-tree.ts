const sanitizedMarkupBrand: unique symbol = Symbol('SanitizedMarkup')
const viewerHostMountBrand: unique symbol = Symbol('ViewerHostMountReference')
const VIEWER_CHILDREN_KEY = 'children'

export interface SanitizedMarkup {
  readonly [sanitizedMarkupBrand]: true
}

export const VIEWER_TREE_ABSOLUTE_MAX_NODES = 50_000
export const VIEWER_TREE_ABSOLUTE_MAX_DEPTH = 128
export const VIEWER_TREE_ABSOLUTE_MAX_ATTRIBUTES = 128
export const VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES = 1024 * 1024

export type ViewerElementNamespace = 'html' | 'svg'
export type ViewerAttributeValue = string | number | boolean
export type ViewerStyleValue = string | number

export interface ViewerTextTree {
  readonly kind: 'text'
  readonly value: string
}

export interface ViewerElementTree {
  readonly kind: 'element'
  readonly tag: string
  readonly namespace: ViewerElementNamespace
  readonly attributes: Readonly<Record<string, ViewerAttributeValue>>
  readonly style: Readonly<Record<string, ViewerStyleValue>>
  readonly children: readonly ViewerRenderTree[]
}

export interface ViewerFragmentTree {
  readonly kind: 'fragment'
  readonly children: readonly ViewerRenderTree[]
}

export interface ViewerSanitizedMarkupTree {
  readonly kind: 'sanitized-markup'
  readonly markup: SanitizedMarkup
}

export interface ViewerImperativeHost {
  readonly element: HTMLElement
  render: (tree: ViewerRenderTree, options?: { maxNodes?: number }) => { dispose: () => void }
}

export interface ViewerImperativeDomTree {
  readonly kind: 'imperative-dom'
  readonly capability: string
  readonly mount: (host: ViewerImperativeHost) => () => void
}

export interface ViewerHostMountReference {
  readonly [viewerHostMountBrand]: true
}

export interface ViewerHostMountTree {
  readonly kind: 'host-mount'
  readonly reference: ViewerHostMountReference
}

export type ViewerRenderTree
  = | ViewerTextTree
    | ViewerElementTree
    | ViewerFragmentTree
    | ViewerSanitizedMarkupTree
    | ViewerImperativeDomTree
    | ViewerHostMountTree

export interface ViewerElementOptions {
  namespace?: ViewerElementNamespace
  attributes?: Readonly<Record<string, ViewerAttributeValue>>
  style?: Readonly<Record<string, ViewerStyleValue>>
}

export function viewerText(value: string): ViewerTextTree {
  return Object.freeze({ kind: 'text', value })
}

export function viewerElement(
  tag: string,
  options: ViewerElementOptions = {},
  children: readonly ViewerRenderTree[] = [],
): ViewerElementTree {
  return Object.freeze({
    kind: 'element',
    tag,
    namespace: options.namespace ?? 'html',
    attributes: Object.freeze({ ...options.attributes }),
    style: Object.freeze({ ...options.style }),
    children: Object.freeze([...children]),
  })
}

export function viewerFragment(children: readonly ViewerRenderTree[]): ViewerFragmentTree {
  return Object.freeze({ kind: 'fragment', children: Object.freeze([...children]) })
}

export function viewerSanitizedMarkup(markup: SanitizedMarkup): ViewerSanitizedMarkupTree {
  return Object.freeze({ kind: 'sanitized-markup', markup })
}

export function viewerImperativeDom(
  capability: string,
  mount: (host: ViewerImperativeHost) => (() => void) | void,
): ViewerImperativeDomTree {
  return Object.freeze({
    kind: 'imperative-dom',
    capability,
    mount(host: ViewerImperativeHost) {
      const disposer = mount(host)
      if (typeof disposer !== 'function')
        throw new Error('VIEWER_IMPERATIVE_DISPOSER_REQUIRED')
      return disposer
    },
  })
}

interface NodeFrame {
  kind: 'node'
  node: unknown
  depth: number
}

interface ChildrenFrame {
  kind: 'children'
  children: readonly unknown[]
  index: number
  length: number
  depth: number
}

interface ExitFrame {
  kind: 'exit'
  node: object
}

type WalkFrame = NodeFrame | ChildrenFrame | ExitFrame

export function assertViewerRenderTree(
  tree: ViewerRenderTree,
  options: {
    maxNodes?: number
    maxDepth?: number
    maxTextBytes?: number
    onVisitNode?: () => void
    onVisitText?: (value: string) => void
  } = {},
): asserts tree is ViewerRenderTree {
  const maxNodes = options.maxNodes ?? VIEWER_TREE_ABSOLUTE_MAX_NODES
  const maxDepth = options.maxDepth ?? VIEWER_TREE_ABSOLUTE_MAX_DEPTH
  const maxTextBytes = options.maxTextBytes ?? VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES
  if (!Number.isFinite(maxNodes) || !Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
    fail('VIEWER_TREE_BUDGET_INVALID')
  if (!Number.isFinite(maxDepth) || !Number.isInteger(maxDepth) || maxDepth < 0 || maxDepth > VIEWER_TREE_ABSOLUTE_MAX_DEPTH)
    fail('VIEWER_TREE_BUDGET_INVALID')
  if (!Number.isFinite(maxTextBytes) || !Number.isInteger(maxTextBytes) || maxTextBytes < 0 || maxTextBytes > VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES)
    fail('VIEWER_TREE_BUDGET_INVALID')

  const active = new WeakSet<object>()
  const stack: WalkFrame[] = [{ kind: 'node', node: tree, depth: 0 }]
  let nodes = 0
  let textBytes = 0

  while (stack.length > 0) {
    const frame = stack.pop()!
    if (frame.kind === 'exit') {
      active.delete(frame.node)
      continue
    }
    if (frame.kind === 'children') {
      if (frame.index < frame.length) {
        stack.push({ ...frame, index: frame.index + 1 })
        stack.push({ kind: 'node', node: frame.children[frame.index], depth: frame.depth })
      }
      continue
    }
    options.onVisitNode?.()
    if (++nodes > maxNodes)
      fail('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
    if (!isRecord(frame.node))
      fail('VIEWER_TREE_KIND_INVALID')
    if (active.has(frame.node))
      fail('VIEWER_TREE_CYCLE')
    if (frame.depth > maxDepth)
      fail('VIEWER_TREE_DEPTH_EXCEEDED')

    active.add(frame.node)
    stack.push({ kind: 'exit', node: frame.node })
    switch (frame.node.kind) {
      case 'text':
        if (typeof frame.node.value !== 'string')
          fail('VIEWER_TREE_VALUE_INVALID')
        options.onVisitText?.(frame.node.value)
        textBytes += boundedUtf8ByteLength(frame.node.value, maxTextBytes - textBytes)
        if (textBytes > VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES)
          fail('VIEWER_TREE_TEXT_EXCEEDED')
        if (textBytes > maxTextBytes)
          fail('VIEWER_TREE_TEXT_EXCEEDED')
        break
      case 'element': {
        if (typeof frame.node.tag !== 'string' || (frame.node.namespace !== 'html' && frame.node.namespace !== 'svg'))
          fail('VIEWER_TREE_VALUE_INVALID')
        assertScalarRecord(frame.node.attributes, true)
        assertScalarRecord(frame.node.style, false)
        if (Object.keys(frame.node.attributes).length > VIEWER_TREE_ABSOLUTE_MAX_ATTRIBUTES)
          fail('VIEWER_TREE_ATTRIBUTES_EXCEEDED')
        if (!Array.isArray(frame.node[VIEWER_CHILDREN_KEY]))
          fail('VIEWER_TREE_VALUE_INVALID')
        const children = frame.node[VIEWER_CHILDREN_KEY]
        stack.push({ kind: 'children', children, index: 0, length: children.length, depth: frame.depth + 1 })
        break
      }
      case 'fragment':
        if (!Array.isArray(frame.node[VIEWER_CHILDREN_KEY]))
          fail('VIEWER_TREE_VALUE_INVALID')
        stack.push({
          kind: 'children',
          children: frame.node[VIEWER_CHILDREN_KEY],
          index: 0,
          length: frame.node[VIEWER_CHILDREN_KEY].length,
          depth: frame.depth + 1,
        })
        break
      case 'sanitized-markup':
        if (!isRecord(frame.node.markup))
          fail('VIEWER_TREE_VALUE_INVALID')
        break
      case 'imperative-dom':
        if (typeof frame.node.capability !== 'string' || typeof frame.node.mount !== 'function')
          fail('VIEWER_TREE_VALUE_INVALID')
        break
      case 'host-mount':
        if (!isRecord(frame.node.reference))
          fail('VIEWER_TREE_VALUE_INVALID')
        break
      default:
        fail('VIEWER_TREE_KIND_INVALID')
    }
  }
}

function boundedUtf8ByteLength(value: string, remaining: number): number {
  if (value.length > remaining)
    return remaining + 1
  let bytes = 0
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code <= 0x7F) {
      bytes += 1
    }
    else if (code <= 0x7FF) {
      bytes += 2
    }
    else if (code >= 0xD800 && code <= 0xDBFF && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1)
      if (next >= 0xDC00 && next <= 0xDFFF) {
        bytes += 4
        index++
      }
      else {
        bytes += 3
      }
    }
    else {
      bytes += 3
    }
    if (bytes > remaining)
      return remaining + 1
  }
  return bytes
}

function assertScalarRecord(
  value: unknown,
  allowBoolean: boolean,
): asserts value is Record<string, ViewerAttributeValue> {
  if (!isRecord(value) || Object.values(value).some((item) => {
    if (typeof item === 'number') {
      return !Number.isFinite(item)
    }
    return typeof item !== 'string' && (!allowBoolean || typeof item !== 'boolean')
  })) {
    fail('VIEWER_TREE_VALUE_INVALID')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function fail(code: string): never {
  throw new Error(code)
}
