<script setup lang="ts">
import type { ExportFormatPlugin, ExportProgress } from '@easyink/export-runtime'
import type { DocumentSchema, ViewerDiagnosticEvent, ViewerExportContext, ViewerHost, ViewerRuntime, ViewerTaskPhaseEvent, ViewerTaskProgressEvent } from '@easyink/viewer'
import { registerBuiltinViewerMaterials } from '@easyink/builtin/all'
import { createDomImageExportPlugin } from '@easyink/export-plugin-dom-image'
import { createDomPdfExportPlugin } from '@easyink/export-plugin-dom-pdf'
import { createExportRuntime } from '@easyink/export-runtime'
import { IconChevronLeft, IconChevronRight, IconClose, IconDown, IconMinimize, IconPlus } from '@easyink/icons'
import { exportDiagnosticToViewerEvent, resolvePrintSize, resolveViewerPdfPages, toMillimeters } from '@easyink/print-core'
import { createCustomViewerHost, createIframeViewerHost, createViewer, resolvePrintPolicy } from '@easyink/viewer'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import EasyInkPrinterSettingsDialog from './components/EasyInkPrinterSettingsDialog.vue'
import HiPrintSettingsDialog from './components/HiPrintSettingsDialog.vue'
import LodopSettingsDialog from './components/LodopSettingsDialog.vue'
import RenderApiSettingsDialog from './components/RenderApiSettingsDialog.vue'
import { Button } from './components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
import { playgroundFontProvider } from './fonts'
import { useEasyInkPrint } from './hooks/useEasyInkPrint'
import { usePrinter } from './hooks/useHiPrint'
import { useLodopPrint } from './hooks/useLodopPrint'
import { useRenderApiService } from './hooks/useRenderApiService'

const props = defineProps<{
  schema: DocumentSchema
  data: Record<string, unknown>
}>()

const emit = defineEmits<{
  close: []
}>()

const EXPORT_FORMAT = 'playground-demo-json'
const PDF_FORMAT = 'pdf'
const PNG_FORMAT = 'png'
const JPEG_FORMAT = 'jpeg'
const BROWSER_PRINT_DRIVER_ID = 'browser'

const iframeRef = ref<HTMLIFrameElement>()
let viewerHost: ViewerHost | undefined
let viewerViewport: HTMLElement | undefined
let viewer: ViewerRuntime | undefined
const exportRuntime = createExportRuntime({ entry: 'preview' })

const zoom = ref(100)
const currentPage = ref(1)
const totalPages = ref(1)

// Print channel integration
const hiPrint = usePrinter()
const lodopPrint = useLodopPrint()
const easyInkPrint = useEasyInkPrint()
const renderApi = useRenderApiService()
const showHiPrintSettings = ref(false)
const showLodopSettings = ref(false)
const showEasyInkPrinterSettings = ref(false)
const showRenderApiSettings = ref(false)
const isPrinting = ref(false)

// Auto-connect is handled inside each persisted singleton hook.

onMounted(async () => {
  if (!iframeRef.value)
    return

  await waitForIframeDocument(iframeRef.value)
  const iframeHost = createIframeViewerHost(iframeRef.value)
  const viewerMount = setupIframeSurface(iframeHost)
  viewerViewport = iframeHost.mount
  viewerHost = createCustomViewerHost({
    document: iframeHost.document,
    window: iframeHost.window,
    mount: viewerMount,
    print: iframeHost.print,
  })

  viewer = createViewer({ host: viewerHost, fontProvider: playgroundFontProvider })
  registerBuiltinViewerMaterials((type, binding, extension) => {
    viewer?.registerMaterial(type, binding, extension)
  })
  registerOutputIntegrations(viewer)
  await viewer.open({
    schema: props.schema,
    data: props.data,
  })

  updatePageCount()
  document.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
  viewerViewport?.removeEventListener('wheel', handleWheel)
  viewerViewport?.removeEventListener('scroll', handleScroll)
  viewer?.destroy()
  viewer = undefined
  viewerHost = undefined
  viewerViewport = undefined
})

function registerOutputIntegrations(runtime: ViewerRuntime) {
  exportRuntime.registerPlugin(createDomPdfExportPlugin())
  exportRuntime.registerPlugin(createDomImageExportPlugin({ id: 'playground-dom-png-export', format: PNG_FORMAT, type: 'image/png' }))
  exportRuntime.registerPlugin(createDomImageExportPlugin({ id: 'playground-dom-jpeg-export', format: JPEG_FORMAT, type: 'image/jpeg' }))
  exportRuntime.registerPlugin(createPlaygroundJsonExportPlugin())

  runtime.registerExporter({
    id: 'playground-pdf-export',
    format: PDF_FORMAT,
    async export(context) {
      const { pages, pageSizes, widthMm, heightMm } = resolvePreviewExportInput(context)

      return exportRuntime.exportDocument({
        format: PDF_FORMAT,
        entry: context.entry,
        input: { pages, pageSizes, widthMm, heightMm },
        throwOnError: true,
        onProgress: context.onProgress,
        onDiagnostic: diagnostic => context.onDiagnostic?.(exportDiagnosticToViewerEvent(diagnostic)),
      })
    },
  })

  runtime.registerExporter({
    id: 'playground-png-export',
    format: PNG_FORMAT,
    async export(context) {
      const input = resolvePreviewExportInput(context)

      return exportRuntime.exportDocument({
        format: PNG_FORMAT,
        entry: context.entry,
        input: {
          ...input,
          pageIndex: resolveCurrentPageIndex(input.pages.length),
        },
        throwOnError: true,
        onProgress: context.onProgress,
        onDiagnostic: diagnostic => context.onDiagnostic?.(exportDiagnosticToViewerEvent(diagnostic)),
      })
    },
  })

  runtime.registerExporter({
    id: 'playground-jpeg-export',
    format: JPEG_FORMAT,
    async export(context) {
      const input = resolvePreviewExportInput(context)

      return exportRuntime.exportDocument({
        format: JPEG_FORMAT,
        entry: context.entry,
        input: {
          ...input,
          pageIndex: resolveCurrentPageIndex(input.pages.length),
        },
        throwOnError: true,
        onProgress: context.onProgress,
        onDiagnostic: diagnostic => context.onDiagnostic?.(exportDiagnosticToViewerEvent(diagnostic)),
      })
    },
  })

  runtime.registerExporter({
    id: 'playground-json-export',
    format: EXPORT_FORMAT,
    async export(context) {
      return exportRuntime.exportDocument({
        format: EXPORT_FORMAT,
        entry: context.entry,
        input: { schema: context.schema, data: context.data ?? {} },
        throwOnError: true,
        onProgress: context.onProgress,
        onDiagnostic: diagnostic => context.onDiagnostic?.(exportDiagnosticToViewerEvent(diagnostic)),
      })
    },
  })
}

function createPlaygroundJsonExportPlugin(): ExportFormatPlugin<{ schema: DocumentSchema, data: Record<string, unknown> }, Blob> {
  return {
    id: 'playground-json-export-runtime',
    format: EXPORT_FORMAT,
    async export(context) {
      return new Blob(
        [JSON.stringify(context.input, null, 2)],
        { type: 'application/json' },
      )
    },
  }
}

function resolvePreviewExportInput(context: ViewerExportContext): {
  pages: HTMLElement[]
  pageSizes: Array<{ widthMm: number, heightMm: number }>
  widthMm: number
  heightMm: number
} {
  const renderedPages = context.renderedPages ?? []
  const pdfPages = resolveViewerPdfPages({ ...context, renderedPages, printPolicy: resolvePrintPolicy({
    schema: context.schema,
    options: { pageSizeMode: 'fixed' },
    renderedPages,
  }) })
  const pages = pdfPages.map(page => page.element)
  const pageSizes = pdfPages.map(({ widthMm, heightMm }) => ({ widthMm, heightMm }))
  const printSize = resolveFixedExportSize(context.schema, renderedPages)
  const widthMm = toMillimeters(printSize.width, printSize.unit)
  const heightMm = toMillimeters(printSize.height, printSize.unit)

  return { pages, pageSizes, widthMm, heightMm }
}

function resolveCurrentPageIndex(pageCount: number): number {
  return Math.max(0, Math.min(currentPage.value - 1, pageCount - 1))
}

function resolveFixedExportSize(schema: DocumentSchema, renderedPages: NonNullable<ViewerRuntime['renderedPages']>): { width: number, height: number, unit: string } {
  const printPolicy = resolvePrintPolicy({
    schema,
    options: { pageSizeMode: 'fixed' },
    renderedPages,
  })
  return resolvePrintSize(printPolicy.sheetSize, renderedPages[0])
}

function waitForIframeDocument(iframe: HTMLIFrameElement): Promise<void> {
  if (iframe.contentDocument)
    return Promise.resolve()

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      iframe.removeEventListener('load', handleLoad)
      reject(new Error('Viewer iframe document is not available'))
    }, 3000)

    function handleLoad() {
      window.clearTimeout(timeout)
      iframe.removeEventListener('load', handleLoad)
      resolve()
    }

    iframe.addEventListener('load', handleLoad, { once: true })
  })
}

function setupIframeSurface(host: ViewerHost): HTMLElement {
  host.document.documentElement.style.height = '100%'
  host.document.body.style.height = '100%'
  host.document.body.style.margin = '0'
  host.document.body.style.background = '#525659'
  host.document.body.style.overflow = 'hidden'
  host.mount.style.width = '100%'
  host.mount.style.height = '100%'
  host.mount.style.minHeight = '100%'
  host.mount.style.overflow = 'auto'
  host.mount.style.boxSizing = 'border-box'
  host.mount.style.padding = '32px 48px 48px'
  host.mount.style.background = '#525659'
  host.mount.addEventListener('wheel', handleWheel, { passive: false })
  host.mount.addEventListener('scroll', handleScroll)

  const content = host.document.createElement('div')
  content.style.width = '100%'
  content.style.minHeight = '100%'
  content.style.boxSizing = 'border-box'
  content.style.background = '#525659'
  host.mount.replaceChildren(content)

  return content
}

function getViewerSurface(): HTMLElement | undefined {
  return viewerHost?.mount
}

function getViewerViewport(): HTMLElement | undefined {
  return viewerViewport
}

function updatePageCount() {
  const surface = getViewerSurface()
  if (!surface)
    return
  const pages = surface.querySelectorAll('.ei-viewer-page')
  totalPages.value = Math.max(1, pages.length)
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    emit('close')
  }
}

function handleWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -10 : 10
    setZoom(zoom.value + delta)
  }
}

function setZoom(value: number) {
  zoom.value = Math.max(25, Math.min(400, value))
  applyZoom()
}

function applyZoom() {
  const surface = getViewerSurface()
  if (!surface)
    return
  const pages = surface.querySelectorAll<HTMLElement>('.ei-viewer-page')
  for (const page of pages) {
    page.style.transform = `scale(${zoom.value / 100})`
    page.style.transformOrigin = 'top center'
  }
}

function zoomIn() {
  setZoom(zoom.value + 25)
}

function zoomOut() {
  setZoom(zoom.value - 25)
}

function zoomFit() {
  const viewport = getViewerViewport()
  const surface = getViewerSurface()
  if (!viewport || !surface)
    return
  const firstPage = surface.querySelector<HTMLElement>('.ei-viewer-page')
  if (!firstPage)
    return

  const containerWidth = viewport.clientWidth - 96
  const pageWidth = Number.parseFloat(firstPage.style.width) || firstPage.offsetWidth
  if (pageWidth <= 0)
    return

  setZoom(Math.floor((containerWidth / pageWidth) * 100))
}

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
    scrollToPage(currentPage.value)
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
    scrollToPage(currentPage.value)
  }
}

function scrollToPage(pageNum: number) {
  const surface = getViewerSurface()
  if (!surface)
    return
  const pages = surface.querySelectorAll('.ei-viewer-page')
  const target = pages[pageNum - 1]
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleScroll() {
  const viewport = getViewerViewport()
  const surface = getViewerSurface()
  if (!viewport || !surface)
    return
  const pages = surface.querySelectorAll('.ei-viewer-page')
  const containerRect = viewport.getBoundingClientRect()
  const containerCenter = containerRect.top + containerRect.height / 2

  let closest = 1
  let minDist = Infinity
  pages.forEach((page, i) => {
    const rect = page.getBoundingClientRect()
    const center = rect.top + rect.height / 2
    const dist = Math.abs(center - containerCenter)
    if (dist < minDist) {
      minDist = dist
      closest = i + 1
    }
  })
  currentPage.value = closest
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

function showWarningDiagnostic(event: ViewerDiagnosticEvent) {
  if (event.severity === 'warning')
    toast.warning(event.message)
}

function updateProgressToast(progressId: string | number, progress: ExportProgress | ViewerTaskProgressEvent, label: string) {
  if (progress.current !== undefined && progress.total !== undefined)
    toast.loading(`${label} ${progress.current} / ${progress.total}`, { id: progressId })
}

function updatePhaseToast(progressId: string | number, message: string | undefined, fallback: string) {
  toast.loading(message || fallback, { id: progressId })
}

async function runViewerExport(format: string, filename: string, label: string) {
  const progressId = toast.loading(`${label}中...`)
  try {
    const blob = await viewer?.exportDocument({
      format,
      entry: 'preview',
      throwOnError: true,
      onPhase: event => updatePhaseToast(progressId, event.message, `${label}中...`),
      onProgress: progress => updateProgressToast(progressId, progress, label),
      onDiagnostic: showWarningDiagnostic,
    })
    if (!(blob instanceof Blob))
      throw new Error('导出结果为空')

    downloadBlob(blob, filename)
    toast.dismiss(progressId)
    toast.success(`${label}完成`)
  }
  catch (err) {
    toast.dismiss(progressId)
    toast.error(`${label}失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function handlePdfExport() {
  await runViewerExport(PDF_FORMAT, 'easyink-preview.pdf', '导出 PDF')
}

async function handlePngExport() {
  await runViewerExport(PNG_FORMAT, `easyink-preview-page-${currentPage.value}.png`, '导出 PNG')
}

async function handleJpegExport() {
  await runViewerExport(JPEG_FORMAT, `easyink-preview-page-${currentPage.value}.jpg`, '导出 JPEG')
}

async function handleJsonExport() {
  await runViewerExport(EXPORT_FORMAT, 'easyink-export.json', '导出 JSON')
}

function serializePreviewHtml(): string {
  const doc = viewerHost?.document
  if (!doc)
    throw new Error('预览文档尚未就绪')

  const doctype = doc.doctype
    ? `<!DOCTYPE ${doc.doctype.name}${doc.doctype.publicId ? ` PUBLIC "${doc.doctype.publicId}"` : ''}${doc.doctype.systemId ? ` "${doc.doctype.systemId}"` : ''}>\n`
    : '<!doctype html>\n'
  return `${doctype}${doc.documentElement.outerHTML}`
}

async function ensureRenderApiReady(): Promise<boolean> {
  if (!renderApi.enabled.value) {
    toast.error('请先在设置中启用 Render API')
    showRenderApiSettings.value = true
    return false
  }

  if (!renderApi.isConnected.value) {
    const progressId = toast.loading('正在检查 Render API 服务...')
    try {
      await renderApi.checkHealth()
      toast.dismiss(progressId)
    }
    catch (error) {
      toast.dismiss(progressId)
      toast.error(error instanceof Error ? error.message : '连接 Render API 服务失败')
      showRenderApiSettings.value = true
      return false
    }
  }

  return true
}

async function runRenderApiExport(label: string, submit: () => Promise<{ pdf: Blob, pageCount?: number, diagnosticsPath?: string }>) {
  if (!(await ensureRenderApiReady()))
    return

  isPrinting.value = true
  const progressId = toast.loading(`${label}中...`)
  try {
    const result = await submit()
    downloadBlob(result.pdf, `easyink-${label.includes('HTML') ? 'html' : 'schema'}-render.pdf`)
    toast.dismiss(progressId)
    const suffix = result.diagnosticsPath ? `，诊断：${result.diagnosticsPath}` : ''
    toast.success(`${label}完成${result.pageCount ? `，共 ${result.pageCount} 页` : ''}${suffix}`)
  }
  catch (error) {
    toast.dismiss(progressId)
    toast.error(`${label}失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  finally {
    isPrinting.value = false
  }
}

async function handleRenderApiSchemaExport() {
  await runRenderApiExport('服务端 Schema 渲染', () => renderApi.renderSchema({
    schema: props.schema,
    data: props.data,
  }))
}

async function handleRenderApiHtmlExport() {
  await runRenderApiExport('服务端 HTML 渲染', () => renderApi.renderHtml({
    html: serializePreviewHtml(),
  }))
}

async function handleBrowserPrint(pageSizeMode: 'driver' | 'fixed' = 'driver') {
  await runViewerPrint(BROWSER_PRINT_DRIVER_ID, pageSizeMode, '浏览器打印')
}

async function ensureHiPrintReady(): Promise<boolean> {
  if (!hiPrint.enabled.value) {
    toast.error('请先在设置中启用 HiPrint')
    showHiPrintSettings.value = true
    return false
  }

  if (!hiPrint.isConnected.value) {
    const progressId = toast.loading('正在连接 HiPrint...')
    try {
      await hiPrint.connect()
      toast.dismiss(progressId)
    }
    catch (err) {
      toast.dismiss(progressId)
      toast.error(err instanceof Error ? err.message : '连接 HiPrint 失败')
      showHiPrintSettings.value = true
      return false
    }
  }

  if (!hiPrint.printerDevice.value) {
    toast.error('请先在 HiPrint 设置中选择本机打印机')
    showHiPrintSettings.value = true
    return false
  }

  return true
}

async function ensureLodopReady(): Promise<boolean> {
  if (!lodopPrint.enabled.value) {
    toast.error('请先在设置中启用 LODOP')
    showLodopSettings.value = true
    return false
  }

  if (!lodopPrint.isConnected.value) {
    const progressId = toast.loading('正在检测 LODOP...')
    try {
      await lodopPrint.connect()
      toast.dismiss(progressId)
    }
    catch (err) {
      toast.dismiss(progressId)
      toast.error(err instanceof Error ? err.message : 'LODOP 不可用')
      showLodopSettings.value = true
      return false
    }
  }

  return true
}

async function ensureEasyInkPrintReady(): Promise<boolean> {
  if (!easyInkPrint.enabled.value) {
    toast.error('请先在设置中启用 EasyInk Printer')
    showEasyInkPrinterSettings.value = true
    return false
  }

  if (!easyInkPrint.isConnected.value) {
    const progressId = toast.loading('正在连接 EasyInk Printer 服务...')
    try {
      await easyInkPrint.connect()
      toast.dismiss(progressId)
    }
    catch (err) {
      toast.dismiss(progressId)
      toast.error(err instanceof Error ? err.message : '连接 EasyInk Printer 服务失败')
      showEasyInkPrinterSettings.value = true
      return false
    }
  }

  if (!easyInkPrint.printerName.value) {
    toast.error('请先在 EasyInk Printer 设置中选择目标打印机')
    showEasyInkPrinterSettings.value = true
    return false
  }

  return true
}

async function runViewerPrint(driverId: string, pageSizeMode: 'driver' | 'fixed', label: string) {
  isPrinting.value = true
  const progressId = toast.loading(`${label}中...`)
  try {
    await viewer?.print({
      driverId,
      pageSizeMode,
      throwOnError: true,
      onPhase: event => updatePhaseToast(progressId, event.message, `${label}中...`),
      onProgress: progress => updateProgressToast(progressId, progress, label),
      onDiagnostic: showWarningDiagnostic,
    })
    toast.dismiss(progressId)
    toast.success(label === '浏览器打印' ? '已打开浏览器打印' : '已发送到打印机')
  }
  catch (err) {
    toast.dismiss(progressId)
    toast.error(`${label}失败: ${err instanceof Error ? err.message : String(err)}`)
  }
  finally {
    isPrinting.value = false
  }
}

async function handleHiPrintPrint() {
  if (await ensureHiPrintReady()) {
    await runManagedPrint('HiPrint 打印', callbacks => hiPrint.print({
      schema: props.schema,
      data: props.data,
      pageSizeMode: 'driver',
      ...callbacks,
    }))
  }
}

async function handleLodopPrint() {
  if (await ensureLodopReady()) {
    await runManagedPrint('LODOP 打印', callbacks => lodopPrint.print({
      schema: props.schema,
      data: props.data,
      pageSizeMode: 'driver',
      ...callbacks,
    }))
  }
}

async function handleEasyInkPrintPrint() {
  if (await ensureEasyInkPrintReady()) {
    await runManagedPrint('EasyInk Printer 打印', callbacks => easyInkPrint.print({
      schema: props.schema,
      data: props.data,
      ...callbacks,
    }))
  }
}

async function handleEasyInkPrintRenderSourcePrint() {
  if (await ensureEasyInkPrintReady()) {
    await runManagedPrint('EasyInk Printer Schema 打印', callbacks => easyInkPrint.print({
      schema: props.schema,
      data: props.data,
      strategy: 'printer-template',
      ...callbacks,
    }))
  }
}

async function handleEasyInkPrintHtmlPrint() {
  if (await ensureEasyInkPrintReady()) {
    await runManagedPrint('EasyInk Printer HTML 打印', callbacks => easyInkPrint.print({
      schema: props.schema,
      data: props.data,
      strategy: 'preview-html',
      paper: 'template',
      ...callbacks,
    }))
  }
}

async function runManagedPrint(
  label: string,
  submit: (callbacks: {
    throwOnError: true
    onPhase: (event: ViewerTaskPhaseEvent) => void
    onProgress: (progress: ViewerTaskProgressEvent) => void
    onDiagnostic: (event: ViewerDiagnosticEvent) => void
  }) => Promise<void>,
) {
  isPrinting.value = true
  const progressId = toast.loading(`${label}中...`)
  try {
    await submit({
      throwOnError: true,
      onPhase: event => updatePhaseToast(progressId, event.message, `${label}中...`),
      onProgress: progress => updateProgressToast(progressId, progress, label),
      onDiagnostic: showWarningDiagnostic,
    })
    toast.dismiss(progressId)
    toast.success('已发送到打印机')
  }
  catch (err) {
    toast.dismiss(progressId)
    toast.error(`${label}失败: ${err instanceof Error ? err.message : String(err)}`)
  }
  finally {
    isPrinting.value = false
  }
}

function openHiPrintSettings() {
  showHiPrintSettings.value = true
}

function openLodopSettings() {
  showLodopSettings.value = true
}

function openEasyInkPrinterSettings() {
  showEasyInkPrinterSettings.value = true
}

function openRenderApiSettings() {
  showRenderApiSettings.value = true
}

async function handleExport() {
  await handleJsonExport()
}
</script>

<template>
  <div class="fixed inset-0 z-[9999] flex flex-col bg-black/60">
    <div class="flex items-center justify-between px-4 py-1.5 bg-background border-b border-border gap-2">
      <div class="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" :disabled="currentPage <= 1" @click="prevPage">
          <IconChevronLeft :size="16" />
        </Button>
        <span class="text-xs text-muted-foreground min-w-[48px] text-center select-none">{{ currentPage }} / {{ totalPages }}</span>
        <Button variant="outline" size="icon-sm" :disabled="currentPage >= totalPages" @click="nextPage">
          <IconChevronRight :size="16" />
        </Button>

        <span class="w-px h-[18px] bg-border mx-1" />

        <Button variant="outline" size="icon-sm" @click="zoomOut">
          <IconMinimize :size="16" />
        </Button>
        <span class="text-xs text-muted-foreground min-w-[48px] text-center select-none">{{ zoom }}%</span>
        <Button variant="outline" size="icon-sm" @click="zoomIn">
          <IconPlus :size="16" />
        </Button>
        <Button variant="outline" size="sm" @click="zoomFit">
          适应宽度
        </Button>
      </div>

      <div class="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="outline" size="sm" class="gap-1">
              导出
              <IconDown :size="14" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="z-[10002]">
            <DropdownMenuLabel>本地导出</DropdownMenuLabel>
            <DropdownMenuItem :disabled="isPrinting" @click="handlePdfExport">
              PDF
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handlePngExport">
              PNG（当前页）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handleJpegExport">
              JPEG（当前页）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handleExport">
              JSON
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>服务端渲染</DropdownMenuLabel>
            <DropdownMenuItem :disabled="isPrinting" @click="handleRenderApiSchemaExport">
              Render API：Schema + Data
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handleRenderApiHtmlExport">
              Render API：HTML
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>设置</DropdownMenuLabel>
            <DropdownMenuItem @click="openRenderApiSettings">
              Render API 服务设置
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="sm" class="gap-1">
              打印
              <IconDown :size="14" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="z-[10002] min-w-[220px]">
            <DropdownMenuLabel>常用打印</DropdownMenuLabel>
            <DropdownMenuItem :disabled="isPrinting" @click="handleBrowserPrint('driver')">
              浏览器打印（按打印机介质）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handleHiPrintPrint">
              HiPrint 打印
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @select="handleLodopPrint">
              LODOP 打印
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                EasyInk Printer
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent class="z-[10003] min-w-[220px]">
                <DropdownMenuLabel>提交方式</DropdownMenuLabel>
                <DropdownMenuItem :disabled="isPrinting" @click="handleEasyInkPrintPrint">
                  PDF
                </DropdownMenuItem>
                <DropdownMenuItem :disabled="isPrinting" @click="handleEasyInkPrintRenderSourcePrint">
                  Schema + Data
                </DropdownMenuItem>
                <DropdownMenuItem :disabled="isPrinting" @click="handleEasyInkPrintHtmlPrint">
                  HTML
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>设置</DropdownMenuLabel>
            <DropdownMenuItem @click="openHiPrintSettings">
              HiPrint 客户端设置
            </DropdownMenuItem>
            <DropdownMenuItem @select="openLodopSettings">
              LODOP 设置
            </DropdownMenuItem>
            <DropdownMenuItem @click="openEasyInkPrinterSettings">
              EasyInk Printer 服务设置
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="icon-sm" @click="emit('close')">
          <IconClose :size="16" />
        </Button>
      </div>
    </div>

    <iframe
      ref="iframeRef"
      title="EasyInk Viewer"
      class="flex-1 w-full border-0 bg-[#525659]"
    />
  </div>

  <HiPrintSettingsDialog
    v-if="showHiPrintSettings"
    @close="showHiPrintSettings = false"
  />

  <LodopSettingsDialog
    v-if="showLodopSettings"
    @close="showLodopSettings = false"
  />

  <EasyInkPrinterSettingsDialog
    v-if="showEasyInkPrinterSettings"
    @close="showEasyInkPrinterSettings = false"
  />

  <RenderApiSettingsDialog
    v-if="showRenderApiSettings"
    @close="showRenderApiSettings = false"
  />
</template>
