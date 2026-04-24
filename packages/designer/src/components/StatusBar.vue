<script setup lang="ts">
import type { Component } from 'vue'
import {
  IconCheck,
  IconCircleAlert,
  IconCircleDot,
  IconFileCheck,
  IconFilePen,
  IconLoader,
  IconMessageSquare,
  IconMonitor,
  IconPanelLeft,
  IconSave,
  IconWifi,
  IconWifiOff,
} from '@easyink/icons'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

const status = computed(() => store.workbench.status)

const focusIconMap: Record<string, Component> = {
  canvas: IconMonitor,
  panel: IconPanelLeft,
  dialog: IconMessageSquare,
  none: IconCircleDot,
}

const networkIconMap: Record<string, Component> = {
  idle: IconWifi,
  loading: IconLoader,
  error: IconWifiOff,
}

const draftIconMap: Record<string, Component> = {
  clean: IconFileCheck,
  modified: IconFilePen,
}

const autoSaveIconMap: Record<string, Component> = {
  saving: IconSave,
  success: IconCheck,
  failed: IconCircleAlert,
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function statusTitle(prefix: string, value: string): string {
  return store.t(`designer.status.${prefix}${capitalize(value)}`)
}
</script>

<template>
  <div class="ei-status-bar">
    <span class="ei-status-bar__item" :title="statusTitle('focus', status.focus)">
      <component :is="focusIconMap[status.focus]" :size="12" />
    </span>
    <span
      class="ei-status-bar__item"
      :class="{ 'ei-status-bar__item--error': status.network === 'error' }"
      :title="statusTitle('network', status.network)"
    >
      <component
        :is="networkIconMap[status.network]"
        :size="12"
        :class="{ 'ei-status-bar__spin': status.network === 'loading' }"
      />
    </span>
    <span
      class="ei-status-bar__item"
      :class="{ 'ei-status-bar__item--warning': status.draft === 'modified' }"
      :title="statusTitle('draft', status.draft)"
    >
      <component :is="draftIconMap[status.draft]" :size="12" />
    </span>
    <span
      v-if="status.autoSave !== 'idle'"
      class="ei-status-bar__item"
      :class="{
        'ei-status-bar__item--success': status.autoSave === 'success',
        'ei-status-bar__item--error': status.autoSave === 'failed',
      }"
      :title="status.autoSaveMessage || statusTitle('autoSave', status.autoSave)"
    >
      <component
        :is="autoSaveIconMap[status.autoSave]"
        :size="12"
        :class="{ 'ei-status-bar__spin': status.autoSave === 'saving' }"
      />
    </span>
    <span class="ei-status-bar__spacer" />
    <span class="ei-status-bar__item">
      {{ store.schema.unit }}
    </span>
    <span class="ei-status-bar__item">
      {{ store.schema.page.width }} x {{ store.schema.page.height }}
    </span>
    <span class="ei-status-bar__item">
      {{ Math.round(store.workbench.viewport.zoom * 100) }}%
    </span>
  </div>
</template>

<style scoped>
.ei-status-bar {
  display: flex;
  align-items: center;
  height: 24px;
  padding: 0 12px;
  border-top: 1px solid var(--ei-border-color, #e0e0e0);
  background: var(--ei-statusbar-bg, #f5f5f5);
  font-size: 11px;
  color: var(--ei-text-secondary, #999);
  gap: 12px;
  flex-shrink: 0;
}

.ei-status-bar__spacer {
  flex: 1;
}

.ei-status-bar__item {
  display: flex;
  align-items: center;
  user-select: none;
}

.ei-status-bar__item--error {
  color: var(--ei-error, #ff4d4f);
}

.ei-status-bar__item--warning {
  color: var(--ei-warning, #faad14);
}

.ei-status-bar__item--success {
  color: var(--ei-success, #52c41a);
}

@keyframes ei-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.ei-status-bar__spin {
  animation: ei-spin 1s linear infinite;
}
</style>
