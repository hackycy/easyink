import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { ChartProps } from './schema'

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const CHART_ICONS: Record<string, string> = {
  bar: '<rect x="10" y="50" width="15" height="40" fill="#1890ff"/><rect x="30" y="30" width="15" height="60" fill="#1890ff"/><rect x="50" y="40" width="15" height="50" fill="#1890ff"/><rect x="70" y="20" width="15" height="70" fill="#1890ff"/>',
  line: '<polyline points="10,70 30,40 55,55 80,20" fill="none" stroke="#1890ff" stroke-width="2"/><circle cx="10" cy="70" r="3" fill="#1890ff"/><circle cx="30" cy="40" r="3" fill="#1890ff"/><circle cx="55" cy="55" r="3" fill="#1890ff"/><circle cx="80" cy="20" r="3" fill="#1890ff"/>',
  pie: '<circle cx="50" cy="45" r="30" fill="#e8e8e8"/><path d="M50,45 L50,15 A30,30 0 0,1 75.98,30 Z" fill="#1890ff"/><path d="M50,45 L75.98,30 A30,30 0 0,1 68.66,72.98 Z" fill="#52c41a"/>',
  radar: '<polygon points="50,15 80,35 70,70 30,70 20,35" fill="none" stroke="#d9d9d9" stroke-width="1"/><polygon points="50,28 68,38 63,58 37,58 32,38" fill="rgba(24,144,255,0.2)" stroke="#1890ff" stroke-width="1.5"/>',
  scatter: '<circle cx="20" cy="60" r="4" fill="#1890ff"/><circle cx="35" cy="40" r="4" fill="#1890ff"/><circle cx="50" cy="50" r="4" fill="#1890ff"/><circle cx="65" cy="25" r="4" fill="#1890ff"/><circle cx="80" cy="35" r="4" fill="#1890ff"/>',
}

function buildHtml(props: ChartProps): string {
  const icon = CHART_ICONS[props.chartType] || CHART_ICONS.bar
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:${props.backgroundColor || '#fff'};border:1px solid #e8e8e8;box-sizing:border-box">`
    + `<svg width="60%" height="60%" viewBox="0 0 100 90" xmlns="http://www.w3.org/2000/svg">${icon}</svg>`
    + `<span style="font-size:10px;color:#999;margin-top:4px">${escapeHtml(props.chartType)}</span>`
    + `</div>`
}

export function createChartExtension(_context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildHtml(node.props as unknown as ChartProps)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
    getContextActions() {
      return []
    },
  }
}
