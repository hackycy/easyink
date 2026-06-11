<script setup lang="ts">
import type { DataSourceDescriptor, DesignerRuntimeConfig, DocumentSchema } from '@easyink/designer'
import type { SampleTemplateEntry } from '@easyink/samples'
import type { StoredTemplate } from './storage/template-store'
import { createAssistantContribution, createBrowserAssistantLLMConfigService } from '@easyink/assistant-designer-bridge'
import { placeholderImagesPlugin } from '@easyink/assistant-plugin-placeholder-images'
import { prototypeDesignerPlugin } from '@easyink/assistant-plugin-prototype-designer'
import { receiptDesignerPlugin } from '@easyink/assistant-plugin-receipt-designer'
import { builtinDesignerMaterialBundle } from '@easyink/builtin/all'
import { createLocalStoragePreferenceProvider, EasyInkDesigner } from '@easyink/designer'
import { enUS, zhCN } from '@easyink/designer/locale'
import { blankA4Template, flowInvoiceTemplate, invoiceDemoData, sampleDataSources } from '@easyink/samples'
import { BookOpen, ChevronDown, Database, Eye, Github, Languages, LayoutTemplate, Save } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { toast } from 'vue-sonner'
import DataEditorModal from './components/DataEditor.vue'
import TemplateGallery from './components/TemplateGallery.vue'
import { Button } from './components/ui/button'
import { Toaster } from './components/ui/sonner'
import { playgroundFontProvider } from './fonts'
import PreviewOverlay from './PreviewOverlay.vue'
import { getLastTemplateId, getTemplate, listTemplates, saveTemplate, setLastTemplateId } from './storage/template-store'
import { jsonToDataSource } from './utils/json-to-datasource'

const schema = ref<DocumentSchema>(blankA4Template)
const preferenceProvider = createLocalStoragePreferenceProvider()
const runtimeConfig = {
  materials: {
    bundles: [builtinDesignerMaterialBundle],
  },
} satisfies DesignerRuntimeConfig

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
const localeCode = ref<'zh-CN' | 'en-US'>('zh-CN')

const mergedDataSources = computed(() => [
  ...sampleDataSources,
  ...customDataSources.value,
])
const previewData = computed(() => customData.value)
const designerLocale = computed(() => localeCode.value === 'en-US' ? enUS : zhCN)
const localeToggleLabel = computed(() => localeCode.value === 'zh-CN' ? 'English' : '中文')

const topbarLabel = computed(() => {
  if (previewingSample.value)
    return `[预览] ${previewingSample.value.name}`
  return currentTemplate.value?.name ?? '选择模板'
})

const autoSaveOptions = computed(() => ({
  enabled: Boolean(currentTemplate.value),
  delay: 1000,
  save: saveCurrentTemplate,
}))

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function saveCurrentTemplate(schemaSnapshot: DocumentSchema): Promise<void> {
  const template = currentTemplate.value
  if (!template)
    return

  const savedTemplate: StoredTemplate = {
    ...template,
    schema: cloneJson(schemaSnapshot),
    data: cloneJson(customData.value),
    updatedAt: Date.now(),
  }
  currentTemplate.value = savedTemplate
  await Promise.all([saveTemplate(savedTemplate), wait(260)])
}

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

function openDocumentation() {
  window.open('https://hackycy.github.io/easyink/docs/', '_blank')
}

function openGitHub() {
  window.open('https://github.com/hackycy/easyink', '_blank')
}

function handleDataUpdate(data: Record<string, unknown>) {
  applyDemoData(data)
}

const assistantEndpoint = import.meta.env.VITE_EASYINK_ASSISTANT_ENDPOINT || 'http://127.0.0.1:3010'
const contributions = [createAssistantContribution({
  endpoint: assistantEndpoint,
  llmConfig: createBrowserAssistantLLMConfigService({ persistence: 'local' }),
  plugins: [
    placeholderImagesPlugin,
    prototypeDesignerPlugin,
    receiptDesignerPlugin,
  ],
})]
</script>

<template>
  <EasyInkDesigner
    v-model:schema="schema"
    :data-sources="mergedDataSources"
    :font-provider="playgroundFontProvider"
    :locale="designerLocale"
    :preference-provider="preferenceProvider"
    :runtime-config="runtimeConfig"
    :auto-save="autoSaveOptions"
    :contributions="contributions"
  >
    <template #topbar>
      <div data-easyink-topbar class="flex h-12 items-center gap-2 overflow-x-auto bg-background px-3 shadow-[0_1px_18px_rgba(15,23,42,0.08)]">
        <div class="flex min-w-0 shrink-0 items-center gap-2">
          <div class="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
            <LayoutTemplate class="size-4" />
          </div>
          <Button
            variant="ghost"
            size="sm"
            class="min-w-0 max-w-[42vw] justify-start bg-muted/70 px-2.5 font-semibold hover:bg-muted sm:max-w-[280px]"
            @click="showTemplateGallery = true"
          >
            <span class="truncate">{{ topbarLabel }}</span>
            <ChevronDown class="size-3.5 text-muted-foreground" />
          </Button>
          <Button
            v-if="previewingSample"
            variant="secondary"
            size="sm"
            class="h-8 px-2.5"
            @click="handleSavePreviewAsTemplate"
          >
            <Save class="size-3.5" />
            另存为我的模板
          </Button>
        </div>
        <div class="flex-1" />
        <div class="flex shrink-0 items-center gap-1 rounded-md bg-muted/70 p-1">
          <Button variant="ghost" size="sm" class="h-7 px-2 text-muted-foreground hover:text-foreground" @click="openDocumentation">
            <BookOpen class="size-3.5" />
            文档
          </Button>
          <Button variant="ghost" size="icon-sm" class="size-7 text-muted-foreground hover:text-foreground" title="GitHub" aria-label="GitHub" @click="openGitHub">
            <Github class="size-4" />
          </Button>
        </div>
        <div class="flex shrink-0 items-center gap-1 rounded-md bg-muted/70 p-1">
          <Button variant="ghost" size="sm" class="h-7 px-2 text-muted-foreground hover:text-foreground" @click="localeCode = localeCode === 'zh-CN' ? 'en-US' : 'zh-CN'">
            <Languages class="size-3.5" />
            {{ localeToggleLabel }}
          </Button>
          <Button variant="ghost" size="sm" class="h-7 px-2 text-muted-foreground hover:text-foreground" @click="openDataEditor">
            <Database class="size-3.5" />
            数据
          </Button>
        </div>
        <Button size="sm" class="h-9 shrink-0 px-3.5 shadow-sm" @click="openPreview">
          <Eye class="size-3.5" />
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
