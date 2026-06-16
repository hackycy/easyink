<script setup lang="ts">
import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import { IconChevronRight, IconClose, IconDatabase, IconListCollapse, IconListExpand, IconSearch } from '@easyink/icons'
import { computed, reactive, ref, watch } from 'vue'
import { useDesignerStore } from '../composables'
import DataFieldTreeNode from './datasource/DataFieldTreeNode.vue'

const store = useDesignerStore()
const searchText = ref('')

const sources = computed<DataSourceDescriptor[]>(() => {
  return store.dataSourceRegistry.getSources()
})

const hasData = computed(() => sources.value.length > 0)
const normalizedSearch = computed(() => searchText.value.trim().toLowerCase())
const hasSearch = computed(() => normalizedSearch.value.length > 0)
const displayedSources = computed<DataSourceDescriptor[]>(() => {
  const query = normalizedSearch.value
  if (!query)
    return sources.value

  const result: DataSourceDescriptor[] = []
  for (const source of sources.value) {
    const fields = source.fields ?? []
    if (matchesSource(source, query)) {
      result.push(source)
      continue
    }

    const matchedFields = filterFields(fields, query)
    if (matchedFields.length > 0)
      result.push({ ...source, fields: matchedFields })
  }
  return result
})
const hasVisibleData = computed(() => displayedSources.value.length > 0)

const expandedKeys = reactive(new Set<string>())

function isExpanded(key: string): boolean {
  return expandedKeys.has(key)
}

function isVisibleExpanded(key: string): boolean {
  return isExpanded(key)
}

function toggleExpand(key: string) {
  if (expandedKeys.has(key))
    expandedKeys.delete(key)
  else
    expandedKeys.add(key)
}

function expandAll() {
  for (const source of sources.value) {
    expandedKeys.add(source.id)
    if (source.fields)
      expandFields(source.id, source.fields)
  }
}

function expandFields(sourceId: string, fields: DataFieldNode[]) {
  for (const field of fields) {
    if (!field.fields || field.fields.length === 0)
      continue

    expandedKeys.add(`${sourceId}:${field.path || field.name}`)
    expandFields(sourceId, field.fields)
  }
}

function collapseAll() {
  expandedKeys.clear()
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

function matchesValue(query: string, value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().includes(query)
}

function matchesSource(source: DataSourceDescriptor, query: string): boolean {
  return [
    source.title,
    source.name,
    source.id,
    source.tag,
  ].some(value => matchesValue(query, value))
}

function matchesField(field: DataFieldNode, query: string): boolean {
  return [
    field.title,
    field.name,
    field.path,
    field.key,
    field.id,
    field.tag,
  ].some(value => matchesValue(query, value))
}

function filterFields(fields: DataFieldNode[], query: string): DataFieldNode[] {
  const result: DataFieldNode[] = []
  for (const field of fields) {
    if (matchesField(field, query)) {
      result.push(field)
      continue
    }

    if (!field.fields)
      continue

    const matchedChildren = filterFields(field.fields, query)
    if (matchedChildren.length > 0)
      result.push({ ...field, fields: matchedChildren })
  }
  return result
}

function clearSearch() {
  searchText.value = ''
}
</script>

<template>
  <div class="ei-datasource-panel">
    <div v-if="hasData" class="ei-datasource-panel__controls">
      <div class="ei-datasource-panel__toolbar">
        <span class="ei-datasource-panel__toolbar-title">
          {{ store.t('designer.dataSource.fieldTree') }}
        </span>
        <div class="ei-datasource-panel__toolbar-actions">
          <button
            type="button"
            class="ei-datasource-panel__tool-button"
            :title="store.t('designer.dataSource.expandAll')"
            :aria-label="store.t('designer.dataSource.expandAll')"
            @click="expandAll"
          >
            <IconListExpand :size="12" :stroke-width="1.5" />
          </button>
          <button
            type="button"
            class="ei-datasource-panel__tool-button"
            :title="store.t('designer.dataSource.collapseAll')"
            :aria-label="store.t('designer.dataSource.collapseAll')"
            @click="collapseAll"
          >
            <IconListCollapse :size="12" :stroke-width="1.5" />
          </button>
        </div>
      </div>
      <div class="ei-datasource-panel__search">
        <IconSearch :size="14" :stroke-width="1.5" class="ei-datasource-panel__search-icon" />
        <input
          v-model="searchText"
          type="search"
          class="ei-datasource-panel__search-input"
          :placeholder="store.t('designer.dataSource.search')"
          @keydown.esc.prevent="clearSearch"
        >
        <button
          v-if="hasSearch"
          type="button"
          class="ei-datasource-panel__search-clear"
          :title="store.t('designer.dataSource.clearSearch')"
          :aria-label="store.t('designer.dataSource.clearSearch')"
          @click="clearSearch"
        >
          <IconClose :size="12" :stroke-width="1.5" />
        </button>
      </div>
    </div>
    <div v-if="hasVisibleData" class="ei-datasource-panel__list">
      <div
        v-for="source in displayedSources"
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
            :class="{ 'ei-datasource-panel__chevron--expanded': isVisibleExpanded(source.id) }"
          />
          <IconDatabase :size="14" :stroke-width="1.5" class="ei-datasource-panel__source-icon" />
          <span class="ei-datasource-panel__source-name">{{ source.title || source.name }}</span>
        </div>

        <!-- Source body (fields tree) -->
        <div v-if="isVisibleExpanded(source.id) && source.fields.length > 0" class="ei-datasource-panel__source-body">
          <DataFieldTreeNode
            v-for="child in source.fields"
            :key="childKey(source, child)"
            :field="child"
            :source="source"
            :depth="0"
            :toggle-expand="toggleExpand"
            :is-expanded="isVisibleExpanded"
          />
        </div>
      </div>
    </div>
    <div v-else-if="hasData" class="ei-datasource-panel__empty">
      {{ store.t('designer.dataSource.searchEmpty') }}
    </div>
    <div v-else class="ei-datasource-panel__empty">
      {{ store.t('designer.dataSource.empty') }}
    </div>
    <div class="ei-datasource-panel__hint">
      {{ store.t('designer.dataSource.dragHint') }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-datasource-panel {
  font-size: 12px;

  &__controls {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 6px;
  }

  &__toolbar {
    display: flex;
    align-items: center;
    min-height: 20px;
    padding: 0 2px 0 4px;
  }

  &__toolbar-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--ei-text-secondary, #999);
    font-size: 11px;
    font-weight: 600;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__toolbar-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  &__tool-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--ei-text-secondary, #999);
    cursor: pointer;

    &:hover {
      background: var(--ei-hover-bg, #f0f0f0);
      color: var(--ei-primary, #1890ff);
    }
  }

  &__search {
    position: relative;
  }

  &__search-icon {
    position: absolute;
    top: 50%;
    left: 7px;
    transform: translateY(-50%);
    color: var(--ei-text-secondary, #999);
    pointer-events: none;
  }

  &__search-input {
    width: 100%;
    min-width: 0;
    height: 26px;
    padding: 3px 24px 3px 26px;
    border: 1px solid var(--ei-border-color, #d0d0d0);
    border-radius: 4px;
    outline: none;
    background: var(--ei-input-bg, #fff);
    color: var(--ei-text, #333);
    font-size: 12px;
    box-sizing: border-box;

    &:focus {
      border-color: var(--ei-primary, #1890ff);
    }

    &::-webkit-search-cancel-button {
      appearance: none;
    }
  }

  &__search-clear {
    position: absolute;
    top: 50%;
    right: 4px;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--ei-text-secondary, #999);
    cursor: pointer;

    &:hover {
      background: var(--ei-hover-bg, #f0f0f0);
      color: var(--ei-text, #333);
    }
  }

  &__source {
    margin-bottom: 4px;

    &-header {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px 4px 4px;
      font-weight: 500;
      cursor: pointer;
      border-radius: 3px;
      user-select: none;
      color: var(--ei-text, #333);

      &:hover {
        background: var(--ei-hover-bg, #f0f0f0);
      }
    }

    &-icon {
      flex-shrink: 0;
      color: var(--ei-text-secondary, #999);
    }

    &-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &-body {
      padding-left: 16px;
    }
  }

  &__chevron {
    flex-shrink: 0;
    color: var(--ei-text-secondary, #999);
    transition: transform 0.15s ease;

    &--expanded {
      transform: rotate(90deg);
    }
  }

  &__empty {
    color: var(--ei-text-secondary, #999);
    text-align: center;
    padding: 20px;
  }

  &__hint {
    color: var(--ei-text-secondary, #999);
    font-size: 11px;
    text-align: center;
    padding: 8px;
    border-top: 1px solid var(--ei-border-color, #eee);
    margin-top: 4px;
  }
}
</style>
