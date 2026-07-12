import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { QrcodeProps } from './schema'
import { viewerSanitizedMarkup } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { generateQrcodeEmptySvg, generateQrcodeSvg } from './render'

export function renderQrcode(node: MaterialNode, context: ViewerRenderContext) {
  const props = getNodeModel<QrcodeProps>(node)
  const value = props.value == null ? '' : String(props.value)

  if (!value) {
    return sanitized(context, generateQrcodeEmptySvg({
      foreground: props.foreground,
      background: props.background,
    }))
  }

  return sanitized(context, generateQrcodeSvg(value, {
    errorCorrectionLevel: props.errorCorrectionLevel,
    foreground: props.foreground,
    background: props.background,
  }))
}

function sanitized(context: ViewerRenderContext, source: string) {
  return { tree: viewerSanitizedMarkup(context.capabilities.sanitizeMarkup({ format: 'svg', source })) }
}
