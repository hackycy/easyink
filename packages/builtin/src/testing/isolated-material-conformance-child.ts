import type { BrowserDomCapabilities } from '@easyink/browser-dom'
import type { MaterialConformanceReport, MaterialManifest, MaterialPackageRegistration } from '@easyink/core'
import process from 'node:process'
import { createBrowserDomCapabilities, renderViewerTree } from '@easyink/browser-dom'
import { runMaterialConformance } from '@easyink/core'
import { Window } from 'happy-dom'
// @ts-expect-error Node's native TypeScript loader requires the explicit extension.
import { boundAndFreezeMaterialConformanceReports, createAuthenticatedResultMessage, createHandshakeMessage, createIsolatedConformanceSession } from './isolated-material-conformance-protocol.ts'

interface RunMessage {
  kind: 'run'
  source: {
    moduleSpecifier: string
    exportName: string
    materialType?: string
    arguments?: readonly string[]
  }
}

const capturedGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
const capturedArrayIsArray = Array.isArray
const capturedReflectApply = Reflect.apply
const capturedSend = process.send?.bind(process)
const capturedStringSlice = String.prototype.slice

sanitizeProcessEnvironment()

process.once('message', (message: unknown) => {
  void run(message)
})

function sanitizeProcessEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('NODE_') || key.startsWith('TSX_') || key === 'LD_PRELOAD' || key.startsWith('DYLD_'))
      delete process.env[key]
  }
}

async function run(message: unknown): Promise<void> {
  if (!isRunMessage(message))
    return
  const session = createIsolatedConformanceSession()
  capturedSend?.(createHandshakeMessage(session))
  if (message.source.arguments)
    process.argv = [process.argv[0]!, process.argv[1]!, ...message.source.arguments]
  let reports: readonly MaterialConformanceReport[]
  try {
    const imported = await import(message.source.moduleSpecifier) as Record<string, unknown>
    const manifests = selectManifests(imported[message.source.exportName], message.source.materialType)
    const collected: MaterialConformanceReport[] = []
    for (let index = 0; index < manifests.length; index++)
      collected[collected.length] = await runOne(manifests[index]!)
    reports = collected
  }
  catch (error) {
    reports = [{
      materialType: message.source.materialType ?? '',
      valid: false,
      issues: [{
        code: 'CONFORMANCE_ISOLATED_EXECUTION_CHILD_FAILED',
        path: '',
        message: stableError(error),
      }],
    }]
  }
  let resultMessage: unknown
  try {
    resultMessage = createAuthenticatedResultMessage(session, boundAndFreezeMaterialConformanceReports(reports))
  }
  catch {
    resultMessage = createAuthenticatedResultMessage(session, [{
      materialType: message.source.materialType ?? '',
      valid: false,
      issues: [{
        code: 'CONFORMANCE_ISOLATED_EXECUTION_REPORT_BUDGET_EXCEEDED',
        path: '',
        message: 'isolated conformance report exceeded protocol budget',
      }],
    }])
  }
  capturedSend?.(resultMessage)
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
      : isManifestArray(value)
        ? value
        : undefined
  if (!manifests)
    throw new Error('CONFORMANCE_ISOLATED_EXECUTION_EXPORT_INVALID')
  const selected: MaterialManifest[] = []
  for (let index = 0; index < manifests.length; index++) {
    const manifest = manifests[index]!
    if (materialType === undefined || manifest.type === materialType)
      selected[selected.length] = manifest
  }
  if (selected.length === 0)
    throw new Error('CONFORMANCE_ISOLATED_EXECUTION_MATERIAL_NOT_FOUND')
  return selected
}

function isPackage(value: unknown): value is MaterialPackageRegistration {
  return isRecord(value) && isManifestArray(value.manifests)
}

function isManifestArray(value: unknown): value is MaterialManifest[] {
  if (!capturedArrayIsArray(value))
    return false
  for (let index = 0; index < value.length; index++) {
    if (!isManifest(value[index]))
      return false
  }
  return true
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
    && (value.source.arguments === undefined
      || (Array.isArray(value.source.arguments) && value.source.arguments.every(argument => typeof argument === 'string' && argument.length <= 4_096)))
}

function stableError(error: unknown): string {
  if (typeof error !== 'object' || error === null)
    return 'Unknown child error'
  const descriptor = capturedGetOwnPropertyDescriptor(error, 'message')
  return descriptor && 'value' in descriptor && typeof descriptor.value === 'string'
    ? capturedReflectApply(capturedStringSlice, descriptor.value, [0, 1024])
    : 'Unknown child error'
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null
}
