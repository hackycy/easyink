<script setup lang="ts">
import { IconCheck, IconClose, IconCopy } from '@easyink/icons'
import { computed, ref } from 'vue'

const props = defineProps<{
  title?: string
  data: unknown
}>()

const emit = defineEmits<{
  close: []
}>()

const copied = ref(false)

const json = computed(() => {
  try {
    return JSON.stringify(props.data, null, 2)
  }
  catch {
    return String(props.data)
  }
})

function copy() {
  if (typeof navigator === 'undefined' || !navigator.clipboard)
    return
  navigator.clipboard.writeText(json.value).catch(() => {})
  copied.value = true
  setTimeout(() => {
    copied.value = false
  }, 1200)
}
</script>

<template>
  <div class="ai-json" @click.self="emit('close')">
    <div class="ai-json__panel">
      <div class="ai-json__header">
        <h4>{{ title ?? 'Schema 详情' }}</h4>
        <div class="ai-json__actions">
          <button class="ai-json__btn" :title="copied ? '已复制' : '复制 JSON'" @click="copy">
            <IconCheck v-if="copied" :size="14" />
            <IconCopy v-else :size="14" />
          </button>
          <button class="ai-json__btn" title="关闭" @click="emit('close')">
            <IconClose :size="14" />
          </button>
        </div>
      </div>
      <pre class="ai-json__pre">{{ json }}</pre>
    </div>
  </div>
</template>

<style scoped>
.ai-json {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.ai-json__panel {
  width: 720px;
  max-width: 92vw;
  height: 80vh;
  background: var(--ei-bg, #fff);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-json__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--ei-border, #e5e7eb);
}

.ai-json__header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--ei-text, #111827);
}

.ai-json__actions { display: flex; gap: 4px; }

.ai-json__btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 6px;
  border-radius: 4px;
  color: var(--ei-text-secondary, #6b7280);
  display: flex;
}

.ai-json__btn:hover {
  background: var(--ei-bg-hover, #f3f4f6);
  color: var(--ei-primary, #4f46e5);
}

.ai-json__pre {
  flex: 1;
  overflow: auto;
  margin: 0;
  padding: 16px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--ei-text, #111827);
  background: var(--ei-bg-secondary, #f9fafb);
}
</style>
