<script setup lang="ts">
import type { ExportFormatPlugin, ExportProgress } from '@easyink/export-runtime'
import type { DocumentSchema, ViewerDiagnosticEvent, ViewerHost, ViewerRuntime, ViewerTaskPhaseEvent, ViewerTaskProgressEvent } from '@easyink/viewer'
import { createDomPdfExportPlugin } from '@easyink/export-plugin-dom-pdf'
import { createExportRuntime } from '@easyink/export-runtime'
import { IconChevronLeft, IconChevronRight, IconClose, IconDown, IconMinimize, IconPlus } from '@easyink/icons'
import { exportDiagnosticToViewerEvent, resolvePrintSize, resolveViewerPdfPages, toMillimeters } from '@easyink/print-core'
import { createCustomViewerHost, createIframeViewerHost, createViewer, resolvePrintPolicy } from '@easyink/viewer'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import EasyInkPrinterSettingsDialog from './components/EasyInkPrinterSettingsDialog.vue'
import HiPrintSettingsDialog from './components/HiPrintSettingsDialog.vue'
import { Button } from './components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
import { playgroundFontProvider } from './fonts'
import { useEasyInkPrint } from './hooks/useEasyInkPrint'
import { usePrinter } from './hooks/useHiPrint'

const props = defineProps<{
  schema: DocumentSchema
  data: Record<string, unknown>
}>()

const emit = defineEmits<{
  close: []
}>()

const EXPORT_FORMAT = 'playground-demo-json'
const PDF_FORMAT = 'pdf'
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
const easyInkPrint = useEasyInkPrint()
const showHiPrintSettings = ref(false)
const showEasyInkPrinterSettings = ref(false)
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
  exportRuntime.registerPlugin(createPlaygroundJsonExportPlugin())

  runtime.registerExporter({
    id: 'playground-pdf-export',
    format: PDF_FORMAT,
    async export(context) {
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

async function handleJsonExport() {
  await runViewerExport(EXPORT_FORMAT, 'easyink-export.json', '导出 JSON')
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

async function handleEasyInkPrintPrint() {
  if (await ensureEasyInkPrintReady()) {
    await runManagedPrint('EasyInk Printer 打印', callbacks => easyInkPrint.print({
      schema: props.schema,
      data: props.data,
      pageSizeMode: 'fixed',
      ...callbacks,
    }))
  }
}

async function handleEasyInkPrintRenderSourcePrint() {
  if (await ensureEasyInkPrintReady()) {
    await runManagedPrint('EasyInk Printer Schema 打印', callbacks => easyInkPrint.printWithRenderSource({
      schema: props.schema,
      data: props.data,
      pageSizeMode: 'fixed',
      ...callbacks,
    }))
  }
}

async function handleEasyInkPrintHtmlDemo() {
  if (await ensureEasyInkPrintReady()) {
    const size = resolveSchemaPaperSize()
    await runManagedPrint('EasyInk Printer HTML 打印', (callbacks) => {
      callbacks.onPhase({ phase: 'submitting', message: '发送 HTML 到 EasyInk Printer' })
      return easyInkPrint.printHtml(createHtmlPrintDemo(), {
        paperSize: size,
        forcePageSize: true,
        renderOptions: {
          pdf: {
            paperWidthMm: size.width,
            paperHeightMm: size.height,
            printBackground: true,
            marginMm: { top: 0, right: 0, bottom: 0, left: 0 },
          },
          wait: {
            selector: '.easyink-ready',
            timeoutMs: 5000,
          },
        },
      })
    })
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

function openEasyInkPrinterSettings() {
  showEasyInkPrinterSettings.value = true
}

function resolveSchemaPaperSize() {
  return {
    width: toMillimeters(props.schema.page.width, props.schema.unit),
    height: toMillimeters(props.schema.page.height, props.schema.unit),
    unit: 'mm' as const,
  }
}

function createHtmlPrintDemo(): string {
  const sampleNo = resolveHtmlDemoNo()
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Arial, "Microsoft YaHei", sans-serif; color: #111827; }
    main { width: 100%; min-height: 100vh; padding: 6mm; border: 0.4mm solid #111827; }
    h1 { margin: 0 0 4mm; font-size: 6mm; letter-spacing: 0; }
    dl { margin: 0; display: grid; grid-template-columns: 24mm 1fr; row-gap: 2mm; font-size: 3.4mm; }
    dt { color: #6b7280; }
    dd { margin: 0; font-weight: 700; }
    .foot { margin-top: 6mm; padding-top: 3mm; border-top: 0.2mm solid #d1d5db; font-size: 3mm; }
  </style>
</head>
<body>
  <main class="easyink-ready">
    <h1>EasyInk HTML Print</h1>
    <dl>
      <dt>Channel</dt><dd>Printer-side Render</dd>
      <dt>Document</dt><dd>${escapeHtml(sampleNo)}</dd>
      <dt>Source</dt><dd>HTML</dd>
    </dl>
    <div class="foot">Rendered by EasyInk.Printer from renderSource.type=html.</div>
  </main>
</body>
</html>`
}

function resolveHtmlDemoNo(): string {
  const receipt = props.data.receipt
  if (receipt && typeof receipt === 'object' && 'no' in receipt)
    return String((receipt as { no?: unknown }).no ?? 'HTML-DEMO-001')
  return String(props.data.orderNo ?? 'HTML-DEMO-001')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;')
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
            <DropdownMenuLabel>文件导出</DropdownMenuLabel>
            <DropdownMenuItem :disabled="isPrinting" @click="handlePdfExport">
              PDF（固定纸张）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handleExport">
              JSON（模板数据）
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
          <DropdownMenuContent class="z-[10002]">
            <DropdownMenuLabel>打印通道</DropdownMenuLabel>
            <DropdownMenuItem :disabled="isPrinting" @click="handleBrowserPrint('driver')">
              浏览器打印（按打印机介质）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handleHiPrintPrint">
              HiPrint 打印
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handleEasyInkPrintPrint">
              EasyInk Printer 打印（PDF）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handleEasyInkPrintRenderSourcePrint">
              EasyInk Printer 打印（Schema）
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handleEasyInkPrintHtmlDemo">
              EasyInk Printer 打印（HTML）
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="openHiPrintSettings">
              HiPrint 客户端设置
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

  <EasyInkPrinterSettingsDialog
    v-if="showEasyInkPrinterSettings"
    @close="showEasyInkPrinterSettings = false"
  />
</template>
