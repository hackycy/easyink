<script setup lang="ts">
import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import { IconChevronRight, IconDatabase } from '@easyink/icons'
import { EiIcon } from '@easyink/ui'
import DataFieldTreeNode from './DataFieldTreeNode.vue'
import { dataFieldTreeKey } from './field-path'

defineProps<{
  sources: DataSourceDescriptor[]
  toggleExpand: (key: string) => void
  isExpanded: (key: string) => boolean
  mode?: 'drag' | 'select'
  isFieldSelectable?: (field: DataFieldNode, source: DataSourceDescriptor) => boolean
  fieldBadge?: (field: DataFieldNode, source: DataSourceDescriptor) => string | undefined
}>()

const emit = defineEmits<{
  select: [field: DataFieldNode, source: DataSourceDescriptor]
}>()

function sourceKey(source: DataSourceDescriptor): string {
  return source.id
}

function fieldKey(source: DataSourceDescriptor, field: DataFieldNode): string {
  return dataFieldTreeKey(source.id, field)
}
</script>

<template>
  <div class="ei-datasource-tree">
    <div
      v-for="source in sources"
      :key="sourceKey(source)"
      class="ei-datasource-tree__source"
    >
      <button
        type="button"
        class="ei-datasource-tree__source-header"
        @click="toggleExpand(sourceKey(source))"
      >
        <IconChevronRight
          class="ei-datasource-tree__chevron"
          :class="{ 'ei-datasource-tree__chevron--expanded': isExpanded(sourceKey(source)) }"
          :size="14"
          :stroke-width="1.5"
        />
        <EiIcon :icon="IconDatabase" :size="14" class="ei-datasource-tree__source-icon" />
        <span class="ei-datasource-tree__source-name">{{ source.title || source.name }}</span>
      </button>

      <div
        v-if="isExpanded(sourceKey(source)) && source.fields?.length"
        class="ei-datasource-tree__source-body"
      >
        <DataFieldTreeNode
          v-for="field in source.fields"
          :key="fieldKey(source, field)"
          :field="field"
          :source="source"
          :depth="0"
          parent-path=""
          :mode="mode"
          :toggle-expand="toggleExpand"
          :is-expanded="isExpanded"
          :is-field-selectable="isFieldSelectable"
          :field-badge="fieldBadge"
          @select="(field, selectedSource) => emit('select', field, selectedSource)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-datasource-tree {
  font-size: 12px;

  &__source + &__source {
    margin-top: 4px;
  }

  &__source-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--ei-text, #333);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    text-align: left;
    user-select: none;

    &:hover {
      background: var(--ei-hover-bg, #f0f0f0);
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

  &__source-icon {
    flex-shrink: 0;
    color: var(--ei-text-secondary, #999);
  }

  &__source-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__source-body {
    margin-top: 2px;
    padding-left: 16px;
  }
}
</style>
