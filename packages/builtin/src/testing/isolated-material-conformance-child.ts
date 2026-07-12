import type { BrowserDomCapabilities } from '@easyink/browser-dom'
import type { MaterialConformanceReport, MaterialManifest, MaterialPackageRegistration } from '@easyink/core'
import process from 'node:process'
import { createBrowserDomCapabilities, renderViewerTree } from '@easyink/browser-dom'
import { runMaterialConformance } from '@easyink/core'
import { Window } from 'happy-dom'

interface RunMessage {
  kind: 'run'
  source: {
    moduleSpecifier: string
    exportName: string
    materialType?: string
  }
}

process.once('message', (message: unknown) => {
  void run(message)
})

async function run(message: unknown): Promise<void> {
  try {
    if (!isRunMessage(message))
      throw new Error('CONFORMANCE_ISOLATED_EXECUTION_INVALID_REQUEST')
    const imported = await import(message.source.moduleSpecifier) as Record<string, unknown>
    const manifests = selectManifests(imported[message.source.exportName], message.source.materialType)
    const reports: MaterialConformanceReport[] = []
    for (const manifest of manifests)
      reports.push(await runOne(manifest))
    process.send?.({ kind: 'result', reports })
  }
  catch (error) {
    const materialType = isRunMessage(message) ? message.source.materialType ?? '' : ''
    process.send?.({
      kind: 'result',
      reports: [{
        materialType,
        valid: false,
        issues: [{
          code: 'CONFORMANCE_ISOLATED_EXECUTION_CHILD_FAILED',
          path: '',
          message: stableError(error),
        }],
      }],
    })
  }
}

async function runOne(manifest: MaterialManifest): Promise<MaterialConformanceReport> {
  const window = new Window({ url: 'https://easyink.invalid/conformance' })
  let capabilities: BrowserDomCapabilities | undefined
  try {
    return await runMaterialConformance(manifest, {
      executionMode: 'trusted-in-process',
      createRenderCapabilities: (facet) => {
        capabilities = createBrowserDomCapabilities({
          document: window.document as unknown as Document,
          imperativeDom: facet.capabilities.imperativeDom ?? [],
        })
        return capabilities
      },
      mountViewerTree: (tree) => {
        if (!capabilities)
          throw new Error('CONFORMANCE_RENDER_CAPABILITIES_MISSING')
        const host = window.document.createElement('div')
        return renderViewerTree(host as unknown as HTMLElement, tree, { capabilities, maxNodes: 50_000 })
      },
    })
  }
  finally {
    await window.happyDOM.close()
  }
}

function selectManifests(value: unknown, materialType?: string): readonly MaterialManifest[] {
  const manifests = isPackage(value)
    ? value.manifests
    : isManifest(value)
      ? [value]
      : Array.isArray(value) && value.every(isManifest)
        ? value
        : undefined
  if (!manifests)
    throw new Error('CONFORMANCE_ISOLATED_EXECUTION_EXPORT_INVALID')
  const selected = materialType === undefined ? manifests : manifests.filter(manifest => manifest.type === materialType)
  if (selected.length === 0)
    throw new Error('CONFORMANCE_ISOLATED_EXECUTION_MATERIAL_NOT_FOUND')
  return selected
}

function isPackage(value: unknown): value is MaterialPackageRegistration {
  return isRecord(value) && Array.isArray(value.manifests) && value.manifests.every(isManifest)
}

function isManifest(value: unknown): value is MaterialManifest {
  return isRecord(value) && typeof value.type === 'string' && isRecord(value.facets) && isRecord(value.schemaAdapter)
}

function isRunMessage(value: unknown): value is RunMessage {
  return isRecord(value)
    && value.kind === 'run'
    && isRecord(value.source)
    && typeof value.source.moduleSpecifier === 'string'
    && typeof value.source.exportName === 'string'
    && (value.source.materialType === undefined || typeof value.source.materialType === 'string')
}

function stableError(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, 1024) : 'Unknown child error'
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null
}
