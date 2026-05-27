import type { DocumentSchema, DocumentSchemaInput, ViewerDiagnosticEvent } from '@easyink/viewer'
import { createViewer, normalizeDocumentSchema } from '@easyink/viewer'
import './style.css'

interface RuntimePayload {
  runtimeVersion?: string
  materials?: {
    materials?: Array<{ type?: string }>
  }
  schema?: unknown
  data?: unknown
}

declare global {
  interface Window {
    easyinkReady?: boolean
  }
}

void boot()

async function boot(): Promise<void> {
  try {
    window.easyinkReady = false
    const payload = readPayload()
    const root = document.getElementById('easyink-root')
    if (!root)
      throw new Error('easyink root is missing')

    const schema = normalizeRuntimeSchema(payload.schema)
    const viewer = createViewer({ container: root })
    await viewer.open({
      schema,
      data: isRecord(payload.data) ? payload.data : {},
      onDiagnostic: reportDiagnostic,
    })

    root.classList.add('easyink-ready')
    root.setAttribute('data-easyink-runtime', payload.runtimeVersion || 'embedded')
    root.setAttribute('data-easyink-materials', materialTypes(payload).join(','))
    window.easyinkReady = true
    document.dispatchEvent(new CustomEvent('easyink:ready'))
  }
  catch (error) {
    window.easyinkReady = false
    document.documentElement.setAttribute('data-easyink-runtime-error', errorMessage(error))
    console.error('[easyink-render-runtime]', error)
    throw error
  }
}

function readPayload(): RuntimePayload {
  const node = document.getElementById('easyink-payload')
  if (!node)
    throw new Error('easyink payload is missing')
  return JSON.parse(node.textContent || '{}') as RuntimePayload
}

function normalizeRuntimeSchema(input: unknown): DocumentSchema {
  if (!isRecord(input))
    return normalizeDocumentSchema({})

  const page = isRecord(input.page) ? input.page : {}
  const unit = typeof input.unit === 'string'
    ? input.unit
    : typeof page.unit === 'string'
      ? page.unit
      : 'mm'
  const mode = typeof page.mode === 'string' ? page.mode : 'fixed'
  const guides = isRecord(input.guides) ? input.guides : { x: [], y: [] }

  return normalizeDocumentSchema({
    ...input,
    unit,
    page: {
      ...page,
      mode,
    },
    guides,
    elements: Array.isArray(input.elements) ? input.elements : [],
  } as DocumentSchemaInput)
}

function materialTypes(payload: RuntimePayload): string[] {
  if (!Array.isArray(payload.materials?.materials))
    return []
  return payload.materials.materials
    .map(item => item.type)
    .filter((type): type is string => typeof type === 'string' && type.length > 0)
}

function reportDiagnostic(event: ViewerDiagnosticEvent): void {
  if (event.severity === 'error') {
    console.error('[easyink-viewer]', event)
    return
  }
  console.warn('[easyink-viewer]', event)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
