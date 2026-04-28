<script setup lang="ts">
import type { DataSourceDescriptor, DocumentSchema } from '@easyink/designer'
import type { SampleTemplateEntry } from '@easyink/samples'
import type { StoredTemplate } from './storage/template-store'
import { createAIContribution } from '@easyink/ai'
import { createLocalStoragePreferenceProvider, EasyInkDesigner } from '@easyink/designer'
import zhCN from '@easyink/designer/locale/zh-CN'
import { blankA4Template, flowInvoiceTemplate, invoiceDemoData, sampleDataSources } from '@easyink/samples'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import DataEditorModal from './components/DataEditor.vue'
import TemplateGallery from './components/TemplateGallery.vue'
import { Button } from './components/ui/button'
import { Toaster } from './components/ui/sonner'
import PreviewOverlay from './PreviewOverlay.vue'
import { getLastTemplateId, getTemplate, listTemplates, saveTemplate, setLastTemplateId } from './storage/template-store'
import { jsonToDataSource } from './utils/json-to-datasource'

const schema = ref<DocumentSchema>(blankA4Template)
const preferenceProvider = createLocalStoragePreferenceProvider()

// Workspace state
// Either editing a stored template OR previewing a sample (not both).
const currentTemplate = ref<StoredTemplate>()
const previewingSample = ref<SampleTemplateEntry>()

const showTemplateGallery = ref(false)
const showPreview = ref(false)
const previewSchema = ref<DocumentSchema>()
const showDataEditor = ref(false)

const customData = ref<Record<string, unknown>>({})
const customDataSources = ref<DataSourceDescriptor[]>([])

const mergedDataSources = computed(() => [
  ...sampleDataSources,
  ...customDataSources.value,
])
const previewData = computed(() => customData.value)

const topbarLabel = computed(() => {
  if (previewingSample.value)
    return `[预览] ${previewingSample.value.name}`
  return currentTemplate.value?.name ?? '选择模板'
})

// Auto-save (only when editing a stored template — never for sample preview)
let saveTimer: ReturnType<typeof setTimeout> | undefined

function scheduleSave() {
  if (!currentTemplate.value)
    return
  if (saveTimer)
    clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    if (!currentTemplate.value)
      return
    currentTemplate.value.schema = JSON.parse(JSON.stringify(schema.value))
    currentTemplate.value.data = JSON.parse(JSON.stringify(customData.value))
    currentTemplate.value.updatedAt = Date.now()
    await saveTemplate(currentTemplate.value)
  }, 1000)
}

watch(schema, scheduleSave, { deep: true })
watch(customData, scheduleSave, { deep: true })

// Bridge AI panel sample data to preview
watch(() => {
  const ai = (schema.value.extensions as { ai?: { latestSampleData?: Record<string, unknown>, latestSampleDataAt?: number } } | undefined)?.ai
  return ai?.latestSampleDataAt ?? 0
}, (ts) => {
  if (!ts)
    return
  const ai = (schema.value.extensions as { ai?: { latestSampleData?: Record<string, unknown> } } | undefined)?.ai
  if (ai?.latestSampleData)
    applyDemoData(ai.latestSampleData)
})

onBeforeUnmount(() => {
  if (saveTimer)
    clearTimeout(saveTimer)
})

function applyDemoData(data: Record<string, unknown>) {
  customData.value = data
  customDataSources.value = Object.keys(data).length > 0 ? [jsonToDataSource(data)] : []
}

function clearData() {
  customData.value = {}
  customDataSources.value = []
}

// Init
async function initTemplate() {
  const lastId = getLastTemplateId()
  if (lastId) {
    const stored = await getTemplate(lastId)
    if (stored) {
      loadStoredTemplate(stored)
      return
    }
  }

  const all = await listTemplates()
  if (all.length > 0 && all[0]) {
    loadStoredTemplate(all[0])
    return
  }

  // First time: create from default sample
  const now = Date.now()
  const initial: StoredTemplate = {
    id: `user-${now}`,
    name: '流式发票',
    category: 'business',
    schema: JSON.parse(JSON.stringify(flowInvoiceTemplate)),
    data: JSON.parse(JSON.stringify(invoiceDemoData)),
    createdAt: now,
    updatedAt: now,
    fromSample: 'flow-invoice',
  }
  await saveTemplate(initial)
  loadStoredTemplate(initial)
}

function loadStoredTemplate(template: StoredTemplate) {
  previewingSample.value = undefined
  currentTemplate.value = template
  schema.value = template.schema
  setLastTemplateId(template.id)
  if (template.data && Object.keys(template.data).length > 0)
    applyDemoData(template.data)
  else
    clearData()
}

initTemplate()

// Gallery handlers
function handleSelectTemplate(template: StoredTemplate) {
  showTemplateGallery.value = false
  loadStoredTemplate(template)
}

function handlePreviewSample(sample: SampleTemplateEntry) {
  showTemplateGallery.value = false
  currentTemplate.value = undefined
  previewingSample.value = sample
  schema.value = JSON.parse(JSON.stringify(sample.schema))
  if (sample.demoData && Object.keys(sample.demoData).length > 0)
    applyDemoData(sample.demoData)
  else
    clearData()
}

async function handleCreateBlank() {
  const now = Date.now()
  const t: StoredTemplate = {
    id: `user-${now}`,
    name: '空白文档',
    category: 'basic',
    schema: JSON.parse(JSON.stringify(blankA4Template)),
    createdAt: now,
    updatedAt: now,
  }
  await saveTemplate(t)
  showTemplateGallery.value = false
  loadStoredTemplate(t)
}

async function handleDuplicate(template: StoredTemplate) {
  const now = Date.now()
  const dup: StoredTemplate = {
    id: `user-${now}`,
    name: `${template.name} (副本)`,
    category: template.category,
    schema: JSON.parse(JSON.stringify(template.schema)),
    data: template.data ? JSON.parse(JSON.stringify(template.data)) : undefined,
    createdAt: now,
    updatedAt: now,
    fromSample: template.fromSample,
  }
  await saveTemplate(dup)
  showTemplateGallery.value = false
  loadStoredTemplate(dup)
}

async function handleSavePreviewAsTemplate() {
  if (!previewingSample.value)
    return
  const sample = previewingSample.value
  const now = Date.now()
  const t: StoredTemplate = {
    id: `user-${now}`,
    name: sample.name,
    category: sample.category,
    schema: JSON.parse(JSON.stringify(schema.value)),
    data: JSON.parse(JSON.stringify(customData.value)),
    createdAt: now,
    updatedAt: now,
    fromSample: sample.id,
  }
  await saveTemplate(t)
  loadStoredTemplate(t)
  toast.success(`已保存为「${t.name}」`)
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
      <div class="flex items-center gap-2 px-3 py-1 bg-muted border-b border-border">
        <Button variant="outline" size="sm" class="flex items-center gap-1" @click="showTemplateGallery = true">
          {{ topbarLabel }}
          <span class="text-[10px] text-muted-foreground">&#9662;</span>
        </Button>
        <Button
          v-if="previewingSample"
          variant="outline"
          size="sm"
          @click="handleSavePreviewAsTemplate"
        >
          另存为我的模板
        </Button>
        <div class="flex-1" />
        <Button variant="outline" size="sm" @click="openDataEditor">
          数据
        </Button>
        <Button size="sm" @click="openPreview">
          预览
        </Button>
      </div>
    </template>
  </EasyInkDesigner>

  <TemplateGallery
    v-if="showTemplateGallery"
    :current-id="currentTemplate?.id"
    @select="handleSelectTemplate"
    @preview-sample="handlePreviewSample"
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

  <Toaster />
</template>
