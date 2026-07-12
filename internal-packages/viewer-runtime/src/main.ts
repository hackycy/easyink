import type { DocumentSchemaInput, ViewerDiagnosticEvent } from '@easyink/viewer'
import { compileBuiltinMaterialProfile } from '@easyink/builtin'
import { createViewer } from '@easyink/viewer'
import './style.css'

interface RuntimePayload {
  runtimeVersion?: string
  schema?: unknown
  data?: unknown
}

declare global {
  interface Window {
    easyinkReady?: boolean
    easyinkRenderedPages?: Array<{ index?: number, width: number, height: number, unit: string }>
    __easyinkGetPages?: () => Array<{ index?: number, width: number, height: number, unit: string }>
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

    const schema = isRecord(payload.schema) ? payload.schema as DocumentSchemaInput : {}
    const viewer = createViewer({ container: root, profile: compileBuiltinMaterialProfile('all') })
    await viewer.open({
      schema,
      data: isRecord(payload.data) ? payload.data : {},
      onDiagnostic: reportDiagnostic,
    })

    window.easyinkRenderedPages = viewer.renderedPages
    window.__easyinkGetPages = () => viewer.renderedPages
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
