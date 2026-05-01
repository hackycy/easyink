<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

const schemaJson = computed(() => {
  return JSON.stringify(store.schema, null, 2)
})

const elementCount = computed(() => store.getElements().length)
const selectedCount = computed(() => store.selection.count)

// Recoverable-error feed (audit/202605011431.md item 4). Show newest first
// so problems surface immediately when the panel opens.
const diagnostics = computed(() => [...store.diagnostics.entries].reverse())

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ts % 1000}`
}

function clearDiagnostics() {
  store.diagnostics.clear()
}
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
    <details class="ei-debug-panel__diagnostics" open>
      <summary>
        Diagnostics ({{ diagnostics.length }})
        <button v-if="diagnostics.length" type="button" class="ei-debug-panel__clear" @click="clearDiagnostics">
          clear
        </button>
      </summary>
      <ul v-if="diagnostics.length" class="ei-debug-panel__diag-list">
        <li
          v-for="d in diagnostics"
          :key="d.id"
          class="ei-debug-panel__diag-item"
          :class="`ei-debug-panel__diag-item--${d.severity}`"
        >
          <div class="ei-debug-panel__diag-head">
            <span class="ei-debug-panel__diag-time">{{ formatTime(d.timestamp) }}</span>
            <span class="ei-debug-panel__diag-source">{{ d.source }}</span>
            <span class="ei-debug-panel__diag-sev">{{ d.severity }}</span>
          </div>
          <div class="ei-debug-panel__diag-msg">
            {{ d.message }}
          </div>
          <pre v-if="d.detail" class="ei-debug-panel__diag-detail">{{ JSON.stringify(d.detail, null, 2) }}</pre>
        </li>
      </ul>
      <div v-else class="ei-debug-panel__diag-empty">
        No diagnostics recorded.
      </div>
    </details>
    <details class="ei-debug-panel__schema">
      <summary>{{ store.t('designer.debug.schema') }}</summary>
      <pre class="ei-debug-panel__code">{{ schemaJson }}</pre>
    </details>
  </div>
</template>

<style scoped lang="scss">
.ei-debug-panel {
  font-size: 11px;
  padding: 8px;

  &__stats {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 8px;
    color: var(--ei-text-secondary, #666);
  }

  &__diagnostics,
  &__schema {
    summary {
      cursor: pointer;
      color: var(--ei-text, #333);
      font-weight: 500;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
  }

  &__clear {
    margin-left: auto;
    border: 1px solid var(--ei-border-color, #d0d0d0);
    background: transparent;
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 10px;
    cursor: pointer;
  }

  &__diag-list {
    list-style: none;
    padding: 0;
    margin: 0 0 8px 0;
    max-height: 240px;
    overflow: auto;
  }

  &__diag-item {
    border-left: 3px solid var(--ei-border-color, #d0d0d0);
    background: var(--ei-canvas-bg, #f5f5f5);
    padding: 4px 6px;
    margin-bottom: 4px;
    border-radius: 0 3px 3px 0;

    &--error {
      border-left-color: #d4380d;
    }

    &--warn {
      border-left-color: #d48806;
    }

    &--info {
      border-left-color: #1890ff;
    }
  }

  &__diag-head {
    display: flex;
    gap: 6px;
    color: var(--ei-text-secondary, #999);
    font-size: 10px;
    font-family: monospace;
  }

  &__diag-msg {
    color: var(--ei-text, #333);
    margin: 2px 0;
  }

  &__diag-detail {
    background: rgba(0, 0, 0, 0.04);
    padding: 4px 6px;
    border-radius: 2px;
    font-family: monospace;
    font-size: 10px;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 2px 0 0 0;
  }

  &__diag-empty {
    color: var(--ei-text-secondary, #999);
    font-style: italic;
    padding: 4px 0 8px 0;
  }

  &__code {
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
}
</style>
