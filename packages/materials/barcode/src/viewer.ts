import type { MaterialNode } from '@easyink/schema'
import type { BarcodeProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { getNodeProps } from '@easyink/schema'
import { escapeHtml } from '@easyink/shared'
import { generateBarcodeEmptySvg, generateBarcodeSvg } from './render'

export function renderBarcode(node: MaterialNode) {
  const props = getNodeProps<BarcodeProps>(node)
  const value = props.value == null ? '' : String(props.value)

  if (!value) {
    return {
      html: trustedViewerHtml(generateBarcodeEmptySvg({
        lineColor: props.lineColor,
        backgroundColor: props.backgroundColor,
      })),
    }
  }

  try {
    return {
      html: trustedViewerHtml(generateBarcodeSvg(value, {
        format: props.format,
        lineWidth: props.lineWidth,
        lineColor: props.lineColor,
        backgroundColor: props.backgroundColor,
        showText: props.showText,
      })),
    }
  }
  catch {
    return {
      html: trustedViewerHtml(`<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${props.backgroundColor};color:#e53e3e;font-size:12px;border:1px dashed #e53e3e;">Invalid: ${escapeHtml(value)}</div>`),
    }
  }
}
