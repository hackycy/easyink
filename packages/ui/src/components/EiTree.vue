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
  suffix: (props: { node: TreeNode }) => unknown
}>()

const expandedIds = ref(new Set<string>())

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
  if (props.defaultExpandAll && props.depth === 0) {
    expandAll()
  }
})

watch(() => props.nodes, () => {
  if (props.defaultExpandAll && props.depth === 0) {
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
          :is="iconMap?.[node.icon ?? '']"
          v-if="iconMap && node.icon && iconMap[node.icon]"
          class="ei-tree__icon"
          :size="14"
          :stroke-width="1.5"
        />
        <span class="ei-tree__label">{{ node.label }}</span>
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
          :depth="depth + 1"
          @select="emit('select', $event)"
        >
          <template #suffix="slotProps">
            <slot name="suffix" :node="slotProps.node" />
          </template>
        </EiTree>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ei-tree--root {
  font-size: 13px;
}

.ei-tree__node {
  display: flex;
  align-items: center;
  padding: 4px 6px;
  cursor: pointer;
  border-radius: 4px;
  user-select: none;
  transition: background-color 0.15s;
}

.ei-tree__node:hover {
  background: var(--ei-hover-bg, #f0f0f0);
}

.ei-tree__node--selected {
  background: var(--ei-selected-bg, #e6f7ff);
  color: var(--ei-primary, #1890ff);
}

.ei-tree__toggle {
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--ei-text-secondary, #999);
  border-radius: 3px;
}

.ei-tree__toggle:hover {
  background: var(--ei-hover-bg, #e8e8e8);
}

.ei-tree__chevron {
  width: 10px;
  height: 10px;
  transition: transform 0.15s ease;
}

.ei-tree__chevron--expanded {
  transform: rotate(90deg);
}

.ei-tree__icon {
  flex-shrink: 0;
  margin-right: 4px;
  color: var(--ei-text-secondary, #999);
}

.ei-tree__node--selected .ei-tree__icon {
  color: var(--ei-primary, #1890ff);
}

.ei-tree__label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ei-tree__suffix {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.ei-tree__node:hover .ei-tree__suffix,
.ei-tree__node--selected .ei-tree__suffix {
  opacity: 1;
}

.ei-tree__children {
  padding-left: 12px;
}
</style>
