import type { MaterialNode } from '@easyink/schema'
import type { QrcodeProps } from './schema'
import { trustedViewerHtml } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { generateQrcodeEmptySvg, generateQrcodeSvg } from './render'

export function renderQrcode(node: MaterialNode) {
  const props = getNodeModel<QrcodeProps>(node)
  const value = props.value == null ? '' : String(props.value)

  if (!value) {
    return {
      html: trustedViewerHtml(generateQrcodeEmptySvg({
        foreground: props.foreground,
        background: props.background,
      })),
    }
  }

  return {
    html: trustedViewerHtml(generateQrcodeSvg(value, {
      errorCorrectionLevel: props.errorCorrectionLevel,
      foreground: props.foreground,
      background: props.background,
    })),
  }
}
