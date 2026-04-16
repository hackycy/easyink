<script setup lang="ts">
import type { DocumentSchema } from '@easyink/viewer'
import type { ViewerRuntime } from '@easyink/viewer'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { createViewer, registerBuiltinViewerMaterials } from '@easyink/viewer'

const EXPORT_FORMAT = 'playground-demo-json'

const props = defineProps<{
  schema: DocumentSchema
  data: Record<string, unknown>
}>()

const emit = defineEmits<{
  close: []
}>()

const containerRef = ref<HTMLDivElement>()
let viewer: ViewerRuntime | undefined

const zoom = ref(100)
const currentPage = ref(1)
const totalPages = ref(1)

onMounted(async () => {
  if (!containerRef.value)
    return

  viewer = createViewer({ container: containerRef.value })
  registerBuiltinViewerMaterials(viewer)
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
  await viewer?.print()
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
  <Transition name="preview-fade">
    <div class="preview-overlay">
      <div class="preview-toolbar">
        <div class="preview-toolbar__left">
          <!-- Page navigation -->
          <button class="preview-tool-btn" :disabled="currentPage <= 1" @click="prevPage">
            &#9664;
          </button>
          <span class="preview-page-info">{{ currentPage }} / {{ totalPages }}</span>
          <button class="preview-tool-btn" :disabled="currentPage >= totalPages" @click="nextPage">
            &#9654;
          </button>

          <span class="preview-divider" />

          <!-- Zoom controls -->
          <button class="preview-tool-btn" @click="zoomOut">
            -
          </button>
          <span class="preview-zoom-info">{{ zoom }}%</span>
          <button class="preview-tool-btn" @click="zoomIn">
            +
          </button>
          <button class="preview-tool-btn preview-tool-btn--text" @click="zoomFit">
            适应宽度
          </button>
        </div>

        <div class="preview-toolbar__right">
          <button class="preview-btn" @click="handleExport">
            导出 JSON
          </button>
          <button class="preview-btn preview-btn--primary" @click="handlePrint">
            打印
          </button>
          <button class="preview-close" @click="emit('close')">
            &times;
          </button>
        </div>
      </div>

      <div
        ref="containerRef"
        class="preview-content"
        @wheel="handleWheel"
        @scroll="handleScroll"
      />
    </div>
  </Transition>
</template>

<style scoped>
.preview-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.6);
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 16px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
  gap: 8px;
}

.preview-toolbar__left,
.preview-toolbar__right {
  display: flex;
  align-items: center;
  gap: 4px;
}

.preview-tool-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #555;
  font-size: 12px;
}

.preview-tool-btn:hover:not(:disabled) {
  background: #f5f5f5;
  color: #333;
}

.preview-tool-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.preview-tool-btn--text {
  width: auto;
  padding: 0 8px;
  font-size: 12px;
}

.preview-page-info,
.preview-zoom-info {
  font-size: 12px;
  color: #666;
  min-width: 48px;
  text-align: center;
  user-select: none;
}

.preview-divider {
  width: 1px;
  height: 18px;
  background: #e0e0e0;
  margin: 0 4px;
}

.preview-btn {
  padding: 4px 14px;
  font-size: 13px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #333;
}

.preview-btn:hover {
  background: #f5f5f5;
}

.preview-btn--primary {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}

.preview-btn--primary:hover {
  background: #4096ff;
}

.preview-close {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  font-size: 22px;
  color: #999;
  cursor: pointer;
  border-radius: 4px;
  margin-left: 4px;
}

.preview-close:hover {
  background: #f0f0f0;
  color: #333;
}

.preview-content {
  flex: 1;
  overflow: auto;
  padding: 24px 32px;
  background: #525659;
}

.preview-fade-enter-active,
.preview-fade-leave-active {
  transition: opacity 0.2s ease;
}

.preview-fade-enter-from,
.preview-fade-leave-to {
  opacity: 0;
}
</style>
