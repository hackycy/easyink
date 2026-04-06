<script setup lang="ts">
import type { MaterialCatalogEntry } from '../types'
import { AddMaterialCommand } from '@easyink/core'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'
import { MATERIAL_DRAG_MIME } from '../composables/use-material-drop'

const store = useDesignerStore()

const quickMaterials = computed<MaterialCatalogEntry[]>(() => store.getQuickMaterials())

const groupedCategories = computed(() => {
  const groups = ['data', 'chart', 'svg', 'relation'] as const
  return groups.map(group => ({
    group,
    label: store.t(`designer.toolbar.${group}`),
    items: store.getGroupedMaterials(group),
  })).filter(g => g.items.length > 0)
})

function handleAddMaterial(entry: MaterialCatalogEntry) {
  const definition = store.getMaterial(entry.materialType)
  if (!definition) return
  const node = definition.createDefaultNode({
    x: 50,
    y: 50,
  })
  const cmd = new AddMaterialCommand(store.schema.elements, node)
  store.commands.execute(cmd)
  store.selection.select(node.id)
}

function handleDragStart(e: DragEvent, entry: MaterialCatalogEntry) {
  if (!e.dataTransfer) return
  e.dataTransfer.effectAllowed = 'copy'
  e.dataTransfer.setData(MATERIAL_DRAG_MIME, entry.materialType)
}

function openTemplateLibrary() {
  store.workbench.templateLibrary.phase = 'opening'
}
</script>

<template>
  <div class="ei-topbar-a">
    <div class="ei-topbar-a__logo">
      EasyInk
    </div>

    <div class="ei-topbar-a__quick-materials">
      <button
        v-for="mat in quickMaterials"
        :key="mat.id"
        class="ei-topbar-a__material-btn"
        :title="store.t(mat.label)"
        draggable="true"
        @click="handleAddMaterial(mat)"
        @dragstart="handleDragStart($event, mat)"
      >
        {{ store.t(mat.label) }}
      </button>
    </div>

    <div class="ei-topbar-a__grouped-materials">
      <div
        v-for="group in groupedCategories"
        :key="group.group"
        class="ei-topbar-a__group"
      >
        <button class="ei-topbar-a__group-btn">
          {{ group.label }}
        </button>
        <div class="ei-topbar-a__group-dropdown">
          <button
            v-for="item in group.items"
            :key="item.id"
            class="ei-topbar-a__group-item"
            draggable="true"
            @click="handleAddMaterial(item)"
            @dragstart="handleDragStart($event, item)"
          >
            {{ store.t(item.label) }}
          </button>
        </div>
      </div>
    </div>

    <div class="ei-topbar-a__actions">
      <button class="ei-topbar-a__action" @click="openTemplateLibrary">
        {{ store.t('designer.templateLibrary.title') }}
      </button>
      <button class="ei-topbar-a__action" @click="store.workbench.preview.visible = true">
        {{ store.t('designer.toolbar.preview') }}
      </button>
      <button class="ei-topbar-a__action">
        {{ store.t('designer.toolbar.save') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ei-topbar-a {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid var(--ei-border-color, #e0e0e0);
  background: var(--ei-topbar-bg, #fff);
  gap: 8px;
}

.ei-topbar-a__logo {
  font-weight: 700;
  font-size: 16px;
  color: var(--ei-primary, #1890ff);
  margin-right: 12px;
  user-select: none;
}

.ei-topbar-a__quick-materials {
  display: flex;
  gap: 2px;
}

.ei-topbar-a__material-btn,
.ei-topbar-a__group-btn,
.ei-topbar-a__group-item,
.ei-topbar-a__action {
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--ei-text, #333);
  white-space: nowrap;
}

.ei-topbar-a__material-btn:hover,
.ei-topbar-a__group-btn:hover,
.ei-topbar-a__group-item:hover,
.ei-topbar-a__action:hover {
  background: var(--ei-hover-bg, #f0f0f0);
}

.ei-topbar-a__grouped-materials {
  display: flex;
  gap: 2px;
}

.ei-topbar-a__group {
  position: relative;
}

.ei-topbar-a__group-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  background: var(--ei-topbar-bg, #fff);
  border: 1px solid var(--ei-border-color, #e0e0e0);
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  padding: 4px 0;
  min-width: 120px;
}

.ei-topbar-a__group:hover .ei-topbar-a__group-dropdown {
  display: block;
}

.ei-topbar-a__group-item {
  display: block;
  width: 100%;
  text-align: left;
  border-radius: 0;
}

.ei-topbar-a__actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
</style>
