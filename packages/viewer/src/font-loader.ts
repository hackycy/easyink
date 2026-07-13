import type { FontManager } from '@easyink/core'
import type { ResourcePreparationTerminal } from './resource-readiness'
import type { ViewerDiagnosticEvent } from './types'
import { safeSummarizeThrown } from './safe-thrown'

export { collectFontFamilies } from '@easyink/core'

export function createFontPreparationAdapter(
  fontManager: FontManager,
  target: Document | ShadowRoot,
): (value: string, signal: AbortSignal) => Promise<ResourcePreparationTerminal> {
  return async (value, signal) => {
    throwIfAborted(signal)
    try {
      await fontManager.ensureFontLoaded({ family: value }, target)
      throwIfAborted(signal)
      return Object.freeze({ state: 'ready' })
    }
    catch (cause) {
      throwIfAborted(signal)
      const state = fontManager.getLoadState(value)
      return Object.freeze({
        state: 'failed',
        message: state.message ?? safeSummarizeThrown(cause).message,
      })
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

  const familyList = [...families]
  const settled = await Promise.allSettled(
    familyList.map(family => fontManager.ensureFontLoaded({ family }, target)),
  )

  settled.forEach((entry, index) => {
    if (entry.status === 'fulfilled')
      return
    const family = familyList[index]!
    const state = fontManager.getLoadState(family)
    const thrown = safeSummarizeThrown(entry.reason)
    diagnostics.push({
      category: 'viewer',
      severity: 'warning',
      code: 'FONT_LOAD_FAILED',
      message: `Failed to load font "${family}": ${state.message ?? thrown.message}`,
      scope: 'font',
      cause: state.cause === undefined ? thrown.cause : safeSummarizeThrown(state.cause).cause,
    })
  })

  return diagnostics
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError')
}
