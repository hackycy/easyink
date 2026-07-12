import type { CompiledMaterialProfile, FontLoadRequest, FontLoadStatus, FontProvider } from '@easyink/core'
import type { DocumentSchema } from '@easyink/schema'
import type { DiagnosticsChannel } from './diagnostics'
import { collectFontFamilies, FontManager } from '@easyink/core'
import { markRaw } from 'vue'

export interface EnsureFontLoadedOptions {
  preloadGeneration?: number
  reportDiagnostic?: boolean
}

export class FontService {
  readonly manager = markRaw(new FontManager())
  revision = 0
  private target?: Document | ShadowRoot
  private preloadGeneration = 0
  private diagnosticKeys = markRaw(new Set<string>())

  constructor(
    private readonly diagnostics: DiagnosticsChannel,
    private readonly materialProfile: CompiledMaterialProfile,
  ) {}

  setProvider(provider?: FontProvider): void {
    this.manager.setProvider(provider)
    this.diagnosticKeys.clear()
    this.bumpRevision()
  }

  setTarget(target?: Document | ShadowRoot): void {
    this.target = target
  }

  getStatus(family: string): FontLoadStatus {
    if (!family)
      return 'loaded'
    return this.manager.getLoadState(family).status
  }

  getStatuses(families: string[]): Record<string, FontLoadStatus> {
    const statuses: Record<string, FontLoadStatus> = {}
    for (const family of families) {
      statuses[family] = this.getStatus(family)
    }
    return statuses
  }

  async ensureLoaded(request: FontLoadRequest, options: EnsureFontLoadedOptions = {}): Promise<boolean> {
    if (!request.family)
      return true

    const shouldReportDiagnostic = options.reportDiagnostic ?? true
    try {
      await this.manager.ensureFontLoaded(request, this.target)
      if (this.isStalePreload(options.preloadGeneration))
        return false
      this.diagnosticKeys.delete(fontDiagnosticKey(request))
      this.bumpRevision()
      return true
    }
    catch (err) {
      if (this.isStalePreload(options.preloadGeneration))
        return false
      this.bumpRevision()
      const diagnosticKey = fontDiagnosticKey(request)
      if (shouldReportDiagnostic && !this.diagnosticKeys.has(diagnosticKey)) {
        this.diagnosticKeys.add(diagnosticKey)
        this.diagnostics.push({
          source: 'font',
          severity: 'warn',
          message: `Font load failed: ${request.family}`,
          detail: {
            family: request.family,
            message: err instanceof Error ? err.message : String(err),
          },
        })
      }
      return false
    }
  }

  async preloadDocumentFonts(schema: DocumentSchema): Promise<void> {
    const generation = ++this.preloadGeneration
    if (!this.target || !this.manager.provider)
      return
    const families = collectFontFamilies(schema, this.materialProfile)
    if (families.size === 0)
      return
    await Promise.all([...families].map(family =>
      this.ensureLoaded({ family }, { preloadGeneration: generation, reportDiagnostic: true }),
    ))
  }

  clear(): void {
    this.manager.clear()
    this.target = undefined
    this.preloadGeneration += 1
    this.diagnosticKeys.clear()
    this.bumpRevision()
  }

  private isStalePreload(generation?: number): boolean {
    return generation !== undefined && generation !== this.preloadGeneration
  }

  private bumpRevision(): void {
    this.revision++
  }
}

function fontDiagnosticKey(request: FontLoadRequest): string {
  return `${request.family}|${request.weight || 'normal'}|${request.style || 'normal'}`
}
