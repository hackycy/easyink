import type { MaterialNode } from '@easyink/schema'
import type { SvgProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { escapeHtml } from '@easyink/shared'
import { sanitizeSvgContent } from './sanitize'

export function renderSvg(node: MaterialNode) {
  const props = getNodeProps<SvgProps>(node)
  const content = sanitizeSvgContent(props.content || '')

  return {
    html: `<svg viewBox="${escapeHtml(props.viewBox)}" preserveAspectRatio="${escapeHtml(props.preserveAspectRatio)}" style="width: 100%; height: 100%;" fill="${escapeHtml(props.fillColor)}">${content}</svg>`,
  }
}
