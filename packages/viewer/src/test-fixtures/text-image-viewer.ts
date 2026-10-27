import type { ImageProps } from '@easyink/material-image/viewer'
import type { TextProps } from '@easyink/material-text/viewer'
import { createImageNode, image, IMAGE_DEFAULTS } from '@easyink/material-image/viewer'
import { createTextNode, getTextRenderSize, measureText, renderText, text, TEXT_DEFAULTS } from '@easyink/material-text/viewer'
import { createViewer } from '@easyink/viewer'

export const helpers = { createTextNode, createImageNode, TEXT_DEFAULTS, IMAGE_DEFAULTS, renderText, measureText, getTextRenderSize }
export const props: { text: TextProps, image: ImageProps } = { text: TEXT_DEFAULTS, image: IMAGE_DEFAULTS }
export const create = (container: HTMLElement) => createViewer({ container, materials: [text, image] })
