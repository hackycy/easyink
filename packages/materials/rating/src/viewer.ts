import type { ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { RatingProps } from './schema'
import { viewerElement, viewerText } from '@easyink/core'
import { getNodeModel } from '@easyink/schema'
import { formatRatingValue, getRatingCharacterFills, resolveRatingProps } from './rendering'

export function renderRating(node: MaterialNode, context?: ViewerRenderContext) {
  const props = resolveRatingProps({
    ...getNodeModel<RatingProps>(node),
    ...(context?.resolvedProps ?? {}),
  })
  const unit = context?.unit ?? 'mm'
  const label = `${formatRatingValue(props.value)}/100`

  return {
    tree: viewerElement('div', { attributes: { 'role': 'img', 'aria-label': label }, style: {
      'width': '100%',
      'height': '100%',
      'display': 'flex',
      'align-items': 'center',
      'justify-content': 'space-between',
      'overflow': 'hidden',
      'white-space': 'nowrap',
      'box-sizing': 'border-box',
      'line-height': '1',
    } }, getRatingCharacterFills(props.value, props.characterCount).map(fill => viewerElement('span', {
      attributes: { 'aria-hidden': true },
      style: {
        'display': 'flex',
        'align-items': 'center',
        'justify-content': 'center',
        'flex': '0 0 auto',
        'height': '100%',
        'min-width': '0',
        'font-size': `${props.characterSize}${unit}`,
        'line-height': '1',
        'background': `linear-gradient(90deg,${props.activeColor} 0%,${props.activeColor} ${fill.fillPercent}%,${props.backgroundColor} ${fill.fillPercent}%,${props.backgroundColor} 100%)`,
        '-webkit-background-clip': 'text',
        'background-clip': 'text',
        'color': 'transparent',
        '-webkit-text-fill-color': 'transparent',
      },
    }, [viewerText(props.character)]))),
  }
}
