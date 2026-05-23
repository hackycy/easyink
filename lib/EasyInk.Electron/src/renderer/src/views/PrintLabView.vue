<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { Play, Send } from 'lucide-vue-next'
import UiBadge from '../components/ui/Badge.vue'
import UiButton from '../components/ui/Button.vue'
import { useEasyInkStore } from '../stores/easyink'
import type { PrintRequestParams } from '../types/easyink'

const store = useEasyInkStore()
const asyncMode = ref(true)
const form = reactive({
  printerName: '',
  sourceMode: 'html' as 'html' | 'htmlUrl' | 'pdfUrl' | 'pdfBase64' | 'viewer',
  sourceValue: `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; padding: 20mm; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #222; padding: 8px; }
  </style>
</head>
<body>
  <h1>EasyInk HTML Print</h1>
  <p>Chromium 渲染后直接进入系统打印管线。</p>
  <table>
    <tr><th>Item</th><th>Qty</th></tr>
    <tr><td>Label</td><td>1</td></tr>
  </table>
</body>
</html>`,
  viewerStyles: 'body { font-family: Arial, sans-serif; padding: 20mm; }',
  viewerTitle: 'EasyInk Viewer Print',
  copies: 1,
  landscape: false,
  paperWidth: 210,
  paperHeight: 297
})

const selectedPrinter = computed(
  () => form.printerName || store.defaultPrinter?.name || store.printers[0]?.name || ''
)
const canPrint = computed(() => Boolean(selectedPrinter.value && form.sourceValue.trim()))

async function submit(): Promise<void> {
  const params: PrintRequestParams = {
    printerName: selectedPrinter.value,
    copies: form.copies,
    landscape: form.landscape,
    silent: true,
    forcePaperSize: true,
    paperSize: {
      width: form.paperWidth,
      height: form.paperHeight,
      unit: 'mm'
    }
  }
  if (form.sourceMode === 'viewer') {
    params.viewer = {
      title: form.viewerTitle,
      styles: form.viewerStyles,
      pages: parseViewerPages(form.sourceValue)
    }
  } else {
    params[form.sourceMode] = form.sourceValue
  }
  await store.print(params, asyncMode.value)
}

function parseViewerPages(value: string): string[] {
  const trimmed = value.trim()
  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item))
    }
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { pages?: unknown[] }).pages)
    ) {
      return (parsed as { pages: unknown[] }).pages.map((item) => String(item))
    }
  } catch {
    return [trimmed]
  }
  return [trimmed]
}
</script>

<template>
  <section class="split-layout">
    <form class="form-panel" @submit.prevent="submit">
      <div class="section-title">
        <h2>打印输入</h2>
        <UiBadge tone="good">HTML 直打</UiBadge>
      </div>

      <label class="field">
        <span>打印机</span>
        <select v-model="form.printerName">
          <option value="">默认打印机</option>
          <option v-for="printer in store.printers" :key="printer.name" :value="printer.name">
            {{ printer.displayName || printer.name }}
          </option>
        </select>
      </label>

      <div class="segmented segmented--five">
        <button
          type="button"
          :class="{ active: form.sourceMode === 'html' }"
          @click="form.sourceMode = 'html'"
        >
          HTML
        </button>
        <button
          type="button"
          :class="{ active: form.sourceMode === 'htmlUrl' }"
          @click="form.sourceMode = 'htmlUrl'"
        >
          HTML URL
        </button>
        <button
          type="button"
          :class="{ active: form.sourceMode === 'pdfUrl' }"
          @click="form.sourceMode = 'pdfUrl'"
        >
          PDF URL
        </button>
        <button
          type="button"
          :class="{ active: form.sourceMode === 'pdfBase64' }"
          @click="form.sourceMode = 'pdfBase64'"
        >
          PDF Base64
        </button>
        <button
          type="button"
          :class="{ active: form.sourceMode === 'viewer' }"
          @click="form.sourceMode = 'viewer'"
        >
          Viewer
        </button>
      </div>

      <div v-if="form.sourceMode === 'viewer'" class="form-grid form-grid--two">
        <label class="field">
          <span>标题</span>
          <input v-model="form.viewerTitle" />
        </label>
        <label class="field">
          <span>样式</span>
          <input v-model="form.viewerStyles" />
        </label>
      </div>

      <label class="field field-grow">
        <span>{{ form.sourceMode === 'viewer' ? 'Viewer pages' : '内容' }}</span>
        <textarea v-model="form.sourceValue" spellcheck="false" />
      </label>

      <div class="form-grid">
        <label class="field">
          <span>份数</span>
          <input v-model.number="form.copies" type="number" min="1" max="99" />
        </label>
        <label class="field">
          <span>宽 mm</span>
          <input v-model.number="form.paperWidth" type="number" min="1" />
        </label>
        <label class="field">
          <span>高 mm</span>
          <input v-model.number="form.paperHeight" type="number" min="1" />
        </label>
      </div>

      <div class="toggles">
        <label><input v-model="form.landscape" type="checkbox" /> 横向</label>
        <label><input v-model="asyncMode" type="checkbox" /> 异步队列</label>
      </div>

      <UiButton :disabled="!canPrint || store.loading">
        <Send v-if="asyncMode" :size="17" />
        <Play v-else :size="17" />
        {{ asyncMode ? '入队打印' : '立即打印' }}
      </UiButton>
    </form>

    <aside class="result-panel">
      <div class="section-title">
        <h2>响应</h2>
      </div>
      <pre>{{ JSON.stringify(store.lastResult ?? { success: null }, null, 2) }}</pre>
    </aside>
  </section>
</template>
