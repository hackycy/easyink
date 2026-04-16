<script setup lang="ts">
import type { DocumentSchema } from '@easyink/designer'
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { StoredTemplate } from './storage/template-store'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { EasyInkDesigner } from '@easyink/designer'
import { createLocalStoragePreferenceProvider } from '@easyink/designer'
import zhCN from '@easyink/designer/locale/zh-CN'
import { blankA4Template, flowInvoiceTemplate, invoiceDemoData, sampleDataSources } from '@easyink/samples'
import TemplateGallery from './components/TemplateGallery.vue'
import PreviewOverlay from './PreviewOverlay.vue'
import { getLastTemplateId, getTemplate, listTemplates, saveTemplate, setLastTemplateId } from './storage/template-store'
import { jsonToDataSource } from './utils/json-to-datasource'

import '@easyink/designer/index.css'

const schema = ref<DocumentSchema>(blankA4Template)
const preferenceProvider = createLocalStoragePreferenceProvider()

// Template management
const currentTemplate = ref<StoredTemplate>()
const showTemplateGallery = ref(false)

// Preview
const showPreview = ref(false)
const previewSchema = ref<DocumentSchema>()

// Data editor
const showDataEditor = ref(false)
const customData = ref<Record<string, unknown>>({})
const customDataSources = ref<DataSourceDescriptor[]>([])

const mergedDataSources = computed(() => [
  ...sampleDataSources,
  ...customDataSources.value,
])

const previewData = computed(() => ({
  ...invoiceDemoData,
  ...customData.value,
}))

// Auto-save debounce
let saveTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSave() {
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    if (!currentTemplate.value)
      return
    currentTemplate.value.schema = JSON.parse(JSON.stringify(schema.value))
    currentTemplate.value.updatedAt = Date.now()
    await saveTemplate(currentTemplate.value)
  }, 1000)
}

watch(schema, () => {
  scheduleSave()
}, { deep: true })

onBeforeUnmount(() => {
  if (saveTimer)
    clearTimeout(saveTimer)
})

// Initialize: load last template or first sample
async function initTemplate() {
  const lastId = getLastTemplateId()
  if (lastId) {
    const stored = await getTemplate(lastId)
    if (stored) {
      currentTemplate.value = stored
      schema.value = stored.schema
      return
    }
  }

  // If no saved templates, check IndexedDB for any
  const all = await listTemplates()
  if (all.length > 0) {
    currentTemplate.value = all[0]
    schema.value = all[0]!.schema
    setLastTemplateId(all[0]!.id)
    return
  }

  // First time: create from default sample
  const now = Date.now()
  const initial: StoredTemplate = {
    id: `user-${now}`,
    name: '流式发票',
    category: 'business',
    schema: JSON.parse(JSON.stringify(flowInvoiceTemplate)),
    createdAt: now,
    updatedAt: now,
    fromSample: 'flow-invoice',
  }
  await saveTemplate(initial)
  currentTemplate.value = initial
  schema.value = initial.schema
  setLastTemplateId(initial.id)
}

initTemplate()

// Template gallery actions
function handleSelectTemplate(template: StoredTemplate) {
  currentTemplate.value = template
  schema.value = template.schema
  setLastTemplateId(template.id)
  showTemplateGallery.value = false
}

async function handleCreateBlank() {
  const now = Date.now()
  const newTemplate: StoredTemplate = {
    id: `user-${now}`,
    name: '空白文档',
    category: 'basic',
    schema: JSON.parse(JSON.stringify(blankA4Template)),
    createdAt: now,
    updatedAt: now,
  }
  await saveTemplate(newTemplate)
  handleSelectTemplate(newTemplate)
}

async function handleDuplicate(template: StoredTemplate) {
  const now = Date.now()
  const dup: StoredTemplate = {
    id: `user-${now}`,
    name: `${template.name} (副本)`,
    category: template.category,
    schema: JSON.parse(JSON.stringify(template.schema)),
    createdAt: now,
    updatedAt: now,
    fromSample: template.fromSample,
  }
  await saveTemplate(dup)
  handleSelectTemplate(dup)
}

function openPreview() {
  previewSchema.value = JSON.parse(JSON.stringify(schema.value))
  showPreview.value = true
}

function openDataEditor() {
  showDataEditor.value = true
}

function handleDataUpdate(data: Record<string, unknown>) {
  customData.value = data
  customDataSources.value = [jsonToDataSource(data)]
}
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :data-sources="mergedDataSources"
    :locale="zhCN"
    :preference-provider="preferenceProvider"
  >
    <template #topbar>
      <div class="playground-topbar">
        <button class="playground-template-btn" @click="showTemplateGallery = true">
          {{ currentTemplate?.name ?? '选择模板' }}
          <span class="playground-template-arrow">&#9662;</span>
        </button>
        <div class="playground-topbar__spacer" />
        <button class="playground-action-btn" @click="openDataEditor">
          数据
        </button>
        <button class="playground-action-btn playground-action-btn--primary" @click="openPreview">
          预览
        </button>
      </div>
    </template>
  </EasyInkDesigner>

  <TemplateGallery
    v-if="showTemplateGallery"
    :current-id="currentTemplate?.id"
    @select="handleSelectTemplate"
    @create-blank="handleCreateBlank"
    @duplicate="handleDuplicate"
    @close="showTemplateGallery = false"
  />

  <PreviewOverlay
    v-if="showPreview && previewSchema"
    :schema="previewSchema"
    :data="previewData"
    @close="showPreview = false"
  />

  <DataEditorModal
    v-if="showDataEditor"
    :initial-data="customData"
    @update="handleDataUpdate"
    @close="showDataEditor = false"
  />
</template>

<script lang="ts">
import DataEditorModal from './components/DataEditor.vue'

export default {
  components: { DataEditorModal },
}
</script>

<style scoped>
.playground-topbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  background: #f8f8f8;
  border-bottom: 1px solid #e0e0e0;
}

.playground-template-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 500;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #333;
}

.playground-template-btn:hover {
  background: #f0f0f0;
}

.playground-template-arrow {
  font-size: 10px;
  color: #999;
}

.playground-topbar__spacer {
  flex: 1;
}

.playground-action-btn {
  padding: 4px 14px;
  font-size: 13px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #333;
}

.playground-action-btn:hover {
  background: #e8e8e8;
}

.playground-action-btn--primary {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}

.playground-action-btn--primary:hover {
  background: #4096ff;
  border-color: #4096ff;
}
</style>
