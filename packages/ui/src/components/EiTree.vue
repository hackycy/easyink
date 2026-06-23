<script setup lang="ts">
import type { Component } from 'vue'
import type { TreeNode } from './tree-types'
import { onMounted, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  nodes: TreeNode[]
  selectedId?: string
  iconMap?: Record<string, Component>
  defaultExpandAll?: boolean
  /** Internal: depth level for recursive rendering */
  depth?: number
}>(), {
  depth: 0,
})

const emit = defineEmits<{
  select: [node: TreeNode]
}>()

defineSlots<{
  label?: (props: { node: TreeNode }) => unknown
  indicator?: (props: { node: TreeNode }) => unknown
  suffix: (props: { node: TreeNode }) => unknown
}>()

const expandedIds = ref(new Set<string>(props.defaultExpandAll ? collectAllIds(props.nodes) : []))

function collectAllIds(nodes: TreeNode[]): string[] {
  const ids: string[] = []
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      ids.push(node.id)
      ids.push(...collectAllIds(node.children))
    }
  }
  return ids
}

function expandAll() {
  const ids = collectAllIds(props.nodes)
  for (const id of ids) {
    expandedIds.value.add(id)
  }
}

onMounted(() => {
  if (props.defaultExpandAll) {
    expandAll()
  }
})

watch(() => props.nodes, () => {
  if (props.defaultExpandAll) {
    expandAll()
  }
})

function toggleExpand(id: string) {
  if (expandedIds.value.has(id)) {
    expandedIds.value.delete(id)
  }
  else {
    expandedIds.value.add(id)
  }
}

function isExpanded(id: string): boolean {
  return expandedIds.value.has(id)
}

function resolveIcon(node: TreeNode): Component | undefined {
  if (!node.icon)
    return undefined
  if (typeof node.icon === 'string')
    return props.iconMap?.[node.icon]
  return node.icon
}
</script>

<template>
  <div class="ei-tree" :class="{ 'ei-tree--root': depth === 0 }">
    <template v-for="node in nodes" :key="node.id">
      <div
        class="ei-tree__node"
        :class="{
          'ei-tree__node--selected': node.id === selectedId,
        }"
        @click="emit('select', node)"
      >
        <span
          v-if="node.children && node.children.length > 0"
          class="ei-tree__toggle"
          @click.stop="toggleExpand(node.id)"
        >
          <svg
            class="ei-tree__chevron"
            :class="{ 'ei-tree__chevron--expanded': isExpanded(node.id) }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        <component
          :is="resolveIcon(node)"
          v-if="resolveIcon(node)"
          class="ei-tree__icon"
          :size="14"
          :stroke-width="1.5"
        />
        <span class="ei-tree__label">
          <slot name="label" :node="node">
            {{ node.label }}
          </slot>
        </span>
        <span class="ei-tree__indicator">
          <slot name="indicator" :node="node" />
        </span>
        <span class="ei-tree__suffix">
          <slot name="suffix" :node="node" />
        </span>
      </div>
      <div
        v-if="node.children && node.children.length > 0 && isExpanded(node.id)"
        class="ei-tree__children"
      >
        <EiTree
          :nodes="node.children"
          :selected-id="selectedId"
          :icon-map="iconMap"
          :default-expand-all="defaultExpandAll"
          :depth="depth + 1"
          @select="emit('select', $event)"
        >
          <template #indicator="slotProps">
            <slot name="indicator" :node="slotProps.node" />
          </template>
          <template #label="slotProps">
            <slot name="label" :node="slotProps.node">
              {{ slotProps.node.label }}
            </slot>
          </template>
          <template #suffix="slotProps">
            <slot name="suffix" :node="slotProps.node" />
          </template>
        </EiTree>
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.ei-tree {
  &--root {
    font-size: 13px;
  }

  &__node {
    display: flex;
    align-items: center;
    padding: 4px 6px;
    cursor: pointer;
    border-radius: 4px;
    user-select: none;
    transition: background-color 0.15s;

    &:hover {
      background: var(--ei-hover-bg, #f0f0f0);

      .ei-tree__suffix {
        opacity: 1;
      }
    }

    &--selected {
      background: var(--ei-selected-bg, #e6f7ff);
      color: var(--ei-primary, #1890ff);

      .ei-tree__icon {
        color: var(--ei-primary, #1890ff);
      }

      .ei-tree__suffix {
        opacity: 1;
      }
    }
  }

  &__toggle {
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--ei-text-secondary, #999);
    border-radius: 3px;

    &:hover {
      background: var(--ei-hover-bg, #e8e8e8);
    }
  }

  &__chevron {
    width: 10px;
    height: 10px;
    transition: transform 0.15s ease;

    &--expanded {
      transform: rotate(90deg);
    }
  }

  &__icon {
    flex-shrink: 0;
    margin-right: 4px;
    color: var(--ei-text-secondary, #999);
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__suffix {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }

  &__indicator {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  &__children {
    padding-left: 12px;
  }
}
</style>
