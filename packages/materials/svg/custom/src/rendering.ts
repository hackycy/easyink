import type { SvgCustomProps } from './schema'
import { escapeAttr, escapeHtml } from '@easyink/shared'
import { sanitizeSvgContent } from './sanitize'

const SVG_NS = 'http://www.w3.org/2000/svg'
const SVG_CUSTOM_DEFAULT_VIEW_BOX = '0 0 100 100'
const SVG_CUSTOM_DEFAULT_PRESERVE_ASPECT_RATIO = 'none'
const SVG_ROOT_DEFAULT_PRESERVE_ASPECT_RATIO = 'xMidYMid meet'
const DROPPED_ROOT_ATTRIBUTES = new Set(['xmlns', 'viewbox', 'width', 'height', 'preserveaspectratio', 'version'])

interface ParsedSvgInput {
  content: string
  viewBox?: string
  preserveAspectRatio?: string
}

interface NormalizedSvgCustomInput {
  content: string
  viewBox: string
  preserveAspectRatio: string
}

export function buildSvgCustomMarkup(props: SvgCustomProps): string {
  const contentValue = normalizeContentValue(props.content)
  if (!contentValue) {
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;border:1px dashed #d0d0d0;box-sizing:border-box">`
      + `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg">`
      + `<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>`
      + `</svg></div>`
  }

  if (isRemoteSvgSource(contentValue)) {
    return `<img src="${escapeAttr(contentValue)}" alt="" draggable="false" style="width:100%;height:100%;object-fit:fill;display:block" />`
  }

  const normalized = normalizeSvgCustomProps({ ...props, content: contentValue })
  const content = sanitizeSvgContent(normalized.content)
  return `<svg viewBox="${escapeHtml(normalized.viewBox)}" preserveAspectRatio="${escapeHtml(normalized.preserveAspectRatio)}" style="width:100%;height:100%;display:block" xmlns="http://www.w3.org/2000/svg">${content}</svg>`
}

export function normalizeSvgCustomProps(props: SvgCustomProps): NormalizedSvgCustomInput {
  const content = normalizeContentValue(props.content)
  const parsed = parseSvgInput(content)
  return {
    content: parsed?.content ?? content,
    viewBox: parsed?.viewBox ?? SVG_CUSTOM_DEFAULT_VIEW_BOX,
    preserveAspectRatio: parsed
      ? (parsed.preserveAspectRatio ?? SVG_ROOT_DEFAULT_PRESERVE_ASPECT_RATIO)
      : SVG_CUSTOM_DEFAULT_PRESERVE_ASPECT_RATIO,
  }
}

export function isRemoteSvgSource(value: string): boolean {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
}

function normalizeContentValue(value: unknown): string {
  if (value == null)
    return ''
  if (typeof value === 'string')
    return value.trim()
  return String(value).trim()
}

function parseSvgInput(content: string): ParsedSvgInput | null {
  const trimmed = stripSvgDocumentPreamble(content)
  if (!trimmed || !/^<svg[\s>]/i.test(trimmed))
    return null

  return parseSvgInputWithDom(trimmed) ?? parseSvgInputWithPattern(trimmed)
}

function stripSvgDocumentPreamble(content: string): string {
  return content
    .trim()
    .replace(/^<\?xml\b[\s\S]*?\?>\s*/i, '')
    .replace(/^<!DOCTYPE\s+svg\b(?:[^>"']|"[^"]*"|'[^']*')*>\s*/i, '')
    .trim()
}

function parseSvgInputWithDom(content: string): ParsedSvgInput | null {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined')
    return null

  const parser = new DOMParser()
  const document = parser.parseFromString(content, 'image/svg+xml')
  if (document.getElementsByTagName('parsererror').length > 0)
    return null

  const root = document.documentElement
  if (root.localName.toLowerCase() !== 'svg')
    return null

  const serializer = new XMLSerializer()
  const viewBox = readRootViewBox(root)
  const preserveAspectRatio = root.getAttribute('preserveAspectRatio') ?? undefined
  const contentRoot = document.createElementNS(SVG_NS, 'g')
  let hasRootAttrs = false

  for (const attr of Array.from(root.attributes)) {
    const name = attr.name.toLowerCase()
    if (!DROPPED_ROOT_ATTRIBUTES.has(name)) {
      contentRoot.setAttribute(attr.name, attr.value)
      hasRootAttrs = true
    }
  }

  const children = Array.from(root.childNodes).filter(child => !isParserArtifact(child))

  for (const child of children) {
    contentRoot.appendChild(child.cloneNode(true))
  }

  const innerContent = hasRootAttrs
    ? serializer.serializeToString(contentRoot)
    : children.map(child => serializer.serializeToString(child)).join('')

  return { content: innerContent, viewBox, preserveAspectRatio }
}

function parseSvgInputWithPattern(content: string): ParsedSvgInput | null {
  const match = content.match(/^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/i)
  if (!match)
    return null

  const attrs = match[1] ?? ''
  const viewBox = readAttribute(attrs, 'viewBox') ?? deriveViewBox(readAttribute(attrs, 'width'), readAttribute(attrs, 'height'))
  const preserveAspectRatio = readAttribute(attrs, 'preserveAspectRatio')
  return { content: match[2] ?? '', viewBox, preserveAspectRatio }
}

function readRootViewBox(root: Element): string | undefined {
  return root.getAttribute('viewBox') ?? deriveViewBox(root.getAttribute('width'), root.getAttribute('height'))
}

function isParserArtifact(node: Node): boolean {
  if (node.nodeType !== 1)
    return false
  const element = node as Element
  return element.namespaceURI === 'http://www.w3.org/1999/xhtml' && (element.localName === 'head' || element.localName === 'body')
}

function deriveViewBox(width: string | null | undefined, height: string | null | undefined): string | undefined {
  const parsedWidth = parseSvgLength(width)
  const parsedHeight = parseSvgLength(height)
  if (parsedWidth == null || parsedHeight == null)
    return undefined
  return `0 0 ${parsedWidth} ${parsedHeight}`
}

function parseSvgLength(value: string | null | undefined): string | undefined {
  const match = value?.trim().match(/^[+-]?(?:\d+\.?\d*|\.\d+)/)
  return match?.[0]
}

function readAttribute(attrs: string, name: string): string | undefined {
  const pattern = new RegExp(`${name}\\s*=\\s*(["'])(.*?)\\1`, 'i')
  return attrs.match(pattern)?.[2]
}
