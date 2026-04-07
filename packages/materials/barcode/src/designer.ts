import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { BarcodeProps } from './schema'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderBarcodeContent(
  node: MaterialNode,
  context: { getBindingLabel: (binding: BindingRef) => string },
): { html: string } {
  const p = node.props as unknown as BarcodeProps

  let label: string
  if (node.binding) {
    const b = Array.isArray(node.binding) ? node.binding[0] : node.binding
    label = `{{${escapeHtml(context.getBindingLabel(b))}}}`
  }
  else {
    label = p.value ? escapeHtml(p.value) : p.format
  }

  // Stylized barcode lines placeholder
  const lines = Array.from(
    { length: 20 },
    (_, i) => `<rect x="${i * 5 + 4}" y="4" width="${i % 3 === 0 ? 3 : 1}" height="calc(100% - ${p.showText ? 20 : 8}px)" fill="${p.lineColor}"/>`,
  ).join('')

  const textPart = p.showText
    ? `<text x="50%" y="calc(100% - 4px)" text-anchor="middle" font-size="9" fill="${p.lineColor}">${label}</text>`
    : ''

  const html = `<svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="background:${p.backgroundColor}">${lines}${textPart}</svg>`
  return { html }
}

export function getBarcodeContextActions(_node: MaterialNode) {
  return [
    { id: 'edit-value', label: 'Edit Value' },
  ]
}
