const sanitizedMarkupBrand: unique symbol = Symbol('SanitizedMarkup')

export interface SanitizedMarkup {
  readonly [sanitizedMarkupBrand]: true
}

export const VIEWER_TREE_ABSOLUTE_MAX_NODES = 50_000
export const VIEWER_TREE_ABSOLUTE_MAX_DEPTH = 128
export const VIEWER_TREE_ABSOLUTE_MAX_ATTRIBUTES = 128
export const VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES = 1024 * 1024

export type ViewerElementNamespace = 'html' | 'svg'

export interface ViewerTextTree {
  readonly kind: 'text'
  readonly value: string
}

export interface ViewerElementTree {
  readonly kind: 'element'
  readonly tag: string
  readonly namespace: ViewerElementNamespace
  readonly attributes: Readonly<Record<string, string>>
  readonly style: Readonly<Record<string, string>>
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

export type ViewerRenderTree
  = | ViewerTextTree
    | ViewerElementTree
    | ViewerFragmentTree
    | ViewerSanitizedMarkupTree
    | ViewerImperativeDomTree

export interface ViewerElementOptions {
  namespace?: ViewerElementNamespace
  attributes?: Readonly<Record<string, string>>
  style?: Readonly<Record<string, string>>
  children?: readonly ViewerRenderTree[]
}

export function viewerText(value: string): ViewerTextTree {
  return Object.freeze({ kind: 'text', value })
}

export function viewerElement(tag: string, options: ViewerElementOptions = {}): ViewerElementTree {
  return Object.freeze({
    kind: 'element',
    tag,
    namespace: options.namespace ?? 'html',
    attributes: Object.freeze({ ...options.attributes }),
    style: Object.freeze({ ...options.style }),
    children: Object.freeze([...(options.children ?? [])]),
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

interface WalkFrame {
  node: unknown
  depth: number
  exit: boolean
}

export function assertViewerRenderTree(
  tree: ViewerRenderTree,
  options: { maxNodes?: number } = {},
): asserts tree is ViewerRenderTree {
  const maxNodes = options.maxNodes ?? VIEWER_TREE_ABSOLUTE_MAX_NODES
  if (!Number.isFinite(maxNodes) || !Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
    fail('VIEWER_TREE_BUDGET_INVALID')

  const active = new WeakSet<object>()
  const stack: WalkFrame[] = [{ node: tree, depth: 0, exit: false }]
  const encoder = new TextEncoder()
  let nodes = 0
  let textBytes = 0

  while (stack.length > 0) {
    const frame = stack.pop()!
    if (!isRecord(frame.node))
      fail('VIEWER_TREE_KIND_INVALID')
    if (frame.exit) {
      active.delete(frame.node)
      continue
    }
    if (active.has(frame.node))
      fail('VIEWER_TREE_CYCLE')
    if (frame.depth > VIEWER_TREE_ABSOLUTE_MAX_DEPTH)
      fail('VIEWER_TREE_DEPTH_EXCEEDED')
    if (++nodes > maxNodes)
      fail('VIEWER_TREE_NODE_LIMIT_EXCEEDED')

    active.add(frame.node)
    stack.push({ ...frame, exit: true })
    switch (frame.node.kind) {
      case 'text':
        if (typeof frame.node.value !== 'string')
          fail('VIEWER_TREE_VALUE_INVALID')
        textBytes += encoder.encode(frame.node.value).byteLength
        if (textBytes > VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES)
          fail('VIEWER_TREE_TEXT_EXCEEDED')
        break
      case 'element': {
        if (typeof frame.node.tag !== 'string' || (frame.node.namespace !== 'html' && frame.node.namespace !== 'svg'))
          fail('VIEWER_TREE_VALUE_INVALID')
        assertStringRecord(frame.node.attributes)
        assertStringRecord(frame.node.style)
        if (Object.keys(frame.node.attributes).length > VIEWER_TREE_ABSOLUTE_MAX_ATTRIBUTES)
          fail('VIEWER_TREE_ATTRIBUTES_EXCEEDED')
        if (!Array.isArray(frame.node.children))
          fail('VIEWER_TREE_VALUE_INVALID')
        for (let index = frame.node.children.length - 1; index >= 0; index--)
          stack.push({ node: frame.node.children[index], depth: frame.depth + 1, exit: false })
        break
      }
      case 'fragment':
        if (!Array.isArray(frame.node.children))
          fail('VIEWER_TREE_VALUE_INVALID')
        for (let index = frame.node.children.length - 1; index >= 0; index--)
          stack.push({ node: frame.node.children[index], depth: frame.depth + 1, exit: false })
        break
      case 'sanitized-markup':
        if (!isRecord(frame.node.markup))
          fail('VIEWER_TREE_VALUE_INVALID')
        break
      case 'imperative-dom':
        if (typeof frame.node.capability !== 'string' || typeof frame.node.mount !== 'function')
          fail('VIEWER_TREE_VALUE_INVALID')
        break
      default:
        fail('VIEWER_TREE_KIND_INVALID')
    }
  }
}

function assertStringRecord(value: unknown): asserts value is Record<string, string> {
  if (!isRecord(value) || Object.values(value).some(item => typeof item !== 'string'))
    fail('VIEWER_TREE_VALUE_INVALID')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function fail(code: string): never {
  throw new Error(code)
}
