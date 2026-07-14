import type { MaterialMeasureRequest, MaterialViewerLayoutFacet, ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createLayoutConstraintKey, createNonFragmentingMaterialPlans, viewerElement, viewerText } from '@easyink/core'
import { getTextDisplayValue, getTextProps } from './layout'

export function renderText(node: MaterialNode, contextOrData?: ViewerRenderContext | Record<string, unknown>, unit = 'mm') {
  const props = getTextProps(node)
  const context = isViewerRenderContext(contextOrData) ? contextOrData : undefined
  const resolvedUnit = context?.unit ?? unit
  const raw = props.content == null ? '' : String(props.content)
  const display = `${props.prefix || ''}${raw}${props.suffix || ''}`
  const vertical = props.writingMode === 'vertical'
  const effectiveOverflow = vertical && props.overflow === 'ellipsis' ? 'hidden' : props.overflow
  const overflow = effectiveOverflow === 'visible' ? 'visible' : 'hidden'
  const align = vertical
    ? ({ top: 'flex-end', middle: 'center', bottom: 'flex-start' } as const)[props.verticalAlign]
    : ({ top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const)[props.verticalAlign]
  const wrappingCss = resolveTextWrappingCss(props)

  return {
    tree: viewerElement('div', { style: {
      'width': '100%',
      'height': '100%',
      'display': 'flex',
      'box-sizing': 'border-box',
      overflow,
      ...(vertical ? { 'justify-content': align } : { 'align-items': align }),
      ...(props.backgroundColor ? { background: props.backgroundColor } : {}),
      ...(props.borderWidth ? { border: `${props.borderWidth}${resolvedUnit} ${props.borderType} ${props.borderColor}` } : {}),
    } }, [viewerElement('span', { style: {
      'display': 'block',
      ...(vertical ? { 'height': '100%', 'writing-mode': 'vertical-rl', 'text-orientation': 'mixed' } : { 'width': '100%', 'min-width': '0' }),
      'text-align': vertical ? ({ left: 'start', center: 'center', right: 'end' } as const)[props.textAlign] : props.textAlign,
      'font-size': `${props.fontSize}${resolvedUnit}`,
      ...(props.fontFamily ? { 'font-family': props.fontFamily } : {}),
      'font-weight': props.fontWeight,
      'font-style': props.fontStyle,
      'color': props.color,
      'line-height': props.lineHeight,
      ...(props.letterSpacing ? { 'letter-spacing': `${props.letterSpacing}${resolvedUnit}` } : {}),
      'white-space': wrappingCss.whiteSpace,
      'word-break': props.wrapMode === 'anywhere' ? 'break-word' : 'normal',
      'overflow-wrap': wrappingCss.overflowWrap,
      ...(effectiveOverflow === 'ellipsis' ? { 'overflow': 'hidden', 'text-overflow': 'ellipsis' } : { overflow }),
    } }, [viewerText(display || '\u00A0')])]),
  }
}

function isViewerRenderContext(value: unknown): value is ViewerRenderContext {
  return typeof value === 'object' && value !== null
    && 'unit' in value && typeof value.unit === 'string'
    && 'data' in value && typeof value.data === 'object' && value.data !== null
}

export const textViewerLayout: MaterialViewerLayoutFacet = Object.freeze({
  async measure(request: MaterialMeasureRequest) {
    const node = Object.freeze({ ...request.node, model: request.resolvedModel }) as MaterialNode
    const props = getTextProps(node)
    const wrappingCss = resolveTextWrappingCss(props)
    let width = node.width
    let height = node.height
    if (props.heightMode === 'auto') {
      const border = props.borderWidth * 2
      const measured = await request.measureText({
        text: getTextDisplayValue(props),
        availableWidth: Math.max(0, node.width - border),
        unit: request.constraints.unit,
        style: {
          fontFamily: props.fontFamily.trim() || 'sans-serif',
          fontSize: props.fontSize,
          fontWeight: props.fontWeight,
          fontStyle: props.fontStyle === 'italic' || props.fontStyle === 'oblique'
            ? props.fontStyle
            : 'normal',
          lineHeight: props.lineHeight,
          letterSpacing: props.letterSpacing,
          whiteSpace: wrappingCss.whiteSpace,
          overflowWrap: wrappingCss.overflowWrap,
        },
      })
      const minHeight = props.minHeight > 0 ? props.minHeight : 0
      const maxHeight = props.maxHeight > 0 ? props.maxHeight : Number.POSITIVE_INFINITY
      width = node.width
      height = Math.min(Math.max(measured.height + border, minHeight), maxHeight)
    }
    return createNonFragmentingMaterialPlans({
      instanceKey: request.instanceKey,
      nodeId: request.node.id,
      nodeRevision: request.nodeRevision,
      constraintKey: createLayoutConstraintKey(request.constraints),
      pageIndex: 0,
      borderBox: { x: request.node.x, y: request.node.y, width, height },
      fragmentBox: { x: request.node.x, y: request.node.y, width, height },
    }).layoutPlan
  },
})

function resolveTextWrappingCss(
  props: Pick<ReturnType<typeof getTextProps>, 'overflow' | 'wrapMode'>,
): Readonly<{ whiteSpace: 'pre' | 'pre-wrap', overflowWrap: 'normal' | 'anywhere' }> {
  return {
    whiteSpace: props.overflow === 'ellipsis' || props.wrapMode === 'nowrap' ? 'pre' : 'pre-wrap',
    overflowWrap: props.wrapMode === 'anywhere' ? 'anywhere' : 'normal',
  }
}
