<script setup lang="ts">
import type { DocumentSchema, ViewerRuntime } from '@easyink/viewer'
import { IconChevronLeft, IconChevronRight, IconClose, IconMinimize, IconPlus } from '@easyink/icons'
import { createViewer } from '@easyink/viewer'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { toast } from 'vue-sonner'
import PrinterSettingsModal from './components/PrinterSettingsModal.vue'
import { Button } from './components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu'
import { usePrinter } from './hooks/usePrinter'

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
const printer = usePrinter()
const showPrinterSettings = ref(false)
const isPrinting = ref(false)

// Auto-connect handled inside usePrinter() singleton based on persisted config.

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

async function handleBrowserPrint() {
  await viewer?.print()
}

async function handleHiPrintPrint() {
  if (!printer.enabled.value) {
    toast.error('请先在设置中启用打印服务')
    showPrinterSettings.value = true
    return
  }

  if (!printer.isConnected.value) {
    const t = toast.loading('正在连接打印服务…')
    try {
      await printer.connect()
      toast.dismiss(t)
    }
    catch (e) {
      toast.dismiss(t)
      toast.error(e instanceof Error ? e.message : '连接打印服务失败')
      showPrinterSettings.value = true
      return
    }
  }

  if (!printer.printerDevice.value) {
    toast.error('请在设置中选择打印机')
    showPrinterSettings.value = true
    return
  }

  if (!containerRef.value)
    return

  const pages = Array.from(
    containerRef.value.querySelectorAll<HTMLElement>('.ei-viewer-page'),
  )
  if (pages.length === 0) {
    toast.error('没有可打印的页面')
    return
  }

  const printerDevice = printer.printerDevice.value
  const { width: pageWidth, height: pageHeight } = props.schema.page
  const { unit } = props.schema

  const UNIT_TO_MM = { mm: 1, cm: 10, in: 25.4, pt: 0.352778 }
  const factor = UNIT_TO_MM[unit as keyof typeof UNIT_TO_MM] || 1
  const width = pageWidth * factor
  const height = pageHeight * factor

  isPrinting.value = true
  const progressId = pages.length > 1 ? toast.loading(`打印中 0 / ${pages.length}`) : undefined

  try {
    await printer.printPages(
      pages,
      { width, height, printer: printerDevice },
      ({ current, total }) => {
        if (progressId !== undefined)
          toast.loading(`打印中 ${current} / ${total}`, { id: progressId })
      },
    )
    if (progressId !== undefined)
      toast.dismiss(progressId)
    toast.success(pages.length > 1 ? `已完成打印 (${pages.length} 页)` : '已发送到打印机')
  }
  catch (err) {
    if (progressId !== undefined)
      toast.dismiss(progressId)
    toast.error(`打印失败: ${err instanceof Error ? err.message : String(err)}`)
  }
  finally {
    isPrinting.value = false
  }
}

function openPrinterSettings() {
  showPrinterSettings.value = true
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
        <Button variant="outline" size="sm" @click="handleExport">
          导出
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button size="sm">
              打印
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent class="z-[10002]">
            <DropdownMenuItem :disabled="isPrinting" @click="handleBrowserPrint">
              浏览器打印
            </DropdownMenuItem>
            <DropdownMenuItem :disabled="isPrinting" @click="handleHiPrintPrint">
              HiPrint 打印
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="openPrinterSettings">
              打印设置
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button variant="outline" size="icon-sm" @click="emit('close')">
          <IconClose :size="16" />
        </Button>
      </div>
    </div>

    <div
      ref="containerRef"
      class="flex-1 overflow-auto px-8 py-6 bg-[#525659]"
      @wheel="handleWheel"
      @scroll="handleScroll"
    />
  </div>

  <PrinterSettingsModal
    v-if="showPrinterSettings"
    @close="showPrinterSettings = false"
  />
</template>
