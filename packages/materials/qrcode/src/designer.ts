import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { QrcodeProps } from './schema'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderQrcodeContent(
  node: MaterialNode,
  context: { getBindingLabel: (binding: BindingRef) => string },
): { html: string } {
  const p = node.props as unknown as QrcodeProps

  let label: string
  if (node.binding) {
    const b = Array.isArray(node.binding) ? node.binding[0] : node.binding
    label = `{{${escapeHtml(context.getBindingLabel(b))}}}`
  }
  else {
    label = p.value ? escapeHtml(p.value) : 'QR'
  }

  // Stylized QR grid placeholder
  const cells: string[] = []
  const gridSize = 7
  const cellSize = 100 / gridSize
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      // Finder patterns at corners + some interior dots
      const isFinder = (r < 3 && c < 3) || (r < 3 && c >= gridSize - 3) || (r >= gridSize - 3 && c < 3)
      const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4
      if (isFinder || isCenter || (r + c) % 3 === 0) {
        cells.push(`<rect x="${c * cellSize}%" y="${r * cellSize}%" width="${cellSize}%" height="${cellSize}%" fill="${p.foreground}"/>`)
      }
    }
  }

  const cellsHtml = cells.join('')
  const html = `<svg width="100%" height="100%" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="background:${p.background}">${cellsHtml}<text x="50" y="54" text-anchor="middle" font-size="8" fill="${p.foreground}" opacity="0.5">${label}</text></svg>`
  return { html }
}

export function getQrcodeContextActions(_node: MaterialNode) {
  return [
    { id: 'edit-value', label: 'Edit Value' },
  ]
}
