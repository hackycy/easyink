import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { SvgCustomProps } from './schema'
import { getBindingRefs, getNodeModel } from '@easyink/schema'
import { escapeAttr, escapeHtml } from '@easyink/shared'
import { buildSvgCustomMarkup } from './rendering'

function buildSvgLogoPlaceholder(label?: string): string {
  const hasLabel = label != null
  const rawTitle = hasLabel ? `{#${label}}` : 'SVG'
  const text = hasLabel ? `{#${escapeHtml(label ?? '')}}` : ''
  const title = escapeAttr(rawTitle)
  const logoY = hasLabel ? 22 : 31
  const labelMarkup = hasLabel
    ? `<svg x="12" y="66" width="76" height="14" viewBox="0 0 76 14" overflow="hidden"><text x="38" y="9.5" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" fill="#667085">${text}</text></svg>`
    : ''

  return [
    `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${title}" style="width:100%;height:100%;display:block" xmlns="http://www.w3.org/2000/svg">`,
    `<title>${hasLabel ? text : 'SVG'}</title>`,
    `<g fill="none" stroke="#98a2b3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">`,
    `<rect x="34" y="${logoY}" width="32" height="28" rx="4"/>`,
    `<path d="M40 ${logoY + 8}L36 ${logoY + 14}L40 ${logoY + 20}"/>`,
    `<path d="M60 ${logoY + 8}L64 ${logoY + 14}L60 ${logoY + 20}"/>`,
    `</g>`,
    `<text x="50" y="${logoY + 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#98a2b3">SVG</text>`,
    labelMarkup,
    `</svg>`,
  ].join('')
}

function buildDesignerHtml(node: MaterialNode, context: MaterialExtensionContext): string {
  const binding = getBindingRefs(node.bindings.value)[0]
  if (binding) {
    const label = context.getBindingLabel(binding)
    return buildSvgLogoPlaceholder(label)
  }

  const props = getNodeModel<SvgCustomProps>(node)
  if (!props.content.trim())
    return buildSvgLogoPlaceholder()

  return buildSvgCustomMarkup(props)
}

export function createSvgCustomExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildDesignerHtml(node, context)
      }

      render()
      return nodeSignal.subscribe(render)
    },
  }
}
