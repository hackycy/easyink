<script setup lang="ts">
import type { Component } from 'vue'
import type { MaterialCatalogEntry } from '../types'
import { AddMaterialCommand } from '@easyink/core'
import {
  IconBarcode,
  IconChart,
  IconContainer,
  IconDataTable,
  IconEllipse,
  IconImage,
  IconLine,
  IconPageNumber,
  IconQrcode,
  IconRect,
  IconSvg,
  IconTable,
  IconText,
} from '@easyink/icons'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'
import { MATERIAL_DRAG_MIME } from '../composables/use-material-drop'

const store = useDesignerStore()

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
  'page-number': IconPageNumber,
}

const quickMaterials = computed<MaterialCatalogEntry[]>(() => store.getQuickMaterials())

const groupedCategories = computed(() => {
  const groups = ['data', 'chart', 'svg', 'utility'] as const
  return groups.map(group => ({
    group,
    label: store.t(`designer.toolbar.${group}`),
    items: store.getGroupedMaterials(group),
  })).filter(g => g.items.length > 0)
})

function getIcon(iconKey: string): Component | undefined {
  return ICON_MAP[iconKey]
}

function handleAddMaterial(entry: MaterialCatalogEntry) {
  const definition = store.getMaterial(entry.materialType)
  if (!definition)
    return
  const node = definition.createDefaultNode({
    x: 50,
    y: 50,
  }, store.schema.unit)
  const cmd = new AddMaterialCommand(store.schema.elements, node)
  store.commands.execute(cmd)
  store.selection.select(node.id)
}

function handleDragStart(e: DragEvent, entry: MaterialCatalogEntry) {
  if (!e.dataTransfer)
    return
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData(MATERIAL_DRAG_MIME, entry.materialType)
}
</script>

<template>
  <div class="ei-material-panel">
    <div class="ei-material-panel__section">
      <div class="ei-material-panel__section-title">
        {{ store.t('designer.panel.quickMaterials') }}
      </div>
      <div class="ei-material-panel__grid">
        <button
          v-for="mat in quickMaterials"
          :key="mat.id"
          class="ei-material-panel__item"
          :title="store.t(mat.label)"
          draggable="true"
          @click="handleAddMaterial(mat)"
          @dragstart="handleDragStart($event, mat)"
        >
          <component :is="getIcon(mat.icon)" v-if="getIcon(mat.icon)" :size="20" :stroke-width="1.5" class="ei-material-panel__icon" />
          <span class="ei-material-panel__label">{{ store.t(mat.label) }}</span>
        </button>
      </div>
    </div>

    <template v-for="group in groupedCategories" :key="group.group">
      <div class="ei-material-panel__section">
        <div class="ei-material-panel__section-title">
          {{ group.label }}
        </div>
        <div class="ei-material-panel__grid">
          <button
            v-for="item in group.items"
            :key="item.id"
            class="ei-material-panel__item"
            :title="store.t(item.label)"
            draggable="true"
            @click="handleAddMaterial(item)"
            @dragstart="handleDragStart($event, item)"
          >
            <component :is="getIcon(item.icon)" v-if="getIcon(item.icon)" :size="20" :stroke-width="1.5" class="ei-material-panel__icon" />
            <span class="ei-material-panel__label">{{ store.t(item.label) }}</span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ei-material-panel {
  overflow-y: auto;
}

.ei-material-panel__section {
  margin-bottom: 12px;
}

.ei-material-panel__section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--ei-text-secondary, #999);
  margin-bottom: 6px;
  padding: 0 4px;
}

.ei-material-panel__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.ei-material-panel__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border: 1px solid var(--ei-border-color, #e0e0e0);
  border-radius: 4px;
  background: var(--ei-bg, #fff);
  cursor: grab;
  color: var(--ei-text, #333);
}

.ei-material-panel__item:hover {
  background: var(--ei-hover-bg, #f0f0f0);
  border-color: var(--ei-primary, #1890ff);
  color: var(--ei-primary, #1890ff);
}

.ei-material-panel__item:active {
  cursor: grabbing;
}

.ei-material-panel__icon {
  flex-shrink: 0;
  color: var(--ei-text-secondary, #666);
}

.ei-material-panel__item:hover .ei-material-panel__icon {
  color: var(--ei-primary, #1890ff);
}

.ei-material-panel__label {
  font-size: 10px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
</style>
