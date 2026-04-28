<script setup lang="ts">
import type { DocumentSchema, ViewerRuntime } from '@easyink/viewer'
import type { PrinterConfig } from './hooks/usePrinter'
import { createViewer } from '@easyink/viewer'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import PrinterSettingsModal from './components/PrinterSettingsModal.vue'
import { usePrinter } from './hooks/usePrinter'
import { loadPrinterConfig, savePrinterConfig } from './storage/printer-config-store'

const props = defineProps<{
  schema: DocumentSchema
  data: Record<string, unknown>
}>()

const emit = defineEmits<{
  close: []
}>()

const EXPORT_FORMAT = 'playground-demo-json'

const containerRef = ref<HTMLDivElement>()
let viewer: ViewerRuntime | undefined

const zoom = ref(100)
const currentPage = ref(1)
const totalPages = ref(1)

// Printer integration
const printerConfig = ref<PrinterConfig>(loadPrinterConfig())
const printer = usePrinter(printerConfig.value)
const showPrinterSettings = ref(false)
const showPrintMenu = ref(false)

// Auto-connect if enabled
if (printerConfig.value.enablePrinterService) {
  printer.connectService()
}

onMounted(async () => {
  if (!containerRef.value)
    return

  viewer = createViewer({ container: containerRef.value })
  viewer.registerExportAdapter({
    id: 'playground-demo-export',
    format: EXPORT_FORMAT,
    async export(context) {
      return new Blob(
        [JSON.stringify({ schema: context.schema, data: context.data ?? {} }, null, 2)],
        { type: 'application/json' },
      )
    },
  })
  await viewer.open({
    schema: props.schema,
    data: props.data,
  })

  updatePageCount()
  document.addEventListener('keydown', handleKeyDown)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeyDown)
  viewer?.destroy()
  viewer = undefined
})

function updatePageCount() {
  if (!containerRef.value)
    return
  const pages = containerRef.value.querySelectorAll('.ei-viewer-page')
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
  if (!containerRef.value)
    return
  const pages = containerRef.value.querySelectorAll<HTMLElement>('.ei-viewer-page')
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
  if (!containerRef.value)
    return
  const firstPage = containerRef.value.querySelector<HTMLElement>('.ei-viewer-page')
  if (!firstPage)
    return

  const containerWidth = containerRef.value.clientWidth - 64
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
  if (!containerRef.value)
    return
  const pages = containerRef.value.querySelectorAll('.ei-viewer-page')
  const target = pages[pageNum - 1]
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function handleScroll() {
  if (!containerRef.value)
    return
  const pages = containerRef.value.querySelectorAll('.ei-viewer-page')
  const containerRect = containerRef.value.getBoundingClientRect()
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

async function handlePrint() {
  showPrintMenu.value = !showPrintMenu.value
}

async function handleBrowserPrint() {
  showPrintMenu.value = false
  await viewer?.print()
}

async function handleHiPrintPrint() {
  showPrintMenu.value = false

  if (!printer.getPrinterEnabled.value) {
    alert('请先在设置中启用打印服务')
    showPrinterSettings.value = true
    return
  }

  if (!printer.getConnected.value) {
    alert('打印服务未连接，请检查打印服务是否启动')
    return
  }

  if (!printer.getPrinterDevice.value) {
    alert('请先在设置中选择打印机')
    showPrinterSettings.value = true
    return
  }

  if (!containerRef.value)
    return

  try {
    const pages = containerRef.value.querySelectorAll<HTMLElement>('.ei-viewer-page')
    if (pages.length === 0) {
      alert('没有可打印的页面')
      return
    }

    const printerDevice = printer.getPrinterDevice.value
    const { width: pageWidth, height: pageHeight, unit } = props.schema.page

    // Convert page dimensions based on unit (assuming mm for HiPrint)
    const UNIT_TO_MM = {
      'mm': 1,
      'cm': 10,
      'in': 25.4,
      'pt': 0.352778,
    }
    const factor = UNIT_TO_MM[unit as keyof typeof UNIT_TO_MM] || 1
    const width = pageWidth * factor
    const height = pageHeight * factor

    for (const page of pages) {
      const html = page.innerHTML

      await printer.printHtml({
        width,
        height,
        html,
        printer: printerDevice,
      })
    }
  }
  catch (err) {
    alert(`打印失败: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function handleSavePrinterConfig(config: PrinterConfig) {
  printerConfig.value = config
  printer.updateConfig(config)
  savePrinterConfig(config)
  showPrinterSettings.value = false

  if (config.enablePrinterService && !printer.getConnected.value) {
    printer.connectService()
  }
  else if (!config.enablePrinterService && printer.getConnected.value) {
    printer.disconnectService()
  }
}

function handleConnectPrinter() {
  printer.connectService()
}

function handleDisconnectPrinter() {
  printer.disconnectService()
}

function handleRefreshPrinterDevices() {
  printer.refreshPrinterDevicesCache()
}

async function handleExport() {
  const blob = await viewer?.exportDocument(EXPORT_FORMAT)
  if (!(blob instanceof Blob))
    return

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'easyink-export.json'
  anchor.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="fixed inset-0 z-[9999] flex flex-col bg-black/60">
    <div class="flex items-center justify-between px-4 py-1.5 bg-white border-b border-border gap-2">
      <div class="flex items-center gap-1">
        <button class="w-7 h-7 flex items-center justify-center border border-border rounded bg-white cursor-pointer text-[#555] text-xs disabled:opacity-35 disabled:cursor-not-allowed hover:bg-bg-tertiary hover:text-text-secondary" :disabled="currentPage <= 1" @click="prevPage">
          &#9664;
        </button>
        <span class="text-xs text-text-tertiary min-w-[48px] text-center select-none">{{ currentPage }} / {{ totalPages }}</span>
        <button class="w-7 h-7 flex items-center justify-center border border-border rounded bg-white cursor-pointer text-[#555] text-xs disabled:opacity-35 disabled:cursor-not-allowed hover:bg-bg-tertiary hover:text-text-secondary" :disabled="currentPage >= totalPages" @click="nextPage">
          &#9654;
        </button>

        <span class="w-px h-[18px] bg-border mx-1" />

        <button class="w-7 h-7 flex items-center justify-center border border-border rounded bg-white cursor-pointer text-[#555] text-xs hover:bg-bg-tertiary hover:text-text-secondary" @click="zoomOut">
          -
        </button>
        <span class="text-xs text-text-tertiary min-w-[48px] text-center select-none">{{ zoom }}%</span>
        <button class="w-7 h-7 flex items-center justify-center border border-border rounded bg-white cursor-pointer text-[#555] text-xs hover:bg-bg-tertiary hover:text-text-secondary" @click="zoomIn">
          +
        </button>
        <button class="w-auto h-7 px-2 flex items-center justify-center border border-border rounded bg-white cursor-pointer text-xs hover:bg-bg-tertiary hover:text-text-secondary" @click="zoomFit">
          适应宽度
        </button>
      </div>

      <div class="flex items-center gap-1">
        <button class="px-3.5 py-1 text-[13px] border border-border-dark rounded bg-white cursor-pointer text-text-secondary hover:bg-bg-tertiary" @click="handleExport">
          导出 JSON
        </button>
        <div class="relative">
          <button class="px-3.5 py-1 text-[13px] border border-primary rounded bg-primary cursor-pointer text-white hover:bg-primary-hover flex items-center gap-1" @click.stop="handlePrint">
            打印
            <span class="text-[10px]">&#9662;</span>
          </button>
          <div v-if="showPrintMenu" class="absolute right-0 top-full mt-1 bg-white border border-border rounded shadow-lg min-w-[160px] z-10" @click.stop>
            <button class="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary" @click="handleBrowserPrint">
              浏览器打印
            </button>
            <button class="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary" @click="handleHiPrintPrint">
              HiPrint 打印
            </button>
            <div class="border-t border-border" />
            <button class="w-full px-4 py-2 text-left text-sm hover:bg-bg-tertiary" @click="showPrinterSettings = true; showPrintMenu = false">
              打印设置
            </button>
          </div>
        </div>
        <button class="w-8 h-8 flex items-center justify-center border-none bg-transparent text-[22px] text-text-quaternary cursor-pointer rounded ml-1 hover:bg-border-light hover:text-text-secondary" @click="emit('close')">
          &times;
        </button>
      </div>
    </div>

    <div
      ref="containerRef"
      class="flex-1 overflow-auto px-8 py-6 bg-[#525659]"
      @wheel="handleWheel"
      @scroll="handleScroll"
      @click="showPrintMenu = false"
    />
  </div>

  <PrinterSettingsModal
    v-if="showPrinterSettings"
    :config="printerConfig"
    :is-connected="printer.getConnected.value"
    :printer-devices="printer.getPrinterDevicesCache.value"
    @save="handleSavePrinterConfig"
    @connect="handleConnectPrinter"
    @disconnect="handleDisconnectPrinter"
    @refresh-devices="handleRefreshPrinterDevices"
    @close="showPrinterSettings = false"
  />
</template>

<style scoped lang="scss">
.preview-fade {
  &-enter-active,
  &-leave-active {
    transition: opacity 0.2s ease;
  }

  &-enter-from,
  &-leave-to {
    opacity: 0;
  }
}
</style>
