import type {
  SanitizedMarkup,
  ViewerAttributeValue,
  ViewerHostMountReference,
  ViewerHostMountTree,
  ViewerImperativeHost,
  ViewerRenderCapabilities,
  ViewerRenderTree,
  ViewerStyleValue,
} from '@easyink/core'
import type { ViewerTreePolicy, ViewerTreeReadonlySet } from './policy'
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
export const SANITIZED_MARKUP_MAX_SOURCE_BYTES = VIEWER_TREE_ABSOLUTE_MAX_TEXT_BYTES
export const SANITIZED_MARKUP_MAX_ATTRIBUTE_BYTES = 256 * 1024
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
  'pointer-events',
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
  readonly imperativeDom: ViewerTreeReadonlySet<string>
  readonly hostMounts: WeakMap<ViewerHostMountReference, BrowserDomHostMount>
}

const capabilityStores = new WeakMap<BrowserDomCapabilities, CapabilityStore>()

export interface BrowserDomCapabilities extends ViewerRenderCapabilities {
  readonly imperativeDom: ViewerTreeReadonlySet<string>
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

interface RenderQuota {
  remaining: number
  parent?: RenderQuota
}

interface RenderState {
  document: Document
  policy: ViewerTreePolicy
  store: CapabilityStore
  textBytes: number
  mountedHostRefs: WeakSet<ViewerHostMountReference>
}

export type BrowserDomHostMount = (host: HTMLElement) => ViewerTreeMount

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
  capabilityStores.set(capabilities, { document: options.document, policy, tokens, imperativeDom, hostMounts: new WeakMap() })
  return capabilities
}

export function createBrowserDomHostMount(
  capabilities: BrowserDomCapabilities,
  mount: BrowserDomHostMount,
): ViewerHostMountTree {
  const store = capabilityStores.get(capabilities)
  if (!store)
    throw new ViewerTreePolicyError('VIEWER_CAPABILITIES_INVALID')
  const reference = Object.freeze({}) as ViewerHostMountReference
  store.hostMounts.set(reference, mount)
  return Object.freeze({ kind: 'host-mount', reference })
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
    textBytes: 0,
    mountedHostRefs: new WeakSet(),
  }
  const rootQuota: RenderQuota = { remaining: maxNodes }
  const staging = document.createDocumentFragment()
  const scope = createScope(staging)
  try {
    renderInto(staging, tree, state, scope, rootQuota, 0)
    host.replaceChildren(...scope.nodes)
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
  quota: RenderQuota,
  depth: number,
): void {
  consumeNode(state, quota, depth)
  switch (tree.kind) {
    case 'text': {
      consumeText(state, tree.value)
      append(parent, state.document.createTextNode(tree.value), scope)
      break
    }
    case 'fragment':
      for (const child of tree.children)
        renderInto(parent, child, state, scope, quota, depth + 1)
      break
    case 'element': {
      const element = createPolicyElement(state, tree.namespace, tree.tag)
      applyPolicyAttributes(element, tree.attributes, state)
      applyPolicyStyle(element, tree.style, state.policy)
      append(parent, element, scope)
      for (const child of tree.children)
        renderInto(element, child, state, scope, quota, depth + 1)
      break
    }
    case 'sanitized-markup': {
      const sanitized = state.store.tokens.get(tree.markup)
      if (!sanitized)
        throw new ViewerTreePolicyError('SANITIZED_MARKUP_TOKEN_INVALID')
      const element = renderSanitizedNode(sanitized, state, quota, depth)
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
          if (quota.remaining < 1)
            throw new Error('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
          const effectiveMax = Math.min(requested ?? quota.remaining, quota.remaining)
          assertViewerRenderTree(nestedTree, { maxNodes: effectiveMax })
          const nestedScope = createScope(imperativeElement)
          const nestedQuota: RenderQuota = { remaining: effectiveMax, parent: quota }
          const quotaSnapshot = snapshotQuotaChain(quota)
          const textBytesBefore = state.textBytes
          try {
            renderInto(imperativeElement, nestedTree, state, nestedScope, nestedQuota, depth + 1)
          }
          catch (error) {
            try {
              disposeScope(nestedScope)
            }
            catch {
              // Preserve the render failure after completing best-effort cleanup.
            }
            restoreQuotaChain(quotaSnapshot)
            state.textBytes = textBytesBefore
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
    case 'host-mount': {
      const mount = state.store.hostMounts.get(tree.reference)
      if (!mount)
        throw new ViewerTreePolicyError('VIEWER_HOST_MOUNT_INVALID')
      if (state.mountedHostRefs.has(tree.reference))
        throw new ViewerTreePolicyError('VIEWER_HOST_MOUNT_REUSED')
      state.mountedHostRefs.add(tree.reference)
      const hostElement = state.document.createElement('div')
      append(parent, hostElement, scope)
      scope.disposers.push(mount(hostElement).dispose)
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
  attributes: Readonly<Record<string, ViewerAttributeValue>>,
  state: RenderState,
): void {
  const entries = Object.entries(attributes)
  if (entries.length > state.policy.maxAttributesPerElement)
    throw new ViewerTreePolicyError('VIEWER_TREE_ATTRIBUTES_EXCEEDED')
  for (const [name, value] of entries) {
    const serialized = String(value)
    const lowerName = name.toLowerCase()
    if (lowerName.startsWith('on') || lowerName === 'style' || !state.policy.globalAttributes.has(name))
      throw new ViewerTreePolicyError('VIEWER_TREE_ATTRIBUTE_REJECTED')
    if (state.policy.urlAttributes.has(name) && !state.policy.allowUrl(serialized, state.document.baseURI || undefined))
      throw new ViewerTreePolicyError('VIEWER_TREE_URL_REJECTED')
    if (isSvgPresentationAttribute(name))
      assertSafeSvgPresentationValue(serialized)
    element.setAttribute(name, serialized)
  }
}

function applyPolicyStyle(
  element: HTMLElement | SVGElement,
  style: Readonly<Record<string, ViewerStyleValue>>,
  policy: ViewerTreePolicy,
): void {
  for (const [property, value] of Object.entries(style)) {
    const serialized = String(value)
    assertKebabCaseProperty(property)
    if (!policy.cssProperties.has(property))
      throw new ViewerTreePolicyError('VIEWER_TREE_CSS_PROPERTY_REJECTED')
    assertSafeCssValue(property, serialized)
    element.style.setProperty(property, serialized)
  }
}

interface SanitizeCounters {
  nodes: number
  textBytes: number
  attributeBytes: number
}

function sanitizeSvg(document: Document, source: string, policy: ViewerTreePolicy): SanitizedSvgTree {
  const encoder = new TextEncoder()
  if (source.length > SANITIZED_MARKUP_MAX_SOURCE_BYTES
    || encoder.encode(source).byteLength > SANITIZED_MARKUP_MAX_SOURCE_BYTES) {
    throw new ViewerTreePolicyError('SANITIZED_MARKUP_SOURCE_TOO_LARGE')
  }
  if (/<!doctype|<!entity/i.test(source))
    throw new ViewerTreePolicyError('SANITIZED_MARKUP_SVG_INVALID')
  const Parser = document.defaultView?.DOMParser ?? DOMParser
  const preparedSource = /<style[\s>]/i.test(source)
    ? removeForbiddenSvgElements(document, source, Parser)
    : source
  const parsed = new Parser().parseFromString(preparedSource, 'image/svg+xml')
  assertParsedDocumentNodeBudget(parsed)
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg')
    throw new ViewerTreePolicyError('SANITIZED_MARKUP_SVG_INVALID')
  const counters: SanitizeCounters = { nodes: 0, textBytes: 0, attributeBytes: 0 }
  return sanitizeSvgElement(parsed.documentElement, policy, document.baseURI || undefined, 0, counters)
}

function removeForbiddenSvgElements(
  document: Document,
  source: string,
  Parser: typeof DOMParser,
): string {
  const parsed = new Parser().parseFromString(source, 'text/html')
  const roots = Array.from(parsed.body.children)
  if (roots.length !== 1 || roots[0]!.localName !== 'svg')
    throw new ViewerTreePolicyError('SANITIZED_MARKUP_SVG_INVALID')
  const root = roots[0]!
  root.querySelectorAll('style').forEach(element => element.remove())
  const Serializer = document.defaultView?.XMLSerializer ?? XMLSerializer
  return new Serializer().serializeToString(root)
}

function assertParsedDocumentNodeBudget(document: Document): void {
  const stack = Array.from(document.childNodes)
  let nodes = 0
  while (stack.length > 0) {
    const node = stack.pop()!
    if (++nodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
      throw new ViewerTreePolicyError('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
    for (let index = node.childNodes.length - 1; index >= 0; index--)
      stack.push(node.childNodes[index])
  }
}

function sanitizeSvgElement(
  element: Element,
  policy: ViewerTreePolicy,
  baseUrl: string | undefined,
  depth: number,
  counters: SanitizeCounters,
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
  const encoder = new TextEncoder()
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name
    const lowerName = name.toLowerCase()
    // Sanitized SVG is an explicit capability boundary. Drop active styling
    // attributes before applying the same geometry/URL allowlists as trees.
    if (lowerName.startsWith('on') || lowerName === 'style')
      continue
    if (!policy.globalAttributes.has(name))
      throw new ViewerTreePolicyError('VIEWER_TREE_ATTRIBUTE_REJECTED')
    if (policy.urlAttributes.has(name) && !policy.allowUrl(attribute.value, baseUrl))
      throw new ViewerTreePolicyError('VIEWER_TREE_URL_REJECTED')
    if (isSvgPresentationAttribute(name))
      assertSafeSvgPresentationValue(attribute.value)
    counters.attributeBytes += encoder.encode(name).byteLength + encoder.encode(attribute.value).byteLength
    if (counters.attributeBytes > SANITIZED_MARKUP_MAX_ATTRIBUTE_BYTES)
      throw new ViewerTreePolicyError('SANITIZED_MARKUP_ATTRIBUTES_TOO_LARGE')
    attributes.push(Object.freeze([name, attribute.value] as const))
  }
  const children: SanitizedSvgNode[] = []
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 1) {
      children.push(sanitizeSvgElement(child as Element, policy, baseUrl, depth + 1, counters))
    }
    else {
      counters.nodes++
      if (counters.nodes > VIEWER_TREE_ABSOLUTE_MAX_NODES)
        throw new ViewerTreePolicyError('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
      if (child.nodeType === 8)
        continue
      if (child.nodeType !== 3)
        throw new ViewerTreePolicyError('SANITIZED_MARKUP_SVG_INVALID')
      const value = child.textContent ?? ''
      counters.textBytes += encoder.encode(value).byteLength
      if (counters.textBytes > policy.maxTextBytes)
        throw new ViewerTreePolicyError('VIEWER_TREE_TEXT_EXCEEDED')
      children.push(Object.freeze({ type: 'text', value }))
    }
  }
  return Object.freeze({
    type: 'element',
    tag,
    attributes: Object.freeze(attributes),
    children: Object.freeze(children),
  })
}

function renderSanitizedNode(node: SanitizedSvgNode, state: RenderState, quota: RenderQuota, depth: number): Node {
  consumeNode(state, quota, depth)
  if (node.type === 'text') {
    consumeText(state, node.value)
    return state.document.createTextNode(node.value)
  }
  const element = state.document.createElementNS(SVG_NAMESPACE, node.tag)
  for (const [name, value] of node.attributes)
    element.setAttribute(name, value)
  const { children } = node
  for (const child of children)
    element.appendChild(renderSanitizedNode(child, state, quota, depth + 1))
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

function consumeNode(state: RenderState, quota: RenderQuota, depth: number): void {
  if (depth > state.policy.maxDepth)
    throw new ViewerTreePolicyError('VIEWER_TREE_DEPTH_EXCEEDED')
  for (let current: RenderQuota | undefined = quota; current; current = current.parent) {
    if (current.remaining < 1)
      throw new Error('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
  }
  for (let current: RenderQuota | undefined = quota; current; current = current.parent)
    current.remaining--
}

function consumeText(state: RenderState, value: string): void {
  state.textBytes += new TextEncoder().encode(value).byteLength
  if (state.textBytes > state.policy.maxTextBytes)
    throw new ViewerTreePolicyError('VIEWER_TREE_TEXT_EXCEEDED')
}

function snapshotQuotaChain(quota: RenderQuota): Array<readonly [RenderQuota, number]> {
  const snapshot: Array<readonly [RenderQuota, number]> = []
  for (let current: RenderQuota | undefined = quota; current; current = current.parent)
    snapshot.push([current, current.remaining])
  return snapshot
}

function restoreQuotaChain(snapshot: Array<readonly [RenderQuota, number]>): void {
  for (const [quota, remaining] of snapshot)
    quota.remaining = remaining
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
