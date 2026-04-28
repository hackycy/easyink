<script setup lang="ts">
import type { StoredTemplate } from '../storage/template-store'
import { IconClose, IconCopy, IconDelete, IconPlus } from '@easyink/icons'
import { sampleTemplates } from '@easyink/samples'
import { computed, onMounted, ref } from 'vue'
import { deleteTemplate, listTemplates } from '../storage/template-store'

defineProps<{
  currentId?: string
}>()

const emit = defineEmits<{
  select: [template: StoredTemplate, demoData?: Record<string, unknown>]
  createBlank: []
  duplicate: [template: StoredTemplate]
  close: []
}>()

const userTemplates = ref<StoredTemplate[]>([])
const loading = ref(true)

// Pending sample selection waiting for confirm
const pending = ref<{ template: StoredTemplate, demoData: Record<string, unknown> } | null>(null)

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
  const template: StoredTemplate = {
    id: `user-${now}`,
    name: `${sample.name} (副本)`,
    category: sample.category,
    schema: JSON.parse(JSON.stringify(sample.schema)),
    createdAt: now,
    updatedAt: now,
    fromSample: sample.id,
  }

  if (sample.demoData && Object.keys(sample.demoData).length > 0) {
    pending.value = { template, demoData: sample.demoData }
  }
  else {
    emit('select', template)
  }
}

function confirmUseDemoData() {
  if (!pending.value)
    return
  emit('select', pending.value.template, pending.value.demoData)
  pending.value = null
}

function confirmKeepCurrentData() {
  if (!pending.value)
    return
  emit('select', pending.value.template)
  pending.value = null
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
  <a-modal
    :open="true"
    title="选择模板"
    width="720px"
    :footer="null"
    @cancel="emit('close')"
  >
    <template #extra>
      <a-button type="primary" @click="emit('createBlank')">
        <template #icon>
          <IconPlus :size="16" />
        </template>
        新建空白
      </a-button>
    </template>

    <div class="max-h-[60vh] overflow-y-auto">
      <section v-if="userTemplates.length > 0" class="mb-5 last:mb-0">
        <h3 class="m-0 mb-3 text-[13px] font-semibold text-text-tertiary">
          我的模板
        </h3>
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
              <a-button size="small" @click="handleDuplicate(t, $event)">
                <template #icon>
                  <IconCopy :size="12" />
                </template>
                复制
              </a-button>
              <a-button size="small" danger @click="handleDelete(t, $event)">
                <template #icon>
                  <IconDelete :size="12" />
                </template>
                删除
              </a-button>
            </div>
          </div>
        </div>
      </section>

      <section class="mb-5 last:mb-0">
        <h3 class="m-0 mb-3 text-[13px] font-semibold text-text-tertiary">
          示例模板
        </h3>
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

    <!-- Confirm dialog: reset data? -->
    <a-modal
      v-if="pending"
      :open="true"
      title="是否使用示例数据？"
      width="400px"
      @cancel="pending = null"
      @ok="confirmUseDemoData"
    >
      <p class="m-0 text-[13px] text-text-tertiary leading-relaxed">
        该模板附带示例数据,可直接看到真实打印效果。使用后将替换当前数据编辑器中的内容。
      </p>
      <template #footer>
        <a-button @click="confirmKeepCurrentData">
          保留当前数据
        </a-button>
        <a-button type="primary" @click="confirmUseDemoData">
          使用示例数据
        </a-button>
      </template>
    </a-modal>
  </a-modal>
</template>
