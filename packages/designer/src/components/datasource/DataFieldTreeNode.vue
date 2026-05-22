<script setup lang="ts">
import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import type { DatasourceFieldDragData } from '../../composables/use-designer-drag-drop'
import {
  IconChevronRight,
  IconFolderClosed,
  IconFolderOpen,
  IconGripVertical,
} from '@easyink/icons'
import { inject } from 'vue'
import { DESIGNER_DRAG_DROP_KEY } from '../../composables/use-designer-drag-drop'

const props = defineProps<{
  field: DataFieldNode
  source: DataSourceDescriptor
  depth: number
  toggleExpand: (key: string) => void
  isExpanded: (key: string) => boolean
}>()

const dragDrop = inject(DESIGNER_DRAG_DROP_KEY, null)
let suppressNativeToggleClick = false

function nodeKey(): string {
  return `${props.source.id}:${props.field.path || props.field.name}`
}

function fieldPath(): string {
  return props.field.path || props.field.name
}

function isLeaf(): boolean {
  return !props.field.fields || props.field.fields.length === 0
}

function isDraggable(): boolean {
  return isLeaf() || !!props.field.union
}

function expanded(): boolean {
  return props.isExpanded(nodeKey())
}

function childKey(child: DataFieldNode): string {
  return `${props.source.id}:${child.path || child.name}`
}

function onToggle() {
  if (suppressNativeToggleClick) {
    suppressNativeToggleClick = false
    return
  }
  if (dragDrop?.consumeClickSuppression())
    return
  props.toggleExpand(nodeKey())
}

function createDragData(): DatasourceFieldDragData {
  return {
    sourceId: props.source.id,
    sourceName: props.source.name,
    sourceTag: props.source.tag,
    fieldPath: props.field.path || props.field.name,
    fieldKey: props.field.key,
    fieldLabel: props.field.title || props.field.name,
    format: props.field.format,
    use: props.field.use,
    props: props.field.props,
    bindIndex: props.field.bindIndex,
    union: props.field.union,
  }
}

function onPointerDown(e: PointerEvent) {
  if (!isDraggable())
    return
  dragDrop?.startDatasourcePointerDrag(e, createDragData())
}

function onPointerUp() {
  if (!isDraggable() || isLeaf())
    return
  if (dragDrop?.consumeClickSuppression())
    return
  suppressNativeToggleClick = true
  window.setTimeout(() => {
    suppressNativeToggleClick = false
  }, 0)
  props.toggleExpand(nodeKey())
}
</script>

<template>
  <!-- Group node (has children) -->
  <div v-if="!isLeaf()">
    <div
      class="ei-field-node__row ei-field-node__row--group"
      draggable="false"
      :style="{ paddingLeft: `${depth * 16 + 4}px` }"
      @click="onToggle"
      @pointerdown="onPointerDown"
      @pointerup="onPointerUp"
      @dragstart.prevent
    >
      <IconChevronRight
        :size="14"
        :stroke-width="1.5"
        class="ei-field-node__chevron"
        :class="{ 'ei-field-node__chevron--expanded': expanded() }"
      />
      <component
        :is="expanded() ? IconFolderOpen : IconFolderClosed"
        :size="14"
        :stroke-width="1.5"
        class="ei-field-node__icon ei-field-node__icon--folder"
      />
      <span class="ei-field-node__label">{{ field.title || field.name }}</span>
    </div>
    <template v-if="expanded()">
      <DataFieldTreeNode
        v-for="child in field.fields"
        :key="childKey(child)"
        :field="child"
        :source="source"
        :depth="depth + 1"
        :toggle-expand="toggleExpand"
        :is-expanded="isExpanded"
      />
    </template>
  </div>

  <!-- Leaf node (draggable) -->
  <div
    v-else
    class="ei-field-node__row ei-field-node__row--leaf"
    draggable="false"
    :style="{ paddingLeft: `${depth * 16 + 4}px` }"
    @pointerdown="onPointerDown"
    @dragstart.prevent
  >
    <span class="ei-field-node__chevron-spacer" />
    <IconGripVertical :size="12" :stroke-width="1.5" class="ei-field-node__grip" />
    <span class="ei-field-node__label" :title="fieldPath()">{{ field.title || field.name }}</span>
  </div>
</template>

<style scoped lang="scss">
.ei-field-node {
  &__row {
    display: flex;
    align-items: center;
    padding: 3px 8px 3px 4px;
    border-radius: 3px;
    user-select: none;
    touch-action: none;
    -webkit-user-drag: none;
    gap: 4px;
    min-height: 26px;

    &--group {
      cursor: pointer;

      &:hover {
        background: var(--ei-hover-bg, #f0f0f0);
      }
    }

    &--leaf {
      cursor: grab;

      &:active {
        cursor: grabbing;
      }

      &:hover {
        background: var(--ei-hover-bg, #f0f0f0);

        .ei-field-node__path {
          opacity: 1;
        }
      }
    }
  }

  &__chevron {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    color: var(--ei-text-secondary, #999);
    transition: transform 0.15s ease;

    &--expanded {
      transform: rotate(90deg);
    }
  }

  &__chevron-spacer {
    flex-shrink: 0;
    width: 14px;
  }

  &__icon {
    flex-shrink: 0;
    width: 14px;
    height: 14px;

    &--folder {
      color: var(--ei-text-secondary, #999);
    }
  }

  &__grip {
    flex-shrink: 0;
    color: var(--ei-text-secondary, #999);
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ei-text, #333);
    font-size: 12px;
  }
}
</style>
