import type {
  SanitizedMarkup,
  ViewerImperativeHost,
  ViewerRenderCapabilities,
  ViewerRenderTree,
} from '@easyink/core'
import type { ViewerTreePolicy } from './policy'
import {
  assertViewerRenderTree,
  VIEWER_TREE_ABSOLUTE_MAX_ATTRIBUTES,
  VIEWER_TREE_ABSOLUTE_MAX_DEPTH,
  VIEWER_TREE_ABSOLUTE_MAX_NODES,
  VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES,
} from '@easyink/core'
import {
  assertKebabCaseProperty,
  assertSafeCssValue,
  assertSafeSvgPresentationValue,
  DEFAULT_VIEWER_TREE_POLICY,
  readonlySet,
  ViewerTreePolicyError,
} from './policy'

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg'
const SVG_PRESENTATION_ATTRIBUTES = new Set([
  'fill',
  'stroke',
  'clip-path',
  'marker-start',
  'marker-mid',
  'marker-end',
  'filter',
  'mask',
  'color',
])

interface SanitizedSvgElement {
  readonly type: 'element'
  readonly tag: string
  readonly attributes: readonly (readonly [string, string])[]
  readonly children: readonly SanitizedSvgNode[]
}

interface SanitizedSvgText {
  readonly type: 'text'
  readonly value: string
}

type SanitizedSvgNode = SanitizedSvgElement | SanitizedSvgText
type SanitizedSvgTree = SanitizedSvgElement

interface CapabilityStore {
  readonly document: Document
  readonly policy: ViewerTreePolicy
  readonly tokens: WeakMap<SanitizedMarkup, SanitizedSvgTree>
  readonly imperativeDom: ReadonlySet<string>
}

const capabilityStores = new WeakMap<BrowserDomCapabilities, CapabilityStore>()

export interface BrowserDomCapabilities extends ViewerRenderCapabilities {
  readonly imperativeDom: ReadonlySet<string>
}

export interface BrowserDomCapabilitiesOptions {
  document: Document
  policy?: ViewerTreePolicy
  imperativeDom?: Iterable<string>
}

export interface RenderViewerTreeOptions {
  document?: Document
  policy?: ViewerTreePolicy
  capabilities?: BrowserDomCapabilities
  maxNodes?: number
}

export interface ViewerTreeMount {
  readonly nodes: readonly Node[]
  readonly dispose: () => void
}

interface RenderBudget {
  remaining: number
  textBytes: number
}

interface RenderState {
  document: Document
  policy: ViewerTreePolicy
  store: CapabilityStore
  budget: RenderBudget
}

interface RenderScope {
  parent: Node
  nodes: Node[]
  disposers: Array<() => void>
  disposed: boolean
}

export function createBrowserDomCapabilities(options: BrowserDomCapabilitiesOptions): BrowserDomCapabilities {
  const policy = options.policy ?? DEFAULT_VIEWER_TREE_POLICY
  assertPolicyLimits(policy)
  const tokens = new WeakMap<SanitizedMarkup, SanitizedSvgTree>()
  const imperativeDom = readonlySet(options.imperativeDom ?? [])
  const capabilities: BrowserDomCapabilities = Object.freeze({
    imperativeDom,
    sanitizeMarkup(input: { format: 'svg', source: string }): SanitizedMarkup {
      if (input.format !== 'svg')
        throw new ViewerTreePolicyError('SANITIZED_MARKUP_FORMAT_INVALID')
      const tree = sanitizeSvg(options.document, input.source, policy)
      const token = Object.freeze({}) as SanitizedMarkup
      tokens.set(token, tree)
      return token
    },
  })
  capabilityStores.set(capabilities, { document: options.document, policy, tokens, imperativeDom })
  return capabilities
}

export function renderViewerTree(
  host: HTMLElement,
  tree: ViewerRenderTree,
  options: RenderViewerTreeOptions = {},
): ViewerTreeMount {
  const document = options.document ?? host.ownerDocument
  const capabilities = options.capabilities ?? createBrowserDomCapabilities({
    document,
    policy: options.policy,
  })
  const store = capabilityStores.get(capabilities)
  if (!store)
    throw new ViewerTreePolicyError('VIEWER_CAPABILITIES_INVALID')
  if (store.document !== document)
    throw new ViewerTreePolicyError('VIEWER_CAPABILITIES_DOCUMENT_MISMATCH')
  const policy = options.policy ?? store.policy
  assertPolicyLimits(policy)
  const maxNodes = options.maxNodes ?? VIEWER_TREE_ABSOLUTE_MAX_NODES
  assertViewerRenderTree(tree, { maxNodes })

  const state: RenderState = {
    document,
    policy,
    store,
    budget: { remaining: maxNodes, textBytes: 0 },
  }
  const scope = createScope(host)
  try {
    renderInto(host, tree, state, scope, 0)
  }
  catch (error) {
    disposeScope(scope)
    throw error
  }
  const nodes = Object.freeze([...scope.nodes])
  return Object.freeze({ nodes, dispose: () => disposeScope(scope) })
}

function renderInto(
  parent: Node,
  tree: ViewerRenderTree,
  state: RenderState,
  scope: RenderScope,
  depth: number,
): void {
  consumeNode(state, depth)
  switch (tree.kind) {
    case 'text': {
      consumeText(state, tree.value)
      append(parent, state.document.createTextNode(tree.value), scope)
      break
    }
    case 'fragment':
      for (const child of tree.children)
        renderInto(parent, child, state, scope, depth + 1)
      break
    case 'element': {
      const element = createPolicyElement(state, tree.namespace, tree.tag)
      applyPolicyAttributes(element, tree.attributes, state)
      applyPolicyStyle(element, tree.style, state.policy)
      append(parent, element, scope)
      for (const child of tree.children)
        renderInto(element, child, state, scope, depth + 1)
      break
    }
    case 'sanitized-markup': {
      const sanitized = state.store.tokens.get(tree.markup)
      if (!sanitized)
        throw new ViewerTreePolicyError('SANITIZED_MARKUP_TOKEN_INVALID')
      const element = renderSanitizedNode(sanitized, state, depth)
      append(parent, element, scope)
      break
    }
    case 'imperative-dom': {
      if (!state.store.imperativeDom.has(tree.capability))
        throw new ViewerTreePolicyError('VIEWER_IMPERATIVE_DOM_NOT_ALLOWED')
      const imperativeElement = state.document.createElement('div')
      append(parent, imperativeElement, scope)
      const host: ViewerImperativeHost = Object.freeze({
        element: imperativeElement,
        render: (nestedTree: ViewerRenderTree, nestedOptions: { maxNodes?: number } = {}) => {
          const requested = nestedOptions.maxNodes
          if (requested !== undefined)
            assertNodeBudget(requested)
          if (state.budget.remaining < 1)
            throw new Error('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
          const effectiveMax = Math.min(requested ?? state.budget.remaining, state.budget.remaining)
          assertViewerRenderTree(nestedTree, { maxNodes: effectiveMax })
          const nestedScope = createScope(imperativeElement)
          try {
            renderInto(imperativeElement, nestedTree, state, nestedScope, depth + 1)
          }
          catch (error) {
            disposeScope(nestedScope)
            throw error
          }
          const dispose = () => disposeScope(nestedScope)
          scope.disposers.push(dispose)
          return Object.freeze({ dispose })
        },
      })
      scope.disposers.push(tree.mount(host))
      break
    }
  }
}

function createPolicyElement(
  state: RenderState,
  namespace: 'html' | 'svg',
  tag: string,
): HTMLElement | SVGElement {
  if (namespace === 'html') {
    if (!state.policy.htmlTags.has(tag))
      throw new ViewerTreePolicyError('VIEWER_TREE_TAG_REJECTED')
    return state.document.createElement(tag)
  }
  if (tag === 'foreignObject' || !state.policy.svgTags.has(tag))
    throw new ViewerTreePolicyError('VIEWER_TREE_TAG_REJECTED')
  return state.document.createElementNS(SVG_NAMESPACE, tag)
}

function applyPolicyAttributes(
  element: Element,
  attributes: Readonly<Record<string, string>>,
  state: RenderState,
): void {
  const entries = Object.entries(attributes)
  if (entries.length > state.policy.maxAttributesPerElement)
    throw new ViewerTreePolicyError('VIEWER_TREE_ATTRIBUTES_EXCEEDED')
  for (const [name, value] of entries) {
    const lowerName = name.toLowerCase()
    if (lowerName.startsWith('on') || lowerName === 'style' || !state.policy.globalAttributes.has(name))
      throw new ViewerTreePolicyError('VIEWER_TREE_ATTRIBUTE_REJECTED')
    if (state.policy.urlAttributes.has(name) && !state.policy.allowUrl(value, state.document.baseURI || undefined))
      throw new ViewerTreePolicyError('VIEWER_TREE_URL_REJECTED')
    if (isSvgPresentationAttribute(name))
      assertSafeSvgPresentationValue(value)
    element.setAttribute(name, value)
  }
}

function applyPolicyStyle(
  element: HTMLElement | SVGElement,
  style: Readonly<Record<string, string>>,
  policy: ViewerTreePolicy,
): void {
  for (const [property, value] of Object.entries(style)) {
    assertKebabCaseProperty(property)
    if (!policy.cssProperties.has(property))
      throw new ViewerTreePolicyError('VIEWER_TREE_CSS_PROPERTY_REJECTED')
    assertSafeCssValue(value)
    element.style.setProperty(property, value)
  }
}

function sanitizeSvg(document: Document, source: string, policy: ViewerTreePolicy): SanitizedSvgTree {
  const Parser = document.defaultView?.DOMParser ?? DOMParser
  const parsed = new Parser().parseFromString(source, 'image/svg+xml')
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg')
    throw new ViewerTreePolicyError('SANITIZED_MARKUP_SVG_INVALID')
  const counters = { nodes: 0, textBytes: 0 }
  return sanitizeSvgElement(parsed.documentElement, policy, document.baseURI || undefined, 0, counters)
}

function sanitizeSvgElement(
  element: Element,
  policy: ViewerTreePolicy,
  baseUrl: string | undefined,
  depth: number,
  counters: { nodes: number, textBytes: number },
): SanitizedSvgElement {
  if (depth > policy.maxDepth)
    throw new ViewerTreePolicyError('VIEWER_TREE_DEPTH_EXCEEDED')
  if (++counters.nodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
    throw new ViewerTreePolicyError('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
  const tag = element.localName
  if (tag === 'foreignObject' || !policy.svgTags.has(tag))
    throw new ViewerTreePolicyError('VIEWER_TREE_TAG_REJECTED')
  if (element.attributes.length > policy.maxAttributesPerElement)
    throw new ViewerTreePolicyError('VIEWER_TREE_ATTRIBUTES_EXCEEDED')
  const attributes: Array<readonly [string, string]> = []
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name
    const lowerName = name.toLowerCase()
    if (lowerName.startsWith('on') || lowerName === 'style' || !policy.globalAttributes.has(name))
      throw new ViewerTreePolicyError('VIEWER_TREE_ATTRIBUTE_REJECTED')
    if (policy.urlAttributes.has(name) && !policy.allowUrl(attribute.value, baseUrl))
      throw new ViewerTreePolicyError('VIEWER_TREE_URL_REJECTED')
    if (isSvgPresentationAttribute(name))
      assertSafeSvgPresentationValue(attribute.value)
    attributes.push(Object.freeze([name, attribute.value] as const))
  }
  const children: SanitizedSvgNode[] = []
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 1) {
      children.push(sanitizeSvgElement(child as Element, policy, baseUrl, depth + 1, counters))
    }
    else if (child.nodeType === 3) {
      const value = child.textContent ?? ''
      counters.nodes++
      counters.textBytes += new TextEncoder().encode(value).byteLength
      if (counters.nodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
        throw new ViewerTreePolicyError('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
      if (counters.textBytes > policy.maxTextBytes)
        throw new ViewerTreePolicyError('VIEWER_TREE_TEXT_EXCEEDED')
      children.push(Object.freeze({ type: 'text', value }))
    }
    else if (child.nodeType !== 8) {
      throw new ViewerTreePolicyError('SANITIZED_MARKUP_SVG_INVALID')
    }
  }
  return Object.freeze({
    type: 'element',
    tag,
    attributes: Object.freeze(attributes),
    children: Object.freeze(children),
  })
}

function renderSanitizedNode(node: SanitizedSvgNode, state: RenderState, depth: number): Node {
  consumeNode(state, depth)
  if (node.type === 'text') {
    consumeText(state, node.value)
    return state.document.createTextNode(node.value)
  }
  const element = state.document.createElementNS(SVG_NAMESPACE, node.tag)
  for (const [name, value] of node.attributes)
    element.setAttribute(name, value)
  for (const child of node.children)
    element.appendChild(renderSanitizedNode(child, state, depth + 1))
  return element
}

function append(parent: Node, node: Node, scope: RenderScope): void {
  parent.appendChild(node)
  if (parent === scope.parent)
    scope.nodes.push(node)
}

function createScope(parent: Node): RenderScope {
  return { parent, nodes: [], disposers: [], disposed: false }
}

function disposeScope(scope: RenderScope): void {
  if (scope.disposed)
    return
  scope.disposed = true
  let firstError: unknown
  for (let index = scope.disposers.length - 1; index >= 0; index--) {
    try {
      scope.disposers[index]()
    }
    catch (error) {
      firstError ??= error
    }
  }
  for (let index = scope.nodes.length - 1; index >= 0; index--)
    scope.nodes[index].parentNode?.removeChild(scope.nodes[index])
  if (firstError)
    throw firstError
}

function isSvgPresentationAttribute(name: string): boolean {
  return SVG_PRESENTATION_ATTRIBUTES.has(name)
}

function consumeNode(state: RenderState, depth: number): void {
  if (depth > state.policy.maxDepth)
    throw new ViewerTreePolicyError('VIEWER_TREE_DEPTH_EXCEEDED')
  if (state.budget.remaining-- < 1)
    throw new Error('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
}

function consumeText(state: RenderState, value: string): void {
  state.budget.textBytes += new TextEncoder().encode(value).byteLength
  if (state.budget.textBytes > state.policy.maxTextBytes)
    throw new ViewerTreePolicyError('VIEWER_TREE_TEXT_EXCEEDED')
}

function assertNodeBudget(value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1 || value > VIEWER_TREE_ABSOLUTE_MAX_NODES)
    throw new Error('VIEWER_TREE_BUDGET_INVALID')
}

function assertPolicyLimits(policy: ViewerTreePolicy): void {
  const limits = [
    [policy.maxDepth, VIEWER_TREE_ABSOLUTE_MAX_DEPTH],
    [policy.maxAttributesPerElement, VIEWER_TREE_ABSOLUTE_MAX_ATTRIBUTES],
    [policy.maxTextBytes, VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES],
  ]
  if (limits.some(([value, ceiling]) => !Number.isFinite(value) || !Number.isInteger(value) || value < 1 || value > ceiling))
    throw new ViewerTreePolicyError('VIEWER_TREE_POLICY_LIMIT_INVALID')
}
