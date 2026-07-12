import type { TextProps } from './schema'
import { escapeAttr } from '@easyink/shared'
import { resolveTextProps } from './layout'

export function resolveTextWritingMode(props: Partial<Pick<TextProps, 'writingMode'>>): TextProps['writingMode'] {
  return props.writingMode === 'vertical' ? 'vertical' : 'horizontal'
}

export function resolveTextOverflow(props: Partial<Pick<TextProps, 'overflow' | 'writingMode'>>): TextProps['overflow'] {
  const writingMode = resolveTextWritingMode(props)
  if (writingMode === 'vertical' && props.overflow === 'ellipsis')
    return 'hidden'
  return props.overflow === 'visible' || props.overflow === 'ellipsis' ? props.overflow : 'hidden'
}

export function getTextContainerStyles(props: Partial<Pick<TextProps, 'backgroundColor' | 'borderWidth' | 'borderType' | 'borderColor' | 'verticalAlign' | 'writingMode' | 'overflow'>>, unit: string) {
  const resolved = resolveTextProps(props)
  const writingMode = resolved.writingMode
  const overflow = resolveTextOverflow(resolved)
  const verticalAlign = writingMode === 'vertical'
    ? ({ top: 'flex-end', middle: 'center', bottom: 'flex-start' } as const)[resolved.verticalAlign]
    : ({ top: 'flex-start', middle: 'center', bottom: 'flex-end' } as const)[resolved.verticalAlign]
  const borderStyle = resolved.borderType === 'solid' ? 'solid' : ({ dashed: 'dashed', dotted: 'dotted' } as const)[resolved.borderType]

  return [
    'width:100%;height:100%',
    'display:flex',
    writingMode === 'vertical' ? `justify-content:${verticalAlign}` : `align-items:${verticalAlign}`,
    'box-sizing:border-box',
    `overflow:${overflow === 'visible' ? 'visible' : 'hidden'}`,
    resolved.backgroundColor ? `background:${escapeAttr(resolved.backgroundColor)}` : '',
    resolved.borderWidth ? `border:${resolved.borderWidth}${unit} ${borderStyle} ${escapeAttr(resolved.borderColor)}` : '',
  ].filter(Boolean)
}

export function getTextContentStyles(props: Partial<Pick<TextProps, 'fontSize' | 'fontFamily' | 'fontWeight' | 'fontStyle' | 'color' | 'lineHeight' | 'letterSpacing' | 'wrapMode' | 'overflow' | 'textAlign' | 'writingMode'>>, unit: string) {
  const resolved = resolveTextProps(props)
  const writingMode = resolved.writingMode
  const overflow = resolveTextOverflow(resolved)
  const textAlign = writingMode === 'vertical'
    ? ({ left: 'start', center: 'center', right: 'end' } as const)[resolved.textAlign]
    : resolved.textAlign

  return [
    'display:block',
    writingMode === 'vertical' ? 'height:100%' : 'width:100%',
    writingMode === 'horizontal' ? 'min-width:0' : '',
    writingMode === 'vertical' ? 'writing-mode:vertical-rl' : '',
    writingMode === 'vertical' ? 'text-orientation:mixed' : '',
    `text-align:${textAlign}`,
    `font-size:${resolved.fontSize}${unit}`,
    resolved.fontFamily ? `font-family:${escapeAttr(resolved.fontFamily)}` : '',
    `font-weight:${escapeAttr(resolved.fontWeight)}`,
    `font-style:${escapeAttr(resolved.fontStyle)}`,
    `color:${escapeAttr(resolved.color)}`,
    `line-height:${resolved.lineHeight}`,
    resolved.letterSpacing ? `letter-spacing:${resolved.letterSpacing}${unit}` : '',
    ...getWrapStyles(resolved),
    overflow === 'hidden' ? 'overflow:hidden' : '',
    overflow === 'visible' ? 'overflow:visible' : '',
    overflow === 'ellipsis' ? 'text-overflow:ellipsis' : '',
  ].filter(Boolean)
}

function getWrapStyles(props: Partial<Pick<TextProps, 'wrapMode' | 'writingMode' | 'overflow'>>): string[] {
  const writingMode = resolveTextWritingMode(props)
  const overflow = resolveTextOverflow(props)
  if (overflow === 'ellipsis')
    return ['white-space:nowrap', 'overflow:hidden']

  if (writingMode === 'vertical') {
    return props.wrapMode === 'nowrap'
      ? ['white-space:pre', 'word-break:normal', 'overflow-wrap:normal']
      : ['white-space:pre-wrap', props.wrapMode === 'anywhere' ? 'overflow-wrap:anywhere' : 'overflow-wrap:normal', props.wrapMode === 'anywhere' ? 'word-break:break-word' : 'word-break:normal']
  }

  if (props.wrapMode === 'nowrap')
    return ['white-space:pre', 'word-break:normal', 'overflow-wrap:normal']
  if (props.wrapMode === 'wrap')
    return ['white-space:pre-wrap', 'word-break:normal', 'overflow-wrap:normal']
  return ['white-space:pre-wrap', 'overflow-wrap:anywhere', 'word-break:break-word']
}
