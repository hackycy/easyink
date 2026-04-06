<script setup lang="ts">
import { ref } from 'vue'
import { IconClose, IconDown, IconUp } from '@easyink/icons'

const props = defineProps<{
  title: string
  collapsible?: boolean
  closable?: boolean
  flat?: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const collapsed = ref(false)
</script>

<template>
  <div class="ei-panel" :class="{ 'ei-panel--collapsed': collapsed, 'ei-panel--flat': flat }">
    <div class="ei-panel__header">
      <span class="ei-panel__title">{{ title }}</span>
      <div class="ei-panel__actions">
        <button
          v-if="collapsible"
          class="ei-panel__action"
          @click="collapsed = !collapsed"
        >
          <IconUp v-if="collapsed" :size="14" />
          <IconDown v-else :size="14" />
        </button>
        <button
          v-if="closable"
          class="ei-panel__action"
          @click="emit('close')"
        >
          <IconClose :size="14" />
        </button>
      </div>
    </div>
    <div v-show="!collapsed" class="ei-panel__body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.ei-panel {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  background: var(--ei-panel-bg, #fff);
  overflow: hidden;
}

.ei-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--ei-panel-header-bg, #fafafa);
  user-select: none;
}

.ei-panel__title {
  font-size: 12px;
  font-weight: 500;
  color: var(--ei-text, #666);
}

.ei-panel__actions {
  display: flex;
  gap: 4px;
}

.ei-panel__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--ei-text-secondary, #999);
  line-height: 1;
  border-radius: 2px;
}

.ei-panel__action:hover {
  background: var(--ei-hover-bg, #e8e8e8);
  color: var(--ei-text, #333);
}

.ei-panel__body {
  padding: 8px;
  overflow: auto;
}

.ei-panel--collapsed .ei-panel__header {
  border-bottom: none;
}

.ei-panel--flat {
  border: none;
  border-radius: 0;
}

.ei-panel--flat .ei-panel__header {
  padding: 6px 0;
  background: transparent;
  border-bottom-color: var(--ei-border-color, #d0d0d0);
}

.ei-panel--flat .ei-panel__body {
  padding: 8px 0;
}
</style>
