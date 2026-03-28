import type { ElementRenderFunction } from '../../types'

interface BarcodeProps {
  format: string
  value: string
  displayValue?: boolean
  barWidth?: number
  errorCorrectionLevel?: string
}

/**
 * 条形码/二维码元素渲染器
 *
 * 渲染为占位容器 + data 属性，实际的条码绘制由插件或外部库完成。
 * 这里提供基础的占位展示（显示编码值和格式），
 * 消费者可通过 afterRender 钩子或替换此渲染器来集成 JsBarcode/QRCode 等库。
 */
export const renderBarcode: ElementRenderFunction = (node, context) => {
  const el = document.createElement('div')
  el.className = 'easyink-element easyink-barcode'
  el.dataset.elementId = node.id

  const props = node.props as unknown as BarcodeProps

  // 解析编码值
  let value: string = props.value ?? ''
  if (node.binding?.path) {
    const resolved = context.resolver.resolve(node.binding.path, context.data)
    if (resolved != null)
      value = String(resolved)
  }

  // 存储到 data 属性，供外部库读取
  el.dataset.barcodeFormat = props.format ?? 'CODE128'
  el.dataset.barcodeValue = value
  if (props.barWidth != null)
    el.dataset.barcodeBarWidth = String(props.barWidth)
  if (props.errorCorrectionLevel)
    el.dataset.barcodeEcLevel = props.errorCorrectionLevel

  // 占位展示
  el.style.display = 'flex'
  el.style.flexDirection = 'column'
  el.style.alignItems = 'center'
  el.style.justifyContent = 'center'
  el.style.border = '1px dashed #ccc'
  el.style.fontSize = '12px'
  el.style.color = '#999'

  const formatLabel = document.createElement('span')
  formatLabel.textContent = `[${props.format ?? 'CODE128'}]`
  el.appendChild(formatLabel)

  if (props.displayValue !== false) {
    const valueLabel = document.createElement('span')
    valueLabel.textContent = value || '(empty)'
    el.appendChild(valueLabel)
  }

  return el
}
