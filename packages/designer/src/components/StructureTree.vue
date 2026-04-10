<script setup lang="ts">
import type { Component } from 'vue'
import type { MaterialNode } from '@easyink/schema'
import type { TreeNode } from '@easyink/ui'
import {
  IconBarcode,
  IconChart,
  IconContainer,
  IconEllipse,
  IconHidden,
  IconImage,
  IconLine,
  IconLock,
  IconQrcode,
  IconRect,
  IconRelation,
  IconSvg,
  IconTable,
  IconText,
  IconDataTable
} from '@easyink/icons'
import { EiIcon, EiTree } from '@easyink/ui'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const ICON_MAP: Record<string, Component> = {
  'text': IconText,
  'image': IconImage,
  'barcode': IconBarcode,
  'qrcode': IconQrcode,
  'line': IconLine,
  'rect': IconRect,
  'ellipse': IconEllipse,
  'container': IconContainer,
  'table-static': IconTable,
  'table-data': IconDataTable,
  'chart': IconChart,
  'svg': IconSvg,
  'relation': IconRelation,
}

const store = useDesignerStore()

function getNodeLabel(node: MaterialNode): string {
  if (node.name) return node.name
  const def = store.getMaterial(node.type)
  if (def) return store.t(def.name)
  return `${node.type} (${node.id.slice(0, 8)})`
}

function toTreeNode(node: MaterialNode): TreeNode {
  return {
    id: node.id,
    label: getNodeLabel(node),
    icon: node.type,
    children: node.children?.map(toTreeNode),
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
  store.selection.select(node.id)
}
</script>

<template>
  <EiTree
    :nodes="treeNodes"
    :selected-id="selectedId"
    :icon-map="ICON_MAP"
    default-expand-all
    @select="handleSelect"
  >
    <template #suffix="{ node }">
      <EiIcon
        v-if="(node.data as MaterialNode)?.locked"
        :icon="IconLock"
        :size="12"
        :stroke-width="1.5"
        class="structure-tree__status"
      />
      <EiIcon
        v-if="(node.data as MaterialNode)?.hidden"
        :icon="IconHidden"
        :size="12"
        :stroke-width="1.5"
        class="structure-tree__status"
      />
    </template>
  </EiTree>
</template>

<style scoped>
.structure-tree__status {
  color: var(--ei-text-secondary, #999);
}
</style>
