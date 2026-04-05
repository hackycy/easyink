<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()
const canUndo = ref(false)
const canRedo = ref(false)
const undoDesc = ref<string>()
const redoDesc = ref<string>()

const dispose = store.commands.onChange(() => {
  canUndo.value = store.commands.canUndo
  canRedo.value = store.commands.canRedo
  undoDesc.value = store.commands.undoDescription
  redoDesc.value = store.commands.redoDescription
})

watchEffect((onCleanup) => {
  onCleanup(dispose)
})
</script>

<template>
  <div class="ei-history-panel">
    <div class="ei-history-panel__actions">
      <button
        class="ei-history-panel__btn"
        :disabled="!canUndo"
        @click="store.commands.undo()"
      >
        {{ store.t('designer.toolbar.undo') }}
      </button>
      <button
        class="ei-history-panel__btn"
        :disabled="!canRedo"
        @click="store.commands.redo()"
      >
        {{ store.t('designer.toolbar.redo') }}
      </button>
    </div>
    <div class="ei-history-panel__status">
      <template v-if="undoDesc">
        {{ store.t('designer.history.current') }}: {{ undoDesc }}
      </template>
      <template v-else>
        {{ store.t('designer.history.empty') }}
      </template>
    </div>
  </div>
</template>

<style scoped>
.ei-history-panel {
  font-size: 12px;
  padding: 8px;
}

.ei-history-panel__actions {
  display: flex;
  gap: 4px;
  margin-bottom: 8px;
}

.ei-history-panel__btn {
  flex: 1;
  padding: 4px 8px;
  font-size: 12px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 3px;
  background: var(--ei-bg, #fff);
  cursor: pointer;
}

.ei-history-panel__btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.ei-history-panel__btn:not(:disabled):hover {
  background: var(--ei-hover-bg, #f0f0f0);
}

.ei-history-panel__status {
  color: var(--ei-text-secondary, #999);
  text-align: center;
  padding: 12px;
}
</style>
