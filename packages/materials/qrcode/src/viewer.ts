import type { MaterialNode } from '@easyink/schema'
import type { QrcodeProps } from './schema'
import { getNodeProps } from '@easyink/schema'
import { generateQrcodeSvg } from './render'

export function renderQrcode(node: MaterialNode) {
  const props = getNodeProps<QrcodeProps>(node)
  const value = props.value || ''

  if (!value) {
    return {
      html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:${props.background};color:${props.foreground};font-size:12px;border:1px solid #ddd;">[QRCode]</div>`,
    }
  }

  return {
    html: generateQrcodeSvg(value, {
      errorCorrectionLevel: props.errorCorrectionLevel,
      foreground: props.foreground,
      background: props.background,
    }),
  }
}
