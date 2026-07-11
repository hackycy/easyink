import { viewerElement, viewerImperativeDom, viewerSanitizedMarkup, viewerText } from '@easyink/core'
// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import {
  createBrowserDomCapabilities,
  renderViewerTree,
  ViewerTreePolicyError,
} from './index'

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
})
