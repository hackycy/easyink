<script setup lang="ts">
import type { SampleTemplateEntry } from '@easyink/samples'
import type { StoredTemplate } from '../storage/template-store'
import { sampleTemplates } from '@easyink/samples'
import { computed, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { deleteTemplate, listTemplates } from '../storage/template-store'

defineProps<{
  currentId?: string
}>()

const emit = defineEmits<{
  select: [template: StoredTemplate]
  previewSample: [sample: SampleTemplateEntry]
  createBlank: []
  duplicate: [template: StoredTemplate]
  close: []
}>()

const userTemplates = ref<StoredTemplate[]>([])
const loading = ref(true)
const activeTab = ref<'all' | 'my' | 'samples'>('all')

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
    size: `${s.schema.page.width}x${s.schema.page.height} ${s.schema.unit}`,
    page: s.schema.page,
  })),
)

const tabs = computed(() => [
  { id: 'all' as const, label: '全部' },
  { id: 'my' as const, label: '我的模板', count: userTemplates.value.length || undefined },
  { id: 'samples' as const, label: '示例模板', count: sampleEntries.value.length || undefined },
])

function handleSelectSample(sampleId: string) {
  const sample = sampleTemplates.find(s => s.id === sampleId)
  if (!sample)
    return
  emit('previewSample', sample)
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

function getModeLabel(mode: string): string {
  const map: Record<string, string> = { fixed: '固定', stack: '流式', label: '标签' }
  return map[mode] ?? mode
}

function getPaperStyle(page: { width: number, height: number }): Record<string, string> {
  const ratio = page.height / page.width
  const maxW = 52
  const maxH = 82
  let w = maxW
  let h = maxW * ratio
  if (h > maxH) {
    h = maxH
    w = maxH / ratio
  }
  return { width: `${Math.round(w)}px`, height: `${Math.round(h)}px` }
}

const open = ref(true)

function handleOpenChange(val: boolean) {
  if (!val)
    emit('close')
}
</script>

<template>
  <Dialog :open="open" @update:open="handleOpenChange">
    <DialogContent
      class="max-w-[860px] p-0 gap-0 overflow-hidden"
      sr-title="模板库"
      sr-description="选择我的模板、预览示例模板或创建新模板"
    >
      <div class="flex h-[560px]">
        <!-- Sidebar -->
        <nav class="w-[164px] shrink-0 border-r border-border flex flex-col p-2.5 bg-muted/20">
          <p class="px-2 pt-1 pb-2 text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
            模板库
          </p>
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="flex items-center justify-between px-2 py-1.5 rounded-md text-[13px] text-left w-full transition-colors"
            :class="activeTab === tab.id
              ? 'bg-primary/10 text-primary font-medium'
              : 'text-foreground/70 hover:bg-muted hover:text-foreground'"
            @click="activeTab = tab.id"
          >
            <span>{{ tab.label }}</span>
            <span v-if="tab.count !== undefined" class="text-[11px] tabular-nums opacity-50">{{ tab.count }}</span>
          </button>
          <div class="flex-1" />
          <Button size="sm" class="w-full" @click="emit('createBlank')">
            新建空白
          </Button>
        </nav>

        <!-- Main content -->
        <div class="flex-1 flex flex-col min-w-0">
          <!-- Header — leave right padding for the auto-injected close button -->
          <div class="px-5 py-3 pr-12 border-b border-border shrink-0">
            <span class="text-[15px] font-semibold leading-none">
              {{ tabs.find(t => t.id === activeTab)?.label }}
            </span>
          </div>

          <!-- Scrollable grid -->
          <div class="flex-1 overflow-y-auto p-4">
            <!-- My templates section -->
            <template v-if="activeTab !== 'samples'">
              <template v-if="loading">
                <div class="text-sm text-muted-foreground py-4">
                  加载中...
                </div>
              </template>
              <template v-else-if="userTemplates.length > 0">
                <div v-if="activeTab === 'all'" class="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
                  我的模板
                </div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 mb-6">
                  <div
                    v-for="t in userTemplates"
                    :key="t.id"
                    class="group relative rounded-lg border cursor-pointer overflow-hidden transition-all duration-150 bg-card hover:shadow-sm"
                    :class="t.id === currentId
                      ? 'border-primary ring-1 ring-primary'
                      : 'border-border hover:border-primary/60'"
                    @click="handleSelectUser(t)"
                  >
                    <!-- Thumbnail -->
                    <div class="h-[118px] bg-muted/40 flex items-center justify-center relative">
                      <div
                        class="bg-background border border-border/70 rounded-[2px] shadow-sm"
                        :style="getPaperStyle(t.schema.page)"
                      />
                      <span class="absolute top-2 left-2 text-[10px] bg-background/90 border border-border/40 text-muted-foreground px-1.5 py-0.5 rounded-sm leading-none">
                        {{ getModeLabel(t.schema.page.mode) }}
                      </span>
                      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/[0.04] transition-colors" />
                      <!-- Hover actions -->
                      <div class="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="secondary" size="xs" class="h-5 text-[11px] px-1.5 shadow-sm" @click.stop="handleDuplicate(t, $event)">
                          复制
                        </Button>
                        <Button variant="destructive" size="xs" class="h-5 text-[11px] px-1.5 shadow-sm text-white" @click.stop="handleDelete(t, $event)">
                          删除
                        </Button>
                      </div>
                    </div>
                    <!-- Info -->
                    <div class="px-2.5 py-2">
                      <div class="text-[13px] font-medium truncate leading-snug">
                        {{ t.name }}
                      </div>
                      <div class="text-[11px] text-muted-foreground mt-0.5">
                        {{ t.schema.page.width }}×{{ t.schema.page.height }} {{ t.schema.unit }}
                      </div>
                    </div>
                  </div>
                </div>
              </template>
              <template v-else-if="activeTab === 'my'">
                <div class="flex flex-col items-center justify-center h-52 text-center">
                  <div class="text-sm text-muted-foreground">
                    暂无模板
                  </div>
                  <div class="text-xs text-muted-foreground/50 mt-1">
                    点击左侧「新建空白」创建
                  </div>
                </div>
              </template>
            </template>

            <!-- Sample templates section -->
            <template v-if="activeTab !== 'my'">
              <div v-if="activeTab === 'all' && userTemplates.length > 0" class="text-[11px] font-semibold text-muted-foreground/60 uppercase tracking-wider mb-3">
                示例模板
              </div>
              <div class="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
                <div
                  v-for="s in sampleEntries"
                  :key="s.id"
                  class="group relative rounded-lg border border-border bg-card cursor-pointer overflow-hidden transition-all duration-150 hover:border-primary/60 hover:shadow-sm"
                  @click="handleSelectSample(s.id)"
                >
                  <!-- Thumbnail -->
                  <div class="h-[118px] bg-muted/40 flex items-center justify-center relative">
                    <div
                      class="bg-background border border-border/70 rounded-[2px] shadow-sm"
                      :style="getPaperStyle(s.page)"
                    />
                    <span class="absolute top-2 left-2 text-[10px] bg-background/90 border border-border/40 text-muted-foreground px-1.5 py-0.5 rounded-sm leading-none">
                      {{ getModeLabel(s.mode) }}
                    </span>
                    <div class="absolute inset-0 bg-black/0 group-hover:bg-black/[0.04] transition-colors" />
                  </div>
                  <!-- Info -->
                  <div class="px-2.5 py-2">
                    <div class="text-[13px] font-medium truncate leading-snug">
                      {{ s.name }}
                    </div>
                    <div class="text-[11px] text-muted-foreground mt-0.5">
                      {{ s.size }}
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
