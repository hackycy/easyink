import type { MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { BarcodeProps } from './schema'
import { getBindingRefs } from '@easyink/schema'
import { createBarcodeSvgElement } from './render'
import { BARCODE_FORMATS, resolveBarcodeProps } from './schema'

function applyFrameStyles(frame: HTMLDivElement, props: BarcodeProps, unit: string): void {
  frame.style.position = 'relative'
  frame.style.width = '100%'
  frame.style.height = '100%'
  frame.style.boxSizing = 'border-box'
  if (props.borderWidth) {
    frame.style.border = `${props.borderWidth}${unit} ${props.borderType} ${props.borderColor}`
  }
}

function createErrorPlaceholder(document: Document, props: BarcodeProps, value: string): HTMLDivElement {
  const error = document.createElement('div')
  error.style.width = '100%'
  error.style.height = '100%'
  error.style.display = 'flex'
  error.style.alignItems = 'center'
  error.style.justifyContent = 'center'
  error.style.boxSizing = 'border-box'
  error.style.background = props.backgroundColor
  error.style.color = '#e53e3e'
  error.style.fontSize = '11px'
  error.style.border = '1px dashed #e53e3e'
  error.textContent = `Invalid: ${value}`
  return error
}

function appendLabelOverlay(document: Document, frame: HTMLElement, label: string, color: string): void {
  const overlay = document.createElement('div')
  overlay.style.position = 'absolute'
  overlay.style.inset = '0'
  overlay.style.display = 'flex'
  overlay.style.alignItems = 'center'
  overlay.style.justifyContent = 'center'

  const text = document.createElement('span')
  text.style.maxWidth = '90%'
  text.style.overflow = 'hidden'
  text.style.padding = '1px 4px'
  text.style.borderRadius = '2px'
  text.style.background = 'rgba(255, 255, 255, 0.8)'
  text.style.color = color
  text.style.fontSize = '10px'
  text.style.textOverflow = 'ellipsis'
  text.style.whiteSpace = 'nowrap'
  text.textContent = label

  overlay.appendChild(text)
  frame.appendChild(overlay)
}

function createPlaceholder(document: Document, props: BarcodeProps, label: string): HTMLElement {
  const placeholder = document.createElement('div')
  placeholder.style.position = 'relative'
  placeholder.style.width = '100%'
  placeholder.style.height = '100%'
  placeholder.style.opacity = '0.4'

  const sampleValue = BARCODE_FORMATS.find(format => format.value === props.format)?.sampleValue || 'EasyInk'
  try {
    placeholder.appendChild(createBarcodeSvgElement(sampleValue, {
      format: props.format,
      lineWidth: props.lineWidth,
      lineColor: props.lineColor,
      backgroundColor: props.backgroundColor,
      showText: false,
    }, document))
  }
  catch {
    return createErrorPlaceholder(document, props, label)
  }

  appendLabelOverlay(document, placeholder, label, props.lineColor)
  return placeholder
}

function buildElement(node: MaterialNode, context: MaterialExtensionContext, document: Document): HTMLElement {
  const props = resolveBarcodeProps(node)
  const frame = document.createElement('div')
  applyFrameStyles(frame, props, context.getSchema().unit)

  const binding = getBindingRefs(node.binding)[0]
  const label = binding ? `{#${context.getBindingLabel(binding)}}` : undefined
  const value = props.value == null ? '' : String(props.value)

  if (!value) {
    frame.appendChild(createPlaceholder(document, props, label || props.format))
    return frame
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
    frame.appendChild(createErrorPlaceholder(document, props, value))
    return frame
  }

  if (label)
    appendLabelOverlay(document, frame, label, props.lineColor)

  return frame
}

export function createBarcodeExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        container.replaceChildren(buildElement(nodeSignal.get(), context, container.ownerDocument))
      }
      render()
      return nodeSignal.subscribe(render)
    },
  }
}
