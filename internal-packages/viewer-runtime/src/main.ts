import type { DocumentSchema, DocumentSchemaInput, ViewerDiagnosticEvent } from '@easyink/viewer'
import { registerBuiltinViewerMaterials } from '@easyink/builtin/all'
import { createViewer, normalizeDocumentSchema } from '@easyink/viewer'
import './style.css'

interface RuntimePayload {
  runtimeVersion?: string
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
    registerBuiltinViewerMaterials((type, binding, extension) => {
      viewer.registerMaterial(type, binding, extension)
    })
    await viewer.open({
      schema,
      data: isRecord(payload.data) ? payload.data : {},
      onDiagnostic: reportDiagnostic,
    })

    applyRenderedPageCSS(viewer.renderedPages)
    root.classList.add('easyink-ready')
    root.setAttribute('data-easyink-runtime', payload.runtimeVersion || 'embedded')
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

function applyRenderedPageCSS(pages: Array<{ width: number, height: number, unit: string }>): void {
  const firstPage = pages[0]
  if (!firstPage)
    return

  const style = document.querySelector<HTMLStyleElement>('style[data-easyink-runtime="page-css"]')
  if (!style)
    return

  const unit = normalizeCSSUnit(firstPage.unit)
  const width = formatCSSNumber(firstPage.width)
  const height = formatCSSNumber(firstPage.height)
  style.textContent = `@page { size: ${width}${unit} ${height}${unit}; margin: 0; }
html, body { width: ${width}${unit}; min-height: ${height}${unit}; }`
}

function normalizeCSSUnit(unit: string): string {
  return ['mm', 'cm', 'in', 'pt', 'px'].includes(unit) ? unit : 'mm'
}

function formatCSSNumber(value: number): string {
  return Number.isFinite(value) ? value.toFixed(3).replace(/\.?0+$/, '') : '0'
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
