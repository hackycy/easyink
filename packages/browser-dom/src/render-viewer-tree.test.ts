import { viewerElement, viewerFragment, viewerImperativeDom, viewerSanitizedMarkup, viewerText } from '@easyink/core'
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import {
  createBrowserDomCapabilities,
  createBrowserDomFallbackCapabilities,
  createBrowserDomHostMount,
  DEFAULT_VIEWER_TREE_POLICY,
  renderViewerTree,
  SANITIZED_MARKUP_MAX_ATTRIBUTE_BYTES,
  SANITIZED_MARKUP_MAX_SOURCE_BYTES,
  ViewerTreePolicyError,
} from './index'

function createDocumentWithParsedRootComments(commentCount: number): Document {
  const root = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  const comments = Array.from({ length: commentCount }, () => ({ childNodes: [] }))
  const parsedWithSiblings = {
    childNodes: [...comments, root],
    documentElement: root,
    querySelector: () => null,
  } as unknown as Document
  const Parser = class {
    parseFromString(): Document {
      return parsedWithSiblings
    }
  }
  return {
    baseURI: 'about:blank',
    defaultView: { DOMParser: Parser },
  } as unknown as Document
}

describe('renderViewerTree', () => {
  it('renders text without parsing it as HTML', () => {
    const host = document.createElement('div')
    renderViewerTree(host, viewerText('<img src=x onerror=alert(1)>'))
    expect(host.children).toHaveLength(0)
    expect(host.textContent).toBe('<img src=x onerror=alert(1)>')
  })

  it.each([
    ['javascript URL', viewerElement('img', { attributes: { src: 'javascript:alert(1)' } })],
    ['event attribute', viewerElement('div', { attributes: { onclick: 'alert(1)' } })],
    ['dangerous CSS', viewerElement('div', { style: { color: 'url(https://bad.invalid)' } })],
    ['unknown CSS property', viewerElement('div', { style: { 'z-index': 1 } })],
    ['background shorthand', viewerElement('div', { style: { background: 'image-set("https://bad.invalid/a.png" 1x)' } })],
    ['mixed-case image-set', viewerElement('div', { style: { color: 'ImAgE-SeT("https://bad.invalid/a.png" 1x)' } })],
    ['comment-obfuscated CSS', viewerElement('div', { style: { color: 'image/**/-set("https://bad.invalid/a.png" 1x)' } })],
    ['escaped CSS', viewerElement('div', { style: { color: 'image\\2d set("https://bad.invalid/a.png" 1x)' } })],
    ['variable CSS', viewerElement('div', { style: { fill: 'var(--remote-paint)' } })],
  ])('rejects %s', (_label, tree) => {
    expect(() => renderViewerTree(document.createElement('div'), tree)).toThrow(ViewerTreePolicyError)
  })

  it('allows planned accessibility and positioned-layout properties', () => {
    const host = document.createElement('div')
    const tree = viewerElement('div', {
      attributes: { 'aria-describedby': 'description' },
      style: { position: 'absolute', left: 1, top: 2, right: 3, bottom: 4 },
    })

    expect(() => renderViewerTree(host, tree)).not.toThrow()
    expect(host.firstElementChild?.getAttribute('aria-describedby')).toBe('description')
    expect((host.firstElementChild as HTMLElement).style.position).toBe('absolute')
  })

  it('exposes policy sets through their actual minimal readonly surface', () => {
    expect(DEFAULT_VIEWER_TREE_POLICY.htmlTags.has('div')).toBe(true)
    expect([...DEFAULT_VIEWER_TREE_POLICY.htmlTags]).toContain('div')
    expect((DEFAULT_VIEWER_TREE_POLICY.htmlTags as unknown as { add?: unknown }).add).toBeUndefined()
  })

  it('replaces existing host content and never removes later replacements', () => {
    const host = document.createElement('div')
    host.append(document.createElement('aside'))

    const first = renderViewerTree(host, viewerText('first'))
    expect(host.querySelector('aside')).toBeNull()
    expect(host.textContent).toBe('first')

    const second = renderViewerTree(host, viewerText('second'))
    expect(host.textContent).toBe('second')

    const later = document.createElement('main')
    host.replaceChildren(later)
    second.dispose()
    first.dispose()
    expect(host.firstChild).toBe(later)
  })

  it('only renders sanitized markup minted by the current capability', () => {
    const first = createBrowserDomCapabilities({ document })
    const second = createBrowserDomCapabilities({ document })
    const token = first.sanitizeMarkup({ format: 'svg', source: '<svg viewBox="0 0 10 10"><path d="M0 0L10 10"/></svg>' })

    const host = document.createElement('div')
    renderViewerTree(host, viewerSanitizedMarkup(token), { capabilities: first })
    expect(host.querySelector('svg path')).not.toBeNull()
    expect(() => renderViewerTree(document.createElement('div'), viewerSanitizedMarkup(token), { capabilities: second }))
      .toThrowError('SANITIZED_MARKUP_TOKEN_INVALID')
    expect(() => renderViewerTree(document.createElement('div'), viewerSanitizedMarkup({} as never), { capabilities: first }))
      .toThrowError('SANITIZED_MARKUP_TOKEN_INVALID')
  })

  it('accepts conservative local SVG fragments without a usable base URL', () => {
    expect(DEFAULT_VIEWER_TREE_POLICY.allowUrl('#asset')).toBe(true)
    expect(DEFAULT_VIEWER_TREE_POLICY.allowUrl('#1invalid')).toBe(false)
    expect(DEFAULT_VIEWER_TREE_POLICY.allowUrl(' #asset ')).toBe(false)
    expect(DEFAULT_VIEWER_TREE_POLICY.allowUrl('javascript:alert(1)')).toBe(false)

    const detachedDocument = document.implementation.createHTMLDocument('')
    const capabilities = createBrowserDomCapabilities({ document: detachedDocument })
    const token = capabilities.sanitizeMarkup({
      format: 'svg',
      source: '<svg xmlns:xlink="http://www.w3.org/1999/xlink"><image id="asset" href="#asset" xlink:href="#asset"/></svg>',
    })
    const host = detachedDocument.createElement('div')
    renderViewerTree(host, viewerSanitizedMarkup(token), { capabilities })
    expect(host.querySelector('image')?.getAttribute('href')).toBe('#asset')
    expect(host.querySelector('image')?.getAttribute('xlink:href')).toBe('#asset')
  })

  it('enforces source, parsed-node, and aggregate attribute budgets before mounting', () => {
    expect(SANITIZED_MARKUP_MAX_SOURCE_BYTES).toBe(1024 * 1024)
    expect(SANITIZED_MARKUP_MAX_ATTRIBUTE_BYTES).toBe(256 * 1024)
    const capabilities = createBrowserDomCapabilities({ document })
    expect(() => capabilities.sanitizeMarkup({
      format: 'svg',
      source: '<!DOCTYPE svg [<!ENTITY x "expanded">]><svg><text>&x;</text></svg>',
    })).toThrowError('SANITIZED_MARKUP_SVG_INVALID')

    const boundarySource = `<svg>${'x'.repeat(SANITIZED_MARKUP_MAX_SOURCE_BYTES - 11)}</svg>`
    expect(() => capabilities.sanitizeMarkup({ format: 'svg', source: boundarySource })).not.toThrow()

    const oversizedSource = `<svg><!--${'x'.repeat(SANITIZED_MARKUP_MAX_SOURCE_BYTES)}--></svg>`
    expect(() => capabilities.sanitizeMarkup({ format: 'svg', source: oversizedSource }))
      .toThrowError('SANITIZED_MARKUP_SOURCE_TOO_LARGE')

    const boundaryAttributes = `<svg aria-label="${'x'.repeat(SANITIZED_MARKUP_MAX_ATTRIBUTE_BYTES - 'aria-label'.length)}"/>`
    expect(() => capabilities.sanitizeMarkup({ format: 'svg', source: boundaryAttributes })).not.toThrow()

    const oversizedAttributes = `<svg aria-label="${'x'.repeat(SANITIZED_MARKUP_MAX_ATTRIBUTE_BYTES)}"/>`
    expect(() => capabilities.sanitizeMarkup({ format: 'svg', source: oversizedAttributes }))
      .toThrowError('SANITIZED_MARKUP_ATTRIBUTES_TOO_LARGE')

    const excessiveComments = `<svg>${'<!---->'.repeat(50_000)}</svg>`
    expect(() => capabilities.sanitizeMarkup({ format: 'svg', source: excessiveComments }))
      .toThrowError('SANITIZED_MARKUP_ORIGINAL_NODE_LIMIT_EXCEEDED')

    const parsedDocumentBoundary = `${'<!---->'.repeat(49_998)}<svg/>`
    const boundaryDocumentCapabilities = createBrowserDomCapabilities({
      document: createDocumentWithParsedRootComments(49_998),
    })
    expect(() => boundaryDocumentCapabilities.sanitizeMarkup({ format: 'svg', source: parsedDocumentBoundary })).not.toThrow()

    const excessiveRootSiblings = `${'<!---->'.repeat(49_999)}<svg/>`
    const excessiveDocumentCapabilities = createBrowserDomCapabilities({
      document: createDocumentWithParsedRootComments(49_999),
    })
    expect(() => excessiveDocumentCapabilities.sanitizeMarkup({ format: 'svg', source: excessiveRootSiblings }))
      .toThrowError('SANITIZED_MARKUP_ORIGINAL_NODE_LIMIT_EXCEEDED')
  })

  it('counts original SVG documents consistently before stripping forbidden elements', () => {
    const plainSource = '<svg><!--c--><g>x</g></svg>'
    expect(() => createBrowserDomCapabilities({ document, maxNodes: 5 }).sanitizeMarkup({ format: 'svg', source: plainSource }))
      .not
      .toThrow()
    expect(() => createBrowserDomCapabilities({ document, maxNodes: 4 }).sanitizeMarkup({ format: 'svg', source: plainSource }))
      .toThrowError('SANITIZED_MARKUP_ORIGINAL_NODE_LIMIT_EXCEEDED')

    const styledSource = '<svg><style></style><!--c--><g>x</g></svg>'
    expect(() => createBrowserDomCapabilities({ document, maxNodes: 6 }).sanitizeMarkup({ format: 'svg', source: styledSource }))
      .not
      .toThrow()
    expect(() => createBrowserDomCapabilities({ document, maxNodes: 5 }).sanitizeMarkup({ format: 'svg', source: styledSource }))
      .toThrowError('SANITIZED_MARKUP_ORIGINAL_NODE_LIMIT_EXCEEDED')
  })

  it('rejects oversized forbidden content before removing it', () => {
    const source = `<svg>${'<style></style>'.repeat(50_001)}<circle/></svg>`
    expect(new TextEncoder().encode(source).byteLength).toBeLessThan(SANITIZED_MARKUP_MAX_SOURCE_BYTES)
    expect(() => createBrowserDomCapabilities({ document }).sanitizeMarkup({ format: 'svg', source }))
      .toThrowError('SANITIZED_MARKUP_ORIGINAL_NODE_LIMIT_EXCEEDED')
  })

  it('admits then strips a forbidden element nested inside an exact-budget SVG', () => {
    const source = `<svg>${'<g>'.repeat(16)}<style></style><circle/>${'</g>'.repeat(16)}</svg>`
    expect(() => createBrowserDomCapabilities({ document, maxNodes: 19 }).sanitizeMarkup({ format: 'svg', source }))
      .toThrowError('SANITIZED_MARKUP_ORIGINAL_NODE_LIMIT_EXCEEDED')

    const capabilities = createBrowserDomCapabilities({ document, maxNodes: 20 })
    const token = capabilities.sanitizeMarkup({ format: 'svg', source })
    const host = document.createElement('div')
    renderViewerTree(host, viewerSanitizedMarkup(token), { capabilities })
    expect(host.querySelector('circle')).not.toBeNull()
    expect(host.querySelector('style')).toBeNull()
  })

  it('rejects malicious SVG while allowing approved SVG', () => {
    const capabilities = createBrowserDomCapabilities({ document })
    expect(() => capabilities.sanitizeMarkup({ format: 'svg', source: '<svg><script>alert(1)</script></svg>' }))
      .toThrow(ViewerTreePolicyError)
    expect(() => capabilities.sanitizeMarkup({ format: 'svg', source: '<svg><path fill="url(javascript:alert(1))"/></svg>' }))
      .toThrow(ViewerTreePolicyError)

    const token = capabilities.sanitizeMarkup({
      format: 'svg',
      source: '<svg><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><path d="M0 0h1" fill="url(#paint)"/></svg>',
    })
    const host = document.createElement('div')
    renderViewerTree(host, viewerSanitizedMarkup(token), { capabilities })
    expect(host.querySelector('path')?.getAttribute('fill')).toBe('url(#paint)')
  })

  it('strips style and event attributes only inside sanitized SVG', () => {
    const capabilities = createBrowserDomCapabilities({ document })
    const token = capabilities.sanitizeMarkup({
      format: 'svg',
      source: '<svg style="display:block" onclick="alert(1)"><circle cx="2" cy="2" r="1" style="fill:red" onmouseover="alert(2)"/></svg>',
    })
    const host = document.createElement('div')

    renderViewerTree(host, viewerSanitizedMarkup(token), { capabilities })

    expect(host.querySelector('svg circle')).not.toBeNull()
    expect(host.querySelector('[style]')).toBeNull()
    expect(host.querySelector('[onclick], [onmouseover]')).toBeNull()
    expect(() => renderViewerTree(document.createElement('div'), viewerElement('svg', { attributes: { style: 'display:block' }, namespace: 'svg' })))
      .toThrowError('VIEWER_TREE_ATTRIBUTE_REJECTED')
  })

  it('denies imperative DOM by default and disposes it once when allowed', () => {
    const dispose = vi.fn()
    const tree = viewerImperativeDom('chart', ({ element }) => {
      element.append(document.createElement('canvas'))
      return dispose
    })

    expect(() => renderViewerTree(document.createElement('div'), tree)).toThrow(ViewerTreePolicyError)

    const capabilities = createBrowserDomCapabilities({ document, imperativeDom: ['chart'] })
    const host = document.createElement('div')
    const mount = renderViewerTree(host, tree, { capabilities })
    expect(host.querySelector('canvas')).not.toBeNull()
    mount.dispose()
    mount.dispose()
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(host.childNodes).toHaveLength(0)
  })

  it('mounts only opaque references minted by the current capability store', () => {
    const first = createBrowserDomCapabilities({ document })
    const second = createBrowserDomCapabilities({ document })
    const dispose = vi.fn()
    const tree = createBrowserDomHostMount(first, (host) => {
      const mount = renderViewerTree(host, viewerText('child'), { capabilities: second })
      return { nodes: mount.nodes, dispose: () => {
        dispose()
        mount.dispose()
      } }
    })
    const host = document.createElement('div')
    const mount = renderViewerTree(host, tree, { capabilities: first })

    expect(host.textContent).toBe('child')
    expect(() => renderViewerTree(document.createElement('div'), tree, { capabilities: second }))
      .toThrowError('VIEWER_HOST_MOUNT_INVALID')
    expect(() => renderViewerTree(document.createElement('div'), { kind: 'host-mount', reference: {} } as never, { capabilities: first }))
      .toThrowError('VIEWER_HOST_MOUNT_INVALID')

    mount.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('consumes host-mount references globally before invoking callbacks', () => {
    const capabilities = createBrowserDomCapabilities({ document })
    let recursiveError: unknown
    const tree = createBrowserDomHostMount(capabilities, () => {
      try {
        renderViewerTree(document.createElement('div'), tree, { capabilities })
      }
      catch (error) {
        recursiveError = error
      }
      throw new Error('mount failed')
    })

    expect(() => renderViewerTree(document.createElement('div'), tree, { capabilities })).toThrowError('mount failed')
    expect(recursiveError).toMatchObject({ message: 'VIEWER_HOST_MOUNT_REUSED' })
    expect(() => renderViewerTree(document.createElement('div'), tree, { capabilities }))
      .toThrowError('VIEWER_HOST_MOUNT_REUSED')
  })

  it('rejects consumed, cross-document, cross-store, and disposed-store host mounts', () => {
    const capabilities = createBrowserDomCapabilities({ document })
    const second = createBrowserDomCapabilities({ document })
    const otherDocument = document.implementation.createHTMLDocument('other')
    const tree = createBrowserDomHostMount(capabilities, host => renderViewerTree(host, viewerText('once')))
    const mounted = renderViewerTree(document.createElement('div'), tree, { capabilities })
    mounted.dispose()
    expect(() => renderViewerTree(document.createElement('div'), tree, { capabilities }))
      .toThrowError('VIEWER_HOST_MOUNT_REUSED')
    expect(() => renderViewerTree(document.createElement('div'), tree, { capabilities: second }))
      .toThrowError('VIEWER_HOST_MOUNT_INVALID')
    expect(() => renderViewerTree(otherDocument.createElement('div'), tree, { capabilities, document: otherDocument }))
      .toThrowError('VIEWER_CAPABILITIES_DOCUMENT_MISMATCH')

    const fresh = createBrowserDomHostMount(second, host => renderViewerTree(host, viewerText('unused')))
    second.dispose()
    expect(() => renderViewerTree(document.createElement('div'), fresh, { capabilities: second }))
      .toThrowError('VIEWER_CAPABILITIES_DISPOSED')
    expect(() => createBrowserDomHostMount(second, () => ({ nodes: [], dispose() {} })))
      .toThrowError('VIEWER_CAPABILITIES_DISPOSED')
  })

  it('snapshots capability policy and imperative options', () => {
    const htmlTags = new Set(DEFAULT_VIEWER_TREE_POLICY.htmlTags)
    const imperativeDom = new Set(['chart'])
    const policy = { ...DEFAULT_VIEWER_TREE_POLICY, htmlTags }
    const capabilities = createBrowserDomCapabilities({ document, policy, imperativeDom })
    htmlTags.delete('div')
    htmlTags.add('main')
    imperativeDom.clear()

    expect(() => renderViewerTree(document.createElement('div'), viewerElement('div'), { capabilities })).not.toThrow()
    expect(() => renderViewerTree(document.createElement('div'), viewerElement('main'), { capabilities }))
      .toThrowError('VIEWER_TREE_TAG_REJECTED')
    expect(() => renderViewerTree(document.createElement('div'), viewerImperativeDom('chart', () => () => {}), { capabilities }))
      .not
      .toThrow()
  })

  it('makes disposal idempotent, removes host nodes, and shares nested node budget', () => {
    const capabilities = createBrowserDomCapabilities({ document, imperativeDom: ['nested'] })
    const tree = viewerImperativeDom('nested', (host) => {
      host.render(viewerElement('div', {}, [viewerText('nested')]))
      return () => {}
    })
    const host = document.createElement('div')
    expect(() => renderViewerTree(host, tree, { capabilities, maxNodes: 2 })).toThrowError('VIEWER_TREE_NODE_LIMIT_EXCEEDED')

    const mount = renderViewerTree(host, viewerElement('div', {}, [viewerText('ok')]))
    expect(mount.nodes).toHaveLength(1)
    mount.dispose()
    mount.dispose()
    expect(host.childNodes).toHaveLength(0)
  })

  it('applies each nested maxNodes to sanitized expansion and rolls back on failure', () => {
    const capabilities = createBrowserDomCapabilities({ document, imperativeDom: ['nested', 'disposable'] })
    const token = capabilities.sanitizeMarkup({ format: 'svg', source: '<svg><g><path d="M0 0"/></g></svg>' })
    const nestedFailure = vi.fn()
    const nestedDispose = vi.fn()
    const disposable = viewerImperativeDom('disposable', ({ element }) => {
      element.append(document.createElement('canvas'))
      return nestedDispose
    })
    const tree = viewerImperativeDom('nested', (host) => {
      try {
        host.render(viewerFragment([disposable, viewerSanitizedMarkup(token)]), { maxNodes: 4 })
      }
      catch (error) {
        nestedFailure(error)
      }
      return () => {}
    })

    const host = document.createElement('div')
    renderViewerTree(host, tree, { capabilities, maxNodes: 10 })
    expect(nestedFailure).toHaveBeenCalledWith(expect.objectContaining({ message: 'VIEWER_TREE_NODE_LIMIT_EXCEEDED' }))
    expect(nestedDispose).toHaveBeenCalledOnce()
    expect(host.querySelector('canvas')).toBeNull()
    expect(host.querySelector('svg')).toBeNull()
  })

  it('applies nested quotas recursively and restores the shared budget after rollback', () => {
    const capabilities = createBrowserDomCapabilities({ document, imperativeDom: ['outer', 'inner'] })
    const nestedFailure = vi.fn()
    const inner = viewerImperativeDom('inner', (host) => {
      host.render(viewerElement('div', {}, [viewerText('too many')]))
      return () => {}
    })
    const outer = viewerImperativeDom('outer', (host) => {
      try {
        host.render(inner, { maxNodes: 2 })
      }
      catch (error) {
        nestedFailure(error)
      }
      host.render(viewerText('after rollback'), { maxNodes: 1 })
      return () => {}
    })

    const host = document.createElement('div')
    renderViewerTree(host, outer, { capabilities, maxNodes: 4 })
    expect(nestedFailure).toHaveBeenCalledWith(expect.objectContaining({ message: 'VIEWER_TREE_NODE_LIMIT_EXCEEDED' }))
    expect(host.textContent).toBe('after rollback')
  })

  it('shares aggregate node and text budgets across host-mount child renders', () => {
    const policy = { ...DEFAULT_VIEWER_TREE_POLICY, maxTextBytes: 5 }
    const owner = createBrowserDomCapabilities({ document, policy })
    const child = createBrowserDomCapabilities({ document })
    const first = createBrowserDomHostMount(owner, host => renderViewerTree(host, viewerText('abc'), { capabilities: child }))
    const second = createBrowserDomHostMount(owner, host => renderViewerTree(host, viewerText('def'), { capabilities: child }))

    expect(() => renderViewerTree(document.createElement('div'), viewerFragment([first, second]), { capabilities: owner, maxNodes: 5 }))
      .toThrowError('VIEWER_TREE_TEXT_EXCEEDED')

    const nodeOwner = createBrowserDomCapabilities({ document })
    const nodeChild = createBrowserDomCapabilities({ document })
    const nodeTrees = [
      createBrowserDomHostMount(nodeOwner, host => renderViewerTree(host, viewerText('a'), { capabilities: nodeChild })),
      createBrowserDomHostMount(nodeOwner, host => renderViewerTree(host, viewerText('b'), { capabilities: nodeChild })),
    ]
    expect(() => renderViewerTree(document.createElement('div'), viewerFragment(nodeTrees), { capabilities: nodeOwner, maxNodes: 4 }))
      .toThrowError('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
  })

  it('rolls back failed child budgets before rendering fallback and healthy siblings', () => {
    const owner = createBrowserDomCapabilities({ document })
    const child = createBrowserDomCapabilities({ document })
    const failed = createBrowserDomHostMount(owner, (host) => {
      try {
        return renderViewerTree(host, viewerElement('div', {}, [viewerText('too many')]), { capabilities: child, maxNodes: 1 })
      }
      catch {
        const fallbackTree = viewerText('fallback')
        const fallback = createBrowserDomFallbackCapabilities({ document }, fallbackTree)
        return renderViewerTree(host, fallbackTree, { capabilities: fallback })
      }
    })
    const healthy = createBrowserDomHostMount(owner, host => renderViewerTree(host, viewerText('healthy'), { capabilities: child }))
    const host = document.createElement('div')
    renderViewerTree(host, viewerFragment([failed, healthy]), { capabilities: owner, maxNodes: 5 })
    expect(host.textContent).toBe('fallbackhealthy')
  })

  it('charges nested sanitized expansion to the shared host-mount budget', () => {
    const owner = createBrowserDomCapabilities({ document })
    const child = createBrowserDomCapabilities({ document })
    const token = child.sanitizeMarkup({ format: 'svg', source: '<svg><g><path d="M0 0"/></g></svg>' })
    const nested = createBrowserDomHostMount(owner, host => renderViewerTree(host, viewerSanitizedMarkup(token), { capabilities: child }))
    expect(() => renderViewerTree(document.createElement('div'), nested, { capabilities: owner, maxNodes: 4 }))
      .toThrowError('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
  })

  it('bounds wide host-mount siblings by one aggregate node budget', () => {
    const owner = createBrowserDomCapabilities({ document })
    const child = createBrowserDomCapabilities({ document })
    const callbacks = vi.fn()
    const siblings = Array.from({ length: 40 }, (_, index) => createBrowserDomHostMount(owner, (host) => {
      callbacks(index)
      return renderViewerTree(host, viewerText(String(index)), { capabilities: child })
    }))
    const host = document.createElement('div')

    expect(() => renderViewerTree(host, viewerFragment(siblings), { capabilities: owner, maxNodes: 30 }))
      .toThrowError('VIEWER_TREE_NODE_LIMIT_EXCEEDED')
    expect(callbacks.mock.calls.length).toBeLessThan(siblings.length)
    expect(host.childNodes).toHaveLength(0)
  })

  it('rejects deep host-mount chains at logical depth before stack exhaustion', () => {
    const policy = { ...DEFAULT_VIEWER_TREE_POLICY, maxDepth: 12 }
    const capabilities = Array.from({ length: 40 }, () => createBrowserDomCapabilities({ document, policy }))
    let tree = viewerText('leaf') as ReturnType<typeof viewerText> | ReturnType<typeof createBrowserDomHostMount>
    for (let index = capabilities.length - 1; index >= 0; index--) {
      const childTree = tree
      const childCapabilities = capabilities[index + 1]
      tree = createBrowserDomHostMount(capabilities[index]!, host => childCapabilities
        ? renderViewerTree(host, childTree, { capabilities: childCapabilities })
        : renderViewerTree(host, childTree))
    }

    expect(() => renderViewerTree(document.createElement('div'), tree, { capabilities: capabilities[0] }))
      .toThrowError('VIEWER_TREE_DEPTH_EXCEEDED')
  })

  it('bounds validation visits across repeated oversized sibling attempts', () => {
    const owner = createBrowserDomCapabilities({ document })
    const child = createBrowserDomCapabilities({ document })
    let childReads = 0
    const oversizedChildren = new Proxy(
      Array.from({ length: 50_000 }, () => viewerText('x')),
      {
        get(target, key, receiver) {
          if (typeof key === 'string' && /^\d+$/.test(key))
            childReads++
          return Reflect.get(target, key, receiver)
        },
      },
    )
    const oversizedTree = { kind: 'fragment', children: oversizedChildren } as const
    const siblings = Array.from({ length: 1000 }, () => createBrowserDomHostMount(owner, (host) => {
      try {
        return renderViewerTree(host, oversizedTree, { capabilities: child })
      }
      catch {
        const fallbackTree = viewerText('!')
        const fallback = createBrowserDomFallbackCapabilities({ document }, fallbackTree)
        try {
          return renderViewerTree(host, fallbackTree, { capabilities: fallback })
        }
        catch {
          fallback.dispose()
          return Object.freeze({ nodes: Object.freeze([]), dispose() {} })
        }
      }
    }))

    renderViewerTree(document.createElement('div'), viewerFragment(siblings), { capabilities: owner, maxNodes: 5000 })
    expect(childReads).toBeLessThanOrEqual(20_000)
  })

  it('rejects repeated huge text before unbounded UTF-8 encoding', () => {
    const owner = createBrowserDomCapabilities({ document })
    const child = createBrowserDomCapabilities({ document })
    const hugeText = viewerText('x'.repeat(2 * 1024 * 1024))
    let encodedCodeUnits = 0
    const originalEncode = TextEncoder.prototype.encode
    const encode = vi.spyOn(TextEncoder.prototype, 'encode').mockImplementation(function (value = '') {
      encodedCodeUnits += value.length
      return originalEncode.call(this, value)
    })
    const siblings = Array.from({ length: 100 }, () => createBrowserDomHostMount(owner, (host) => {
      try {
        return renderViewerTree(host, hugeText, { capabilities: child })
      }
      catch {
        const fallbackTree = viewerText('!')
        const fallback = createBrowserDomFallbackCapabilities({ document }, fallbackTree)
        try {
          return renderViewerTree(host, fallbackTree, { capabilities: fallback })
        }
        catch {
          fallback.dispose()
          return Object.freeze({ nodes: Object.freeze([]), dispose() {} })
        }
      }
    }))

    renderViewerTree(document.createElement('div'), viewerFragment(siblings), { capabilities: owner, maxNodes: 500 })
    expect(encodedCodeUnits).toBeLessThan(1024)
    encode.mockRestore()
  })
})
