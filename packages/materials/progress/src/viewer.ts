import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { ProgressProps } from './schema'
import { viewerElement, viewerText } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { formatProgressValue, normalizeProgressValue, resolveProgressProps } from './rendering'

export function renderProgress(node: MaterialNode, context?: ViewerRenderContext) {
  const props = resolveProgressProps({ ...getNodeModel<ProgressProps>(node), ...(context?.resolvedModel ?? {}) })
  const unit = context?.unit ?? 'mm'
  const text = `${formatProgressValue(props.value)}${props.suffix}`
  const bar = viewerElement('div', { style: {
    'width': '100%',
    'height': `${props.progressHeight}${unit}`,
    'background': props.trackColor,
    'border-radius': '999px',
    'overflow': 'hidden',
    'box-sizing': 'border-box',
    'flex': '0 0 auto',
  } }, [viewerElement('div', { style: {
    'width': `${normalizeProgressValue(props.value)}%`,
    'height': '100%',
    'background': props.progressColor,
    'border-radius': 'inherit',
  } })])
  const label = viewerElement('div', { style: {
    'width': '100%',
    'text-align': 'center',
    'font-size': `${props.fontSize}${unit}`,
    ...(props.fontFamily ? { 'font-family': props.fontFamily } : {}),
    'font-weight': props.fontWeight,
    'font-style': props.fontStyle,
    'color': props.color,
    'line-height': '1.2',
    'white-space': 'nowrap',
    'overflow': 'hidden',
    'text-overflow': 'ellipsis',
    'box-sizing': 'border-box',
    'flex': '0 0 auto',
  } }, [viewerText(text)])
  const children = props.showText && props.textPosition === 'top' ? [label, bar] : props.showText ? [bar, label] : [bar]
  return {
    tree: viewerElement('div', { attributes: { 'role': 'img', 'aria-label': text }, style: {
      'width': '100%',
      'height': '100%',
      'display': 'flex',
      'flex-direction': 'column',
      'justify-content': 'center',
      'align-items': 'stretch',
      ...(props.showText ? { gap: `${Math.max(0.2, props.fontSize * 0.25)}${unit}` } : {}),
      'box-sizing': 'border-box',
      'overflow': 'hidden',
    } }, children),
  }
}
