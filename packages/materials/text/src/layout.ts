import type { MaterialNode } from '@easyink/schema'
import type { TextHeightMode, TextProps, TextWrapMode } from './schema'
import { getNodeModel } from '@easyink/schema'
import { TEXT_DEFAULTS } from './schema'

export interface ResolvedTextProps extends Omit<TextProps, 'minHeight' | 'maxHeight'> {
  heightMode: TextHeightMode
  wrapMode: TextWrapMode
  minHeight: number
  maxHeight: number
}

export interface TextMeasureResult {
  width: number
  height: number
  contentWidth: number
  contentHeight: number
  overflow: boolean
}

const CJK_RE = /[\u3000-\u9FFF\uF900-\uFAFF]/

export function getTextProps(node: MaterialNode): ResolvedTextProps {
  return resolveTextProps(getNodeModel<Partial<TextProps>>(node))
}

export function resolveTextProps(raw: Partial<TextProps> = {}): ResolvedTextProps {
  const wrapMode = raw.wrapMode === 'wrap' || raw.wrapMode === 'nowrap' || raw.wrapMode === 'anywhere'
    ? raw.wrapMode
    : TEXT_DEFAULTS.wrapMode

  return {
    ...TEXT_DEFAULTS,
    ...raw,
    writingMode: raw.writingMode === 'vertical' ? 'vertical' : 'horizontal',
    heightMode: raw.heightMode === 'auto' ? 'auto' : 'fixed',
    textAlign: raw.textAlign === 'left' || raw.textAlign === 'right' ? raw.textAlign : 'center',
    verticalAlign: raw.verticalAlign === 'top' || raw.verticalAlign === 'bottom' ? raw.verticalAlign : 'middle',
    wrapMode,
    overflow: raw.overflow === 'visible' || raw.overflow === 'ellipsis' ? raw.overflow : 'hidden',
    minHeight: Math.max(0, toFiniteNumber(raw.minHeight, 0)),
    maxHeight: Math.max(0, toFiniteNumber(raw.maxHeight, 0)),
    fontSize: Math.max(0.1, toFiniteNumber(raw.fontSize, TEXT_DEFAULTS.fontSize)),
    lineHeight: Math.max(0.1, toFiniteNumber(raw.lineHeight, TEXT_DEFAULTS.lineHeight)),
    letterSpacing: toFiniteNumber(raw.letterSpacing, TEXT_DEFAULTS.letterSpacing),
    borderWidth: Math.max(0, toFiniteNumber(raw.borderWidth, TEXT_DEFAULTS.borderWidth)),
  }
}

export function getTextDisplayValue(props: Pick<TextProps, 'content' | 'prefix' | 'suffix'>): string {
  const content = props.content == null ? '' : String(props.content)
  return `${props.prefix || ''}${content}${props.suffix || ''}`
}

export function isTextAutoHeight(node: MaterialNode): boolean {
  return getTextProps(node).heightMode === 'auto'
}

export function measureTextNode(node: MaterialNode, text = getTextDisplayValue(getTextProps(node))): TextMeasureResult {
  const props = getTextProps(node)
  const border = props.borderWidth * 2
  const width = Math.max(0, node.width)
  const contentBoxWidth = Math.max(props.fontSize, width - border)
  const contentSize = props.writingMode === 'vertical'
    ? measureVerticalText(text, props)
    : measureHorizontalText(text, props, contentBoxWidth)
  const naturalHeight = contentSize.height + border
  const minHeight = props.minHeight > 0 ? props.minHeight : 0
  const maxHeight = props.maxHeight > 0 ? props.maxHeight : Number.POSITIVE_INFINITY
  const height = Math.min(Math.max(naturalHeight, minHeight), maxHeight)

  return {
    width,
    height,
    contentWidth: contentSize.width + border,
    contentHeight: naturalHeight,
    overflow: naturalHeight > height + 0.001,
  }
}

function measureHorizontalText(text: string, props: ResolvedTextProps, width: number): { width: number, height: number } {
  const lineHeight = props.fontSize * props.lineHeight
  const lines = splitTextLines(text)
  let visualLines = 0
  let maxLineWidth = 0
  const shouldWrap = props.wrapMode !== 'nowrap' && props.overflow !== 'ellipsis'

  for (const line of lines) {
    const lineWidth = estimateTextWidth(line || ' ', props)
    maxLineWidth = Math.max(maxLineWidth, lineWidth)
    if (!shouldWrap) {
      visualLines += 1
      continue
    }
    visualLines += props.wrapMode === 'wrap'
      ? estimateNaturalWrapLineCount(line || ' ', props, width)
      : Math.max(1, Math.ceil(lineWidth / Math.max(props.fontSize, width)))
  }

  return {
    width: shouldWrap ? width : maxLineWidth,
    height: Math.max(1, visualLines) * lineHeight,
  }
}

function measureVerticalText(text: string, props: ResolvedTextProps): { width: number, height: number } {
  const lines = splitTextLines(text)
  let maxInlineSize = 0
  for (const line of lines)
    maxInlineSize = Math.max(maxInlineSize, estimateVerticalInlineSize(line || ' ', props))

  return {
    width: Math.max(1, lines.length) * props.fontSize * props.lineHeight,
    height: maxInlineSize,
  }
}

function estimateNaturalWrapLineCount(text: string, props: ResolvedTextProps, width: number): number {
  const tokens = text.match(/\S+\s*/g) ?? [' ']
  let lines = 1
  let current = 0
  const lineWidth = Math.max(props.fontSize, width)

  for (const token of tokens) {
    const tokenWidth = estimateTextWidth(token, props)
    if (current > 0 && current + tokenWidth > lineWidth) {
      lines += 1
      current = tokenWidth
    }
    else {
      current += tokenWidth
    }
  }

  return lines
}

export function estimateTextWidth(text: string, props: Pick<ResolvedTextProps, 'fontSize' | 'letterSpacing'>): number {
  const chars = Array.from(text || ' ')
  let width = 0
  chars.forEach((char, index) => {
    if (char === '\t') {
      width += props.fontSize * 2
    }
    else if (char === ' ') {
      width += props.fontSize * 0.33
    }
    else {
      width += CJK_RE.test(char) ? props.fontSize : props.fontSize * 0.56
    }
    if (index < chars.length - 1)
      width += props.letterSpacing
  })
  return Math.max(props.fontSize, width)
}

function estimateVerticalInlineSize(text: string, props: ResolvedTextProps): number {
  const chars = Array.from(text || ' ')
  if (chars.length === 0)
    return props.fontSize * props.lineHeight
  return chars.reduce((total, char, index) => {
    const advance = char === ' ' ? props.fontSize * 0.5 : props.fontSize
    return total + advance + (index < chars.length - 1 ? props.letterSpacing : 0)
  }, 0)
}

function splitTextLines(text: string): string[] {
  return String(text || ' ').split(/\r?\n/)
}

function toFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
