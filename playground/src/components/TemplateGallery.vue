<script setup lang="ts">
import type { StoredTemplate } from '../storage/template-store'
import { computed, onMounted, ref } from 'vue'
import { sampleTemplates } from '@easyink/samples'
import { deleteTemplate, listTemplates } from '../storage/template-store'

const props = defineProps<{
  currentId?: string
}>()

const emit = defineEmits<{
  select: [template: StoredTemplate]
  createBlank: []
  duplicate: [template: StoredTemplate]
  close: []
}>()

const userTemplates = ref<StoredTemplate[]>([])
const loading = ref(true)

onMounted(async () => {
  userTemplates.value = await listTemplates()
  loading.value = false
})

const sampleEntries = computed(() =>
  sampleTemplates.map(s => ({
    id: s.id,
    name: s.name,
    category: s.category,
    mode: s.schema.page.mode,
    size: `${s.schema.page.width}x${s.schema.page.height}${s.schema.unit}`,
    isSample: true as const,
  })),
)

function handleSelectSample(sampleId: string) {
  const sample = sampleTemplates.find(s => s.id === sampleId)
  if (!sample)
    return

  const now = Date.now()
  emit('select', {
    id: `user-${now}`,
    name: `${sample.name} (副本)`,
    category: sample.category,
    schema: JSON.parse(JSON.stringify(sample.schema)),
    createdAt: now,
    updatedAt: now,
    fromSample: sample.id,
  })
}

function handleSelectUser(template: StoredTemplate) {
  emit('select', template)
}

function handleDuplicate(template: StoredTemplate, event: Event) {
  event.stopPropagation()
  emit('duplicate', template)
}

async function handleDelete(template: StoredTemplate, event: Event) {
  event.stopPropagation()
  await deleteTemplate(template.id)
  userTemplates.value = userTemplates.value.filter(t => t.id !== template.id)
}

function handleOverlayClick(event: Event) {
  if (event.target === event.currentTarget) {
    emit('close')
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function getModeLabel(mode: string): string {
  const map: Record<string, string> = { fixed: '固定', stack: '流式', label: '标签' }
  return map[mode] ?? mode
}
</script>

<template>
  <div class="fixed inset-0 z-[10000] flex items-center justify-center bg-bg-overlay" @click="handleOverlayClick">
    <div class="w-[720px] max-w-[90vw] max-h-[80vh] flex flex-col bg-white rounded-lg shadow-modal">
      <div class="flex items-center justify-between px-5 py-4 border-b border-border-light">
        <h2 class="m-0 text-base font-semibold text-text-primary">选择模板</h2>
        <div class="flex items-center gap-2">
          <button class="px-3.5 py-1.5 text-[13px] border border-primary rounded bg-primary cursor-pointer text-white hover:bg-primary-hover hover:border-primary-hover" @click="emit('createBlank')">
            新建空白
          </button>
          <button class="w-7 h-7 flex items-center justify-center border-none bg-transparent text-xl text-text-quaternary cursor-pointer rounded hover:bg-border-light hover:text-text-secondary" @click="emit('close')">
            &times;
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto px-5 py-4">
        <section v-if="userTemplates.length > 0" class="mb-5 last:mb-0">
          <h3 class="m-0 mb-3 text-[13px] font-semibold text-text-tertiary">我的模板</h3>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            <div
              v-for="t in userTemplates"
              :key="t.id"
              class="border border-border-light rounded-md cursor-pointer overflow-hidden transition-all hover:border-primary hover:shadow-card"
              :class="{ 'border-primary shadow-active': t.id === currentId }"
              @click="handleSelectUser(t)"
            >
              <div class="h-[100px] bg-bg-quaternary flex items-center justify-center relative">
                <span class="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[11px] bg-black/[0.06] rounded-sm text-text-tertiary">{{ getModeLabel(t.schema.page.mode) }}</span>
              </div>
              <div class="px-2.5 py-2 flex flex-col gap-0.5">
                <span class="text-[13px] font-medium text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">{{ t.name }}</span>
                <span class="text-[11px] text-text-quaternary">{{ t.schema.page.width }}x{{ t.schema.page.height }}{{ t.schema.unit }}</span>
                <span class="text-[11px] text-text-disabled">{{ formatDate(t.updatedAt) }}</span>
              </div>
              <div class="px-2.5 pb-2 flex gap-1.5">
                <button class="px-2 py-0.5 text-[11px] border border-border-dark rounded-sm bg-white cursor-pointer text-text-tertiary hover:bg-bg-tertiary hover:text-text-secondary" title="复制" @click="handleDuplicate(t, $event)">
                  复制
                </button>
                <button class="px-2 py-0.5 text-[11px] border border-border-dark rounded-sm bg-white cursor-pointer text-text-tertiary hover:text-danger hover:border-danger hover:bg-danger-bg" title="删除" @click="handleDelete(t, $event)">
                  删除
                </button>
              </div>
            </div>
          </div>
        </section>

        <section class="mb-5 last:mb-0">
          <h3 class="m-0 mb-3 text-[13px] font-semibold text-text-tertiary">示例模板</h3>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
            <div
              v-for="s in sampleEntries"
              :key="s.id"
              class="border border-border-light rounded-md cursor-pointer overflow-hidden transition-all hover:border-primary hover:shadow-card"
              @click="handleSelectSample(s.id)"
            >
              <div class="h-[100px] bg-bg-quaternary flex items-center justify-center relative">
                <span class="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[11px] bg-black/[0.06] rounded-sm text-text-tertiary">{{ getModeLabel(s.mode) }}</span>
              </div>
              <div class="px-2.5 py-2 flex flex-col gap-0.5">
                <span class="text-[13px] font-medium text-text-primary overflow-hidden text-ellipsis whitespace-nowrap">{{ s.name }}</span>
                <span class="text-[11px] text-text-quaternary">{{ s.size }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

