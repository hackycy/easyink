<script setup lang="ts">
import type { MaterialNode } from '@easyink/schema'
import type { TreeNode } from '@easyink/ui'
import { IconCondition, IconDelete, IconHidden, IconLock, IconPreview } from '@easyink/icons'
import { EiIcon, EiTree } from '@easyink/ui'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'
import { deleteMaterialNodes, toggleMaterialHidden, updateMaterialMeta } from '../interactions/element-actions'
import { selectOne } from '../interactions/selection-api'

const store = useDesignerStore()

function getNodeLabel(node: MaterialNode): string {
  if (node.editorState?.name)
    return node.editorState.name
  const def = store.getMaterial(node.type)
  if (def)
    return store.t(def.name)
  return `${node.type} (${node.id.slice(0, 8)})`
}

function toTreeNode(node: MaterialNode): TreeNode {
  const definition = store.getMaterial(node.type)
  return {
    id: node.id,
    label: getNodeLabel(node),
    icon: definition?.icon,
    children: node.slots.default?.map(toTreeNode),
    data: node,
  }
}

const treeNodes = computed<TreeNode[]>(() => {
  return store.getElements().map(toTreeNode)
})

const selectedId = computed(() => {
  const ids = store.selection.ids
  return ids.length === 1 ? ids[0] : undefined
})

function handleSelect(node: TreeNode) {
  selectOne(store, node.id)
}

function handleUnlock(node: MaterialNode) {
  updateMaterialMeta(store, 'Unlock', [node], { locked: false })
}

function handleToggleHidden(node: MaterialNode) {
  toggleMaterialHidden(store, node)
}

function handleDelete(node: MaterialNode) {
  deleteMaterialNodes(store, [node])
}

function visibilityTitle(node: MaterialNode): string {
  return store.t(node.editorState?.hidden ? 'designer.context.show' : 'designer.context.hide')
}
</script>

<template>
  <EiTree
    :nodes="treeNodes"
    :selected-id="selectedId"
    default-expand-all
    @select="handleSelect"
  >
    <template #label="{ node }">
      <span class="structure-tree__label-content">
        <span
          v-if="(node.data as MaterialNode)?.output.renderCondition"
          class="structure-tree__condition"
          :class="{ 'is-disabled': (node.data as MaterialNode).output.renderCondition?.enabled === false }"
          :title="store.t('designer.property.conditionalRendering')"
        >
          <EiIcon :icon="IconCondition" :size="12" :stroke-width="1.6" />
        </span>
        <span class="structure-tree__label-text">{{ node.label }}</span>
      </span>
    </template>
    <template #suffix="{ node }">
      <button
        v-if="(node.data as MaterialNode)?.editorState?.locked"
        type="button"
        class="structure-tree__action"
        :title="store.t('designer.context.unlock')"
        :aria-label="store.t('designer.context.unlock')"
        @click.stop="handleUnlock(node.data as MaterialNode)"
      >
        <EiIcon
          :icon="IconLock"
          :size="12"
          :stroke-width="1.5"
        />
      </button>
      <button
        type="button"
        class="structure-tree__action"
        :disabled="(node.data as MaterialNode)?.editorState?.locked"
        :title="visibilityTitle(node.data as MaterialNode)"
        :aria-label="visibilityTitle(node.data as MaterialNode)"
        @click.stop="handleToggleHidden(node.data as MaterialNode)"
      >
        <EiIcon
          :icon="(node.data as MaterialNode)?.editorState?.hidden ? IconHidden : IconPreview"
          :size="12"
          :stroke-width="1.5"
        />
      </button>
      <button
        type="button"
        class="structure-tree__action structure-tree__action--danger"
        :disabled="(node.data as MaterialNode)?.editorState?.locked"
        :title="store.t('designer.context.delete')"
        :aria-label="store.t('designer.context.delete')"
        @click.stop="handleDelete(node.data as MaterialNode)"
      >
        <EiIcon
          :icon="IconDelete"
          :size="12"
          :stroke-width="1.5"
        />
      </button>
    </template>
  </EiTree>
</template>

<style scoped lang="scss">
.structure-tree__action {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--ei-text-secondary, #999);
  background: transparent;
  border: 0;
  border-radius: 4px;
  cursor: pointer;

  &:hover {
    color: var(--ei-primary, #1890ff);
    background: var(--ei-hover-bg, #f0f0f0);
  }

  &:disabled {
    color: var(--ei-text-tertiary, #ccc);
    cursor: not-allowed;

    &:hover {
      background: transparent;
    }
  }
}

.structure-tree__label-content {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  max-width: 100%;
}

.structure-tree__label-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.structure-tree__condition {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: var(--ei-primary, #1677ff);

  &.is-disabled { opacity: 0.35; }
}

.structure-tree__action--danger {
  color: var(--ei-text-secondary, #999);

  &:hover:not(:disabled) {
    color: var(--ei-danger, #ff4d4f);
  }
}
</style>
