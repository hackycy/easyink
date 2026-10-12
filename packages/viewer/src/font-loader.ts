import type { FontManager } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import type { ViewerDiagnosticEvent } from './types'
import { traverseNodes } from '@easyink/schema'
import { RESOURCE_READY_TIMEOUT_MS, settleWithin } from './resource-readiness'

export { collectFontFamilies } from '@easyink/core'

export interface FontReadinessResult {
  diagnostics: ViewerDiagnosticEvent[]
  familySelections: Map<string, string>
}

let nextFontEnvironment = 0

/**
 * Load all required fonts via FontManager and inject @font-face rules into a target.
 * Returns diagnostic events for any fonts that fail to load.
 */
export async function loadAndInjectFonts(
  families: Set<string>,
  fontManager: FontManager,
  target: Document,
  signal: AbortSignal,
  timeoutMs = RESOURCE_READY_TIMEOUT_MS,
): Promise<FontReadinessResult> {
  const diagnostics: ViewerDiagnosticEvent[] = []
  const familySelections = new Map<string, string>()

  if (families.size === 0)
    return { diagnostics, familySelections }

  const familyList = [...families]
  const provider = fontManager.provider
  let descriptors = [] as Awaited<ReturnType<FontManager['listFonts']>>
  if (provider) {
    const catalog = await settleWithin(fontManager.listFonts(), signal, timeoutMs)
    if (catalog.status === 'ready') {
      descriptors = catalog.value
    }
    else {
      for (const family of familyList) {
        familySelections.set(family, 'sans-serif')
        diagnostics.push(createFontDiagnostic(family, catalog.status, catalog.status === 'failed' ? catalog.cause : undefined))
      }
      return { diagnostics, familySelections }
    }
  }

  // Only this request uses these CSS names. Another Viewer or a later request
  // cannot replace a committed face or remove its rule during fallback/cleanup.
  const environment = ++nextFontEnvironment
  const aliases = new Map(familyList.map((family, index) => [family, descriptors.find(item => item.family === family)?.source === 'system' ? family : `ei-viewer-font-${environment}-${index}`]))
  if (provider) {
    const originals = new Map([...aliases].map(([family, alias]) => [alias, family]))
    fontManager.setProvider({
      listFonts: async () => familyList.map((family) => {
        const descriptor = descriptors.find(item => item.family === family)
        return { displayName: family, weights: ['400'], styles: ['normal'], ...descriptor, family: aliases.get(family)! }
      }),
      loadFont: (family, weight, style) => provider.loadFont(originals.get(family) ?? family, weight, style),
    })
    await fontManager.listFonts()
  }

  await Promise.all(familyList.map(async (family) => {
    const descriptor = descriptors.find(item => item.family === family)
    let selectedFamily = family
    let providedFace = false
    if (provider) {
      const alias = aliases.get(family)!
      // Load before injection, so a timed-out provider cannot inject a late face.
      const load = await settleWithin(fontManager.loadFont(alias), signal, timeoutMs)
      if (load.status !== 'ready') {
        familySelections.set(family, 'sans-serif')
        diagnostics.push(createFontDiagnostic(family, load.status, load.status === 'failed' ? load.cause : undefined))
        return
      }
      providedFace = descriptor?.source !== 'system' && !(typeof load.value === 'object' && 'type' in load.value && load.value.type === 'system')
      selectedFamily = providedFace ? alias : family
      const injection = await settleWithin(fontManager.ensureFontLoaded({ family: alias }, target), signal, timeoutMs)
      if (injection.status !== 'ready') {
        familySelections.set(family, 'sans-serif')
        diagnostics.push(createFontDiagnostic(family, injection.status, injection.status === 'failed' ? injection.cause : undefined))
        removeInjectedFont(target, alias)
        return
      }
    }

    if (!target.fonts?.load) {
      familySelections.set(family, 'sans-serif')
      diagnostics.push({
        category: 'viewer',
        severity: 'warning',
        code: 'FONT_READINESS_UNAVAILABLE',
        message: `The target document cannot verify font "${family}"; a fallback was selected.`,
        scope: 'font',
      })
      if (providedFace)
        removeInjectedFont(target, selectedFamily)
      return
    }

    const readiness = await settleWithin(Promise.resolve().then(() => target.fonts.load(`16px ${JSON.stringify(selectedFamily)}`)), signal, timeoutMs)
    const missingProvidedFace = providedFace && readiness.status === 'ready' && readiness.value.length === 0
    if (readiness.status === 'ready' && !missingProvidedFace) {
      if (selectedFamily !== family)
        familySelections.set(family, selectedFamily)
      return
    }

    familySelections.set(family, 'sans-serif')
    diagnostics.push(createFontDiagnostic(family, readiness.status === 'ready' ? 'failed' : readiness.status, readiness.status === 'failed' ? readiness.cause : undefined))
    if (providedFace)
      removeInjectedFont(target, selectedFamily)
  }))

  return { diagnostics, familySelections }
}

export function applyFontSelections(schema: DocumentSchema, familySelections: ReadonlyMap<string, string>): void {
  if (familySelections.size === 0)
    return

  if (schema.page.font)
    schema.page.font = familySelections.get(schema.page.font) ?? schema.page.font

  traverseNodes(schema, (node: MaterialNode) => {
    const props = node.props
    if (!props)
      return
    if (typeof props.fontFamily === 'string')
      props.fontFamily = familySelections.get(props.fontFamily) ?? props.fontFamily
    const typography = props.typography
    if (typography && typeof typography === 'object' && !Array.isArray(typography)) {
      const typographyProps = typography as Record<string, unknown>
      if (typeof typographyProps.fontFamily === 'string')
        typographyProps.fontFamily = familySelections.get(typographyProps.fontFamily) ?? typographyProps.fontFamily
    }
  })
}

function createFontDiagnostic(
  family: string,
  outcome: 'failed' | 'timed-out',
  cause?: unknown,
): ViewerDiagnosticEvent {
  return {
    category: 'viewer',
    severity: 'warning',
    code: outcome === 'timed-out' ? 'FONT_LOAD_TIMEOUT' : 'FONT_LOAD_FAILED',
    message: outcome === 'timed-out'
      ? `Font readiness timed out for "${family}"; a fallback was selected.`
      : `Failed to load font "${family}"; a fallback was selected.`,
    scope: 'font',
    cause,
  }
}

function removeInjectedFont(target: Document, family: string): void {
  const key = `${family}|normal|normal`
  for (const style of target.head.querySelectorAll<HTMLStyleElement>('style[data-easyink-font]')) {
    if (style.dataset.easyinkFont === key)
      style.remove()
  }
}
