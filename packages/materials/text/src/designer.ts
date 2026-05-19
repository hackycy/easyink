import type { MaterialControlPolicy, MaterialDesignerExtension, MaterialExtensionContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { escapeHtml } from '@easyink/shared'
import { getTextProps, isTextAutoHeight, measureTextNode } from './layout'
import { getTextContainerStyles, getTextContentStyles } from './rendering'

const AUTO_HEIGHT_CONTROL_POLICY: MaterialControlPolicy = {
  geometry: {
    height: { state: 'disabled', reason: 'designer.reason.runtimeHeight' },
  },
  resize: {
    height: { state: 'hidden', reason: 'designer.reason.runtimeHeight' },
  },
}

function buildHtml(node: MaterialNode, context: MaterialExtensionContext): string {
  const p = getTextProps(node)
  const unit = context.getSchema().unit
  const prefix = p.prefix ? escapeHtml(p.prefix) : ''
  const suffix = p.suffix ? escapeHtml(p.suffix) : ''
  let isPlaceholder = false

  let display: string
  if (node.binding) {
    const b = Array.isArray(node.binding) ? node.binding[0] : node.binding
    const label = context.getBindingLabel(b)
    display = `${prefix}{#${escapeHtml(label)}}${suffix}`
  }
  else {
    if (p.content) {
      display = `${prefix}${escapeHtml(p.content)}${suffix}`
    }
    else {
      display = escapeHtml(context.t('designer.placeholder.textMaterialEmpty'))
      isPlaceholder = true
    }
  }

  const style = [
    ...getTextContainerStyles(p, unit),
    'position:relative',
  ].filter(Boolean).join(';')

  const textStyle = [
    ...getTextContentStyles(p, unit),
    isPlaceholder ? 'opacity:0.45' : '',
  ].filter(Boolean).join(';')

  return `<div style="${style}"><span style="${textStyle}">${display || '&nbsp;'}</span></div>`
}

function resolveDesignerDisplayText(node: MaterialNode, context: MaterialExtensionContext): string {
  const p = getTextProps(node)
  if (node.binding) {
    const b = Array.isArray(node.binding) ? node.binding[0] : node.binding
    return `${p.prefix || ''}{#${context.getBindingLabel(b)}}${p.suffix || ''}`
  }
  if (p.content)
    return `${p.prefix || ''}${p.content}${p.suffix || ''}`
  return context.t('designer.placeholder.textMaterialEmpty')
}

function syncAutoHeight(node: MaterialNode, context: MaterialExtensionContext): void {
  if (!isTextAutoHeight(node))
    return
  const measured = measureTextNode(node, resolveDesignerDisplayText(node, context))
  if (Math.abs(node.height - measured.height) <= 0.1)
    return

  context.tx.run<MaterialNode>(node.id, (draft) => {
    draft.height = measured.height
  }, {
    mergeKey: `text:auto-height:${node.id}`,
    label: 'designer.history.updateTextHeight',
  })
}

export function createTextExtension(context: MaterialExtensionContext): MaterialDesignerExtension {
  return {
    renderContent(nodeSignal, container) {
      function render() {
        const node = nodeSignal.get()
        container.innerHTML = buildHtml(node, context)
        syncAutoHeight(node, context)
      }
      render()
      const unsub = nodeSignal.subscribe(render)
      return unsub
    },
    resolveControlPolicy(node) {
      return isTextAutoHeight(node) ? AUTO_HEIGHT_CONTROL_POLICY : {}
    },
  }
}
