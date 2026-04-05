<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

const schemaJson = computed(() => {
  return JSON.stringify(store.schema, null, 2)
})

const elementCount = computed(() => store.getElements().length)
const selectedCount = computed(() => store.selection.count)
</script>

<template>
  <div class="ei-debug-panel">
    <div class="ei-debug-panel__stats">
      <div>Elements: {{ elementCount }}</div>
      <div>Selected: {{ selectedCount }}</div>
      <div>Version: {{ store.schema.version }}</div>
      <div>Unit: {{ store.schema.unit }}</div>
      <div>Mode: {{ store.schema.page.mode }}</div>
    </div>
    <details class="ei-debug-panel__schema">
      <summary>{{ store.t('designer.debug.schema') }}</summary>
      <pre class="ei-debug-panel__code">{{ schemaJson }}</pre>
    </details>
  </div>
</template>

<style scoped>
.ei-debug-panel {
  font-size: 11px;
  padding: 8px;
}

.ei-debug-panel__stats {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 8px;
  color: var(--ei-text-secondary, #666);
}

.ei-debug-panel__schema summary {
  cursor: pointer;
  color: var(--ei-text, #333);
  font-weight: 500;
  margin-bottom: 4px;
}

.ei-debug-panel__code {
  max-height: 300px;
  overflow: auto;
  background: var(--ei-canvas-bg, #f5f5f5);
  padding: 8px;
  border-radius: 3px;
  font-family: monospace;
  font-size: 10px;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
