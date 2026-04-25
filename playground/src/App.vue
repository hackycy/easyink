<script setup lang="ts">
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/designer'
import type { StoredTemplate } from './storage/template-store'
import { createAIContribution } from '@easyink/ai'
import { createLocalStoragePreferenceProvider, EasyInkDesigner } from '@easyink/designer'
import zhCN from '@easyink/designer/locale/zh-CN'
import { blankA4Template, flowInvoiceTemplate, invoiceDemoData, sampleDataSources, sampleTemplates } from '@easyink/samples'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import DataEditorModal from './components/DataEditor.vue'
import TemplateGallery from './components/TemplateGallery.vue'
import PreviewOverlay from './PreviewOverlay.vue'
import { getLastTemplateId, getTemplate, listTemplates, saveTemplate, setLastTemplateId } from './storage/template-store'
import { jsonToDataSource } from './utils/json-to-datasource'

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

const previewData = computed(() => customData.value)

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

function applyDemoData(data: Record<string, unknown>) {
  customData.value = data
  customDataSources.value = [jsonToDataSource(data)]
}

function getDemoDataForTemplate(template: StoredTemplate): Record<string, unknown> | undefined {
  if (!template.fromSample)
    return undefined
  const sample = sampleTemplates.find(s => s.id === template.fromSample)
  return sample?.demoData
}

// Initialize: load last template or first sample
async function initTemplate() {
  const lastId = getLastTemplateId()
  if (lastId) {
    const stored = await getTemplate(lastId)
    if (stored) {
      currentTemplate.value = stored
      schema.value = stored.schema
      const demoData = getDemoDataForTemplate(stored)
      if (demoData)
        applyDemoData(demoData)
      return
    }
  }

  // If no saved templates, check IndexedDB for any
  const all = await listTemplates()
  if (all.length > 0) {
    currentTemplate.value = all[0]
    schema.value = all[0]!.schema
    setLastTemplateId(all[0]!.id)
    const demoData = getDemoDataForTemplate(all[0]!)
    if (demoData)
      applyDemoData(demoData)
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
  applyDemoData(invoiceDemoData)
}

initTemplate()

// Template gallery actions
function handleSelectTemplate(template: StoredTemplate, demoData?: Record<string, unknown>) {
  currentTemplate.value = template
  schema.value = template.schema
  setLastTemplateId(template.id)
  if (demoData)
    applyDemoData(demoData)
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
  applyDemoData(data)
}

const contributions = [createAIContribution()]
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :data-sources="mergedDataSources"
    :locale="zhCN"
    :preference-provider="preferenceProvider"
    :contributions="contributions"
  >
    <template #topbar>
      <div class="flex items-center gap-2 px-3 py-1 bg-bg-secondary border-b border-border">
        <button class="flex items-center gap-1 px-2.5 py-1 text-[13px] font-medium border border-border-dark rounded bg-white cursor-pointer text-text-secondary hover:bg-bg-tertiary" @click="showTemplateGallery = true">
          {{ currentTemplate?.name ?? '选择模板' }}
          <span class="text-[10px] text-text-quaternary">&#9662;</span>
        </button>
        <div class="flex-1" />
        <button class="px-3.5 py-1 text-[13px] border border-border-dark rounded bg-white cursor-pointer text-text-secondary hover:bg-bg-hover" @click="openDataEditor">
          数据
        </button>
        <button class="px-3.5 py-1 text-[13px] border border-primary rounded bg-primary cursor-pointer text-white hover:bg-primary-hover hover:border-primary-hover" @click="openPreview">
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
