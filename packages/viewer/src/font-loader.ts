import type { FontManager, FontSource } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { ViewerDiagnosticEvent } from './types'

/**
 * Collect all font families referenced in a schema (page-level + element-level).
 */
export function collectFontFamilies(schema: DocumentSchema): Set<string> {
  const families = new Set<string>()

  // Page-level font
  if (schema.page.font) {
    families.add(schema.page.font)
  }

  // Element-level fonts
  collectFromNodes(schema.elements, families)

  return families
}

function collectFromNodes(nodes: MaterialNode[], families: Set<string>): void {
  for (const node of nodes) {
    const fontFamily = node.props?.fontFamily
    if (typeof fontFamily === 'string' && fontFamily) {
      families.add(fontFamily)
    }
    if (node.children) {
      collectFromNodes(node.children, families)
    }
  }
}

/**
 * Load all required fonts via FontManager and inject @font-face rules into a target.
 * Returns diagnostic events for any fonts that fail to load.
 */
export async function loadAndInjectFonts(
  families: Set<string>,
  fontManager: FontManager,
  target: Document | ShadowRoot,
): Promise<ViewerDiagnosticEvent[]> {
  const diagnostics: ViewerDiagnosticEvent[] = []

  if (families.size === 0 || !fontManager.provider) {
    return diagnostics
  }

  const loadResults = await Promise.allSettled(
    [...families].map(async (family) => {
      const source = await fontManager.loadFont(family)
      return { family, source }
    }),
  )

  for (const result of loadResults) {
    if (result.status === 'fulfilled') {
      injectFontFace(result.value.family, result.value.source, target)
    }
    else {
      const cause = result.reason instanceof Error
        ? { name: result.reason.name, message: result.reason.message, stack: result.reason.stack }
        : result.reason
      diagnostics.push({
        category: 'viewer',
        severity: 'warning',
        code: 'FONT_LOAD_FAILED',
        message: `Failed to load font: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        scope: 'font',
        cause,
      })
    }
  }

  return diagnostics
}

/**
 * Inject a single @font-face rule into a document or shadow root.
 */
function injectFontFace(
  family: string,
  source: FontSource,
  target: Document | ShadowRoot,
): void {
  const doc = target instanceof Document ? target : target.ownerDocument
  const styleEl = doc.createElement('style')

  const src = typeof source === 'string'
    ? `url("${source}")`
    : `url("${arrayBufferToDataUrl(source)}")`

  styleEl.textContent = `@font-face { font-family: "${family}"; src: ${src}; font-display: swap; }`

  if (target instanceof Document) {
    target.head.appendChild(styleEl)
  }
  else {
    target.appendChild(styleEl)
  }
}

function arrayBufferToDataUrl(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!)
  }
  return `data:font/woff2;base64,${btoa(binary)}`
}
