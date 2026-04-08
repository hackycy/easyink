<script setup lang="ts">
import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import { IconChevronRight, IconDatabase } from '@easyink/icons'
import { computed, reactive, watch } from 'vue'
import { useDesignerStore } from '../composables'
import DataFieldTreeNode from './datasource/DataFieldTreeNode.vue'

const store = useDesignerStore()

const sources = computed<DataSourceDescriptor[]>(() => {
  return store.dataSourceRegistry.getSources()
})

const hasData = computed(() => sources.value.length > 0)

const expandedKeys = reactive(new Set<string>())

function isExpanded(key: string): boolean {
  return expandedKeys.has(key)
}

function toggleExpand(key: string) {
  if (expandedKeys.has(key))
    expandedKeys.delete(key)
  else
    expandedKeys.add(key)
}

function initFieldExpand(sourceId: string, fields: DataFieldNode[]) {
  for (const field of fields) {
    if (field.expand)
      expandedKeys.add(`${sourceId}:${field.path || field.name}`)
    if (field.fields)
      initFieldExpand(sourceId, field.fields)
  }
}

// Initialize expand state when sources first become available
watch(sources, (s) => {
  for (const source of s) {
    // Default sources to expanded unless explicitly set to false
    if (source.expand !== false && !expandedKeys.has(source.id))
      expandedKeys.add(source.id)
    if (source.fields)
      initFieldExpand(source.id, source.fields)
  }
}, { immediate: true })

function childKey(source: DataSourceDescriptor, child: DataFieldNode): string {
  return `${source.id}:${child.path || child.name}`
}
</script>

<template>
  <div class="ei-datasource-panel">
    <div v-if="hasData" class="ei-datasource-panel__list">
      <div
        v-for="source in sources"
        :key="source.id"
        class="ei-datasource-panel__source"
      >
        <!-- Source header -->
        <div
          class="ei-datasource-panel__source-header"
          @click="toggleExpand(source.id)"
        >
          <IconChevronRight
            :size="14"
            :stroke-width="1.5"
            class="ei-datasource-panel__chevron"
            :class="{ 'ei-datasource-panel__chevron--expanded': isExpanded(source.id) }"
          />
          <IconDatabase :size="14" :stroke-width="1.5" class="ei-datasource-panel__source-icon" />
          <span class="ei-datasource-panel__source-name">{{ source.title || source.name }}</span>
        </div>

        <!-- Source body (fields tree) -->
        <div v-if="isExpanded(source.id) && source.fields.length > 0" class="ei-datasource-panel__source-body">
          <DataFieldTreeNode
            v-for="child in source.fields"
            :key="childKey(source, child)"
            :field="child"
            :source="source"
            :depth="0"
            :toggle-expand="toggleExpand"
            :is-expanded="isExpanded"
          />
        </div>
      </div>
    </div>
    <div v-else class="ei-datasource-panel__empty">
      {{ store.t('designer.dataSource.empty') }}
    </div>
    <div class="ei-datasource-panel__hint">
      {{ store.t('designer.dataSource.dragHint') }}
    </div>
  </div>
</template>

<style scoped>
.ei-datasource-panel {
  font-size: 12px;
}

.ei-datasource-panel__source {
  margin-bottom: 4px;
}

.ei-datasource-panel__source-header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 4px 4px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 3px;
  user-select: none;
  color: var(--ei-text, #333);
}

.ei-datasource-panel__source-header:hover {
  background: var(--ei-hover-bg, #f0f0f0);
}

.ei-datasource-panel__chevron {
  flex-shrink: 0;
  color: var(--ei-text-secondary, #999);
  transition: transform 0.15s ease;
}

.ei-datasource-panel__chevron--expanded {
  transform: rotate(90deg);
}

.ei-datasource-panel__source-icon {
  flex-shrink: 0;
  color: var(--ei-text-secondary, #999);
}

.ei-datasource-panel__source-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ei-datasource-panel__source-body {
  padding-left: 16px;
}

.ei-datasource-panel__empty {
  color: var(--ei-text-secondary, #999);
  text-align: center;
  padding: 20px;
}

.ei-datasource-panel__hint {
  color: var(--ei-text-secondary, #999);
  font-size: 11px;
  text-align: center;
  padding: 8px;
  border-top: 1px solid var(--ei-border-color, #eee);
  margin-top: 4px;
}
</style>
