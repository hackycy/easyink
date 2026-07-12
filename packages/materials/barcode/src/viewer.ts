import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { viewerElement, viewerSanitizedMarkup, viewerText } from '@easyink/core'
import { generateBarcodeEmptySvg, generateBarcodeSvg } from './render'
import { resolveBarcodeProps } from './schema'

export function renderBarcode(node: MaterialNode, context: ViewerRenderContext) {
  const props = resolveBarcodeProps(node)
  const value = props.value == null ? '' : String(props.value)

  if (!value) {
    return sanitized(context, generateBarcodeEmptySvg({
      lineColor: props.lineColor,
      backgroundColor: props.backgroundColor,
    }))
  }

  try {
    return sanitized(context, generateBarcodeSvg(value, {
      format: props.format,
      lineWidth: props.lineWidth,
      lineColor: props.lineColor,
      backgroundColor: props.backgroundColor,
      showText: props.showText,
    }))
  }
  catch {
    return {
      tree: viewerElement('div', { style: {
        'width': '100%',
        'height': '100%',
        'display': 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'background': props.backgroundColor,
        'color': '#e53e3e',
        'font-size': '12px',
        'border': '1px dashed #e53e3e',
      } }, [viewerText(`Invalid: ${value}`)]),
    }
  }
}

function sanitized(context: ViewerRenderContext, source: string) {
  return { tree: viewerSanitizedMarkup(context.capabilities.sanitizeMarkup({ format: 'svg', source })) }
}
