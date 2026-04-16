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
  <div class="tg-overlay" @click="handleOverlayClick">
    <div class="tg-modal">
      <div class="tg-header">
        <h2 class="tg-title">选择模板</h2>
        <div class="tg-header-actions">
          <button class="tg-btn tg-btn--primary" @click="emit('createBlank')">
            新建空白
          </button>
          <button class="tg-close" @click="emit('close')">
            &times;
          </button>
        </div>
      </div>

      <div class="tg-body">
        <!-- 我的模板 -->
        <section v-if="userTemplates.length > 0" class="tg-section">
          <h3 class="tg-section-title">我的模板</h3>
          <div class="tg-grid">
            <div
              v-for="t in userTemplates"
              :key="t.id"
              class="tg-card"
              :class="{ 'tg-card--active': t.id === currentId }"
              @click="handleSelectUser(t)"
            >
              <div class="tg-card-preview">
                <span class="tg-card-mode">{{ getModeLabel(t.schema.page.mode) }}</span>
              </div>
              <div class="tg-card-info">
                <span class="tg-card-name">{{ t.name }}</span>
                <span class="tg-card-meta">{{ t.schema.page.width }}x{{ t.schema.page.height }}{{ t.schema.unit }}</span>
                <span class="tg-card-date">{{ formatDate(t.updatedAt) }}</span>
              </div>
              <div class="tg-card-actions">
                <button class="tg-card-btn" title="复制" @click="handleDuplicate(t, $event)">
                  复制
                </button>
                <button class="tg-card-btn tg-card-btn--danger" title="删除" @click="handleDelete(t, $event)">
                  删除
                </button>
              </div>
            </div>
          </div>
        </section>

        <!-- 示例模板 -->
        <section class="tg-section">
          <h3 class="tg-section-title">示例模板</h3>
          <div class="tg-grid">
            <div
              v-for="s in sampleEntries"
              :key="s.id"
              class="tg-card"
              @click="handleSelectSample(s.id)"
            >
              <div class="tg-card-preview">
                <span class="tg-card-mode">{{ getModeLabel(s.mode) }}</span>
              </div>
              <div class="tg-card-info">
                <span class="tg-card-name">{{ s.name }}</span>
                <span class="tg-card-meta">{{ s.size }}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tg-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.45);
}

.tg-modal {
  width: 720px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.tg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.tg-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #1a1a1a;
}

.tg-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tg-close {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  font-size: 20px;
  color: #999;
  cursor: pointer;
  border-radius: 4px;
}

.tg-close:hover {
  background: #f0f0f0;
  color: #333;
}

.tg-btn {
  padding: 6px 14px;
  font-size: 13px;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  color: #333;
}

.tg-btn:hover {
  background: #f5f5f5;
}

.tg-btn--primary {
  background: #1677ff;
  border-color: #1677ff;
  color: #fff;
}

.tg-btn--primary:hover {
  background: #4096ff;
  border-color: #4096ff;
}

.tg-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

.tg-section {
  margin-bottom: 20px;
}

.tg-section:last-child {
  margin-bottom: 0;
}

.tg-section-title {
  margin: 0 0 12px;
  font-size: 13px;
  font-weight: 600;
  color: #666;
}

.tg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.tg-card {
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.tg-card:hover {
  border-color: #1677ff;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.1);
}

.tg-card--active {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgba(22, 119, 255, 0.2);
}

.tg-card-preview {
  height: 100px;
  background: #f7f8fa;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.tg-card-mode {
  position: absolute;
  top: 6px;
  right: 6px;
  padding: 1px 6px;
  font-size: 11px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 3px;
  color: #666;
}

.tg-card-info {
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tg-card-name {
  font-size: 13px;
  font-weight: 500;
  color: #1a1a1a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tg-card-meta {
  font-size: 11px;
  color: #999;
}

.tg-card-date {
  font-size: 11px;
  color: #bbb;
}

.tg-card-actions {
  padding: 4px 10px 8px;
  display: flex;
  gap: 6px;
}

.tg-card-btn {
  padding: 2px 8px;
  font-size: 11px;
  border: 1px solid #d0d0d0;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  color: #666;
}

.tg-card-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.tg-card-btn--danger:hover {
  color: #ff4d4f;
  border-color: #ff4d4f;
  background: #fff2f0;
}
</style>
