<script setup lang="ts">
import type { TemplateSchema } from '@easyink/core'
import { ScreenRenderer } from '@easyink/renderer'
import { EasyInkDesigner } from '@easyink/designer'
import '../../packages/designer/src/theme/index.css'
import { nextTick, ref, watch } from 'vue'
import { presetTemplates } from './templates'

// ─── 模板切换 ───
const templateIndex = ref(0)
const designerKey = ref(0)

const currentTemplate = () => presetTemplates[templateIndex.value]

const schema = ref<TemplateSchema | undefined>(currentTemplate().schema)
const currentDataJson = ref(JSON.stringify(currentTemplate().data, null, 2))
const dataError = ref('')

function switchTemplate(index: number) {
  templateIndex.value = index
  const tpl = currentTemplate()
  schema.value = tpl.schema
  currentDataJson.value = JSON.stringify(tpl.data, null, 2)
  dataError.value = ''
  designerKey.value++
}

function onSchemaUpdate(newSchema: TemplateSchema) {
  schema.value = newSchema
}

// ─── 解析填充数据 ───
function parsedData(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(currentDataJson.value)
    dataError.value = ''
    return parsed as Record<string, unknown>
  }
  catch {
    dataError.value = 'JSON 格式错误'
    return currentTemplate().data
  }
}

// ─── 导入/导出 ───
const fileInput = ref<HTMLInputElement | null>(null)

function handleExport() {
  if (!schema.value)
    return
  const name = schema.value.meta?.name || 'template'
  const json = JSON.stringify(schema.value, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${name}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleImport() {
  fileInput.value?.click()
}

function onFileSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file)
    return

  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result as string)
      if (!parsed.version) {
        alert('无效的模板文件：缺少 version 字段')
        return
      }
      schema.value = parsed as TemplateSchema
      designerKey.value++
    }
    catch {
      alert('文件解析失败：不是有效的 JSON')
    }
  }
  reader.readAsText(file)
  input.value = ''
}

// ─── 底部面板 ───
const bottomOpen = ref(false)
const activeTab = ref<'schema' | 'data' | 'preview'>('schema')
const previewRef = ref<HTMLElement | null>(null)

let previewRenderer: ScreenRenderer | null = null

function toggleBottom() {
  bottomOpen.value = !bottomOpen.value
}

// ─── Schema JSON 展示 ───
const schemaJson = ref('')
watch(() => schema.value, (s) => {
  schemaJson.value = s ? JSON.stringify(s, null, 2) : ''
}, { deep: false })

// ─── 数据变更更新渲染预览 ───
function onDataInput(e: Event) {
  currentDataJson.value = (e.target as HTMLTextAreaElement).value
}

// ─── 渲染预览 ───
watch([() => schema.value, bottomOpen, activeTab, currentDataJson], async () => {
  if (!bottomOpen.value || activeTab.value !== 'preview' || !schema.value)
    return

  await nextTick()
  const container = previewRef.value
  if (!container)
    return

  if (!previewRenderer) {
    previewRenderer = new ScreenRenderer({ zoom: 0.5 })
  }

  container.innerHTML = ''
  try {
    previewRenderer.render(schema.value, parsedData(), container)
  }
  catch {
    container.textContent = '渲染失败'
  }
}, { deep: false })
</script>

<template>
  <div class="app">
    <!-- 顶部工具栏 -->
    <div class="app-toolbar">
      <div class="toolbar-left">
        <label class="toolbar-label">模板：</label>
        <select
          class="toolbar-select"
          :value="templateIndex"
          @change="switchTemplate(Number(($event.target as HTMLSelectElement).value))"
        >
          <option
            v-for="(tpl, i) in presetTemplates"
            :key="i"
            :value="i"
          >
            {{ tpl.name }}
          </option>
        </select>
        <span class="toolbar-desc">{{ presetTemplates[templateIndex].description }}</span>
      </div>
      <div class="toolbar-right">
        <button class="toolbar-btn" @click="handleImport">
          导入
        </button>
        <button class="toolbar-btn" :disabled="!schema" @click="handleExport">
          导出
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".json"
          style="display: none"
          @change="onFileSelected"
        >
      </div>
    </div>

    <!-- 设计器区域 -->
    <div class="designer-area">
      <EasyInkDesigner
        :key="designerKey"
        :schema="schema"
        :data-sources="currentTemplate().dataSources"
        @update:schema="onSchemaUpdate"
      />
    </div>

    <!-- 底部面板切换栏 -->
    <div class="bottom-toggle" @click="toggleBottom">
      {{ bottomOpen ? '▼ 收起面板' : '▲ 展开面板' }}
    </div>

    <!-- 底部面板 -->
    <div v-if="bottomOpen" class="bottom-panel">
      <div class="tab-bar">
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'schema' }"
          @click="activeTab = 'schema'"
        >
          Schema JSON
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'data' }"
          @click="activeTab = 'data'"
        >
          数据填充
        </button>
        <button
          class="tab-btn"
          :class="{ active: activeTab === 'preview' }"
          @click="activeTab = 'preview'"
        >
          渲染预览
        </button>
      </div>
      <div class="tab-content">
        <!-- Schema JSON -->
        <textarea
          v-if="activeTab === 'schema'"
          class="code-area"
          readonly
          :value="schemaJson"
        />
        <!-- 数据填充 -->
        <div v-else-if="activeTab === 'data'" class="data-pane">
          <textarea
            class="code-area"
            :class="{ 'has-error': dataError }"
            :value="currentDataJson"
            @input="onDataInput"
          />
          <div v-if="dataError" class="data-error">
            {{ dataError }}
          </div>
        </div>
        <!-- 渲染预览 -->
        <div v-else ref="previewRef" class="preview-container" />
      </div>
    </div>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

/* 顶部工具栏 */
.app-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 36px;
  padding: 0 12px;
  background: #f8f8f8;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
  gap: 8px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.toolbar-label {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
}

.toolbar-select {
  height: 26px;
  padding: 0 8px;
  font-size: 12px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  outline: none;
  cursor: pointer;
}

.toolbar-select:focus {
  border-color: #4a90d9;
}

.toolbar-desc {
  font-size: 11px;
  color: #999;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toolbar-btn {
  height: 26px;
  padding: 0 12px;
  font-size: 12px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  white-space: nowrap;
}

.toolbar-btn:hover {
  background: #f0f0f0;
}

.toolbar-btn:active {
  background: #e8e8e8;
}

.toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 设计器区域 */
.designer-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* 底部面板 */
.bottom-toggle {
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f0f0f0;
  border-top: 1px solid #e0e0e0;
  cursor: pointer;
  font-size: 12px;
  color: #666;
  flex-shrink: 0;
  user-select: none;
}

.bottom-toggle:hover {
  background: #e8e8e8;
  color: #333;
}

.bottom-panel {
  display: flex;
  flex-direction: column;
  height: 300px;
  border-top: 1px solid #e0e0e0;
  flex-shrink: 0;
}

/* 标签栏 */
.tab-bar {
  display: flex;
  height: 30px;
  background: #f5f5f5;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.tab-btn {
  padding: 0 16px;
  font-size: 12px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: #666;
  border-bottom: 2px solid transparent;
  outline: none;
}

.tab-btn:hover {
  color: #333;
  background: #eee;
}

.tab-btn.active {
  color: #4a90d9;
  border-bottom-color: #4a90d9;
  font-weight: 600;
}

/* 标签内容 */
.tab-content {
  flex: 1;
  overflow: hidden;
  display: flex;
}

.code-area {
  flex: 1;
  padding: 8px 12px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
  line-height: 1.5;
  border: none;
  outline: none;
  resize: none;
  background: #fafafa;
  width: 100%;
}

.code-area.has-error {
  border: 2px solid #e55;
}

.data-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.data-error {
  padding: 4px 12px;
  font-size: 11px;
  color: #e55;
  background: #fff5f5;
  border-top: 1px solid #fcc;
  flex-shrink: 0;
}

.preview-container {
  flex: 1;
  overflow: auto;
  padding: 12px;
  background: #f5f5f5;
}
</style>
