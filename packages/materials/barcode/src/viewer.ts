import type { ViewerRenderContext, ViewerRenderOutput } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createBarcodeEmptySvgElement, createBarcodeSvgElement } from './render'
import { resolveBarcodeProps } from './schema'

function createErrorPlaceholder(document: Document, backgroundColor: string, value: string): HTMLDivElement {
  const error = document.createElement('div')
  error.style.width = '100%'
  error.style.height = '100%'
  error.style.display = 'flex'
  error.style.alignItems = 'center'
  error.style.justifyContent = 'center'
  error.style.boxSizing = 'border-box'
  error.style.background = backgroundColor
  error.style.color = '#e53e3e'
  error.style.fontSize = '12px'
  error.style.border = '1px dashed #e53e3e'
  error.textContent = `Invalid: ${value}`
  return error
}

export function renderBarcode(
  node: MaterialNode,
  context: Pick<ViewerRenderContext, 'document' | 'unit'>,
): ViewerRenderOutput {
  const props = resolveBarcodeProps(node)
  const value = props.value == null ? '' : String(props.value)
  const { document } = context
  const frame = document.createElement('div')
  frame.style.width = '100%'
  frame.style.height = '100%'
  frame.style.boxSizing = 'border-box'

  if (props.borderWidth) {
    frame.style.border = `${props.borderWidth}${context.unit} ${props.borderType} ${props.borderColor}`
  }

  if (!value) {
    frame.appendChild(createBarcodeEmptySvgElement({
      lineColor: props.lineColor,
      backgroundColor: props.backgroundColor,
    }, document))
    return { element: frame }
  }

  try {
    frame.appendChild(createBarcodeSvgElement(value, {
      format: props.format,
      lineWidth: props.lineWidth,
      lineColor: props.lineColor,
      backgroundColor: props.backgroundColor,
      showText: props.showText,
    }, document))
  }
  catch {
    frame.appendChild(createErrorPlaceholder(document, props.backgroundColor, value))
  }

  return { element: frame }
}
