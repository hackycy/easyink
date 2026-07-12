<script setup lang="ts">
import type { MaterialDragEntry } from '../composables/use-designer-drag-drop'
import { AddMaterialCommand } from '@easyink/core'
import { computed, inject } from 'vue'
import { useDesignerStore } from '../composables'
import { DESIGNER_DRAG_DROP_KEY } from '../composables/use-designer-drag-drop'
import { selectOne } from '../interactions/selection-api'

const store = useDesignerStore()
const dragDrop = inject(DESIGNER_DRAG_DROP_KEY, null)

interface MaterialPanelGroup {
  id: string
  items: MaterialDragEntry[]
}

const visibleMaterialGroups = computed<MaterialPanelGroup[]>(() => {
  const groups = new Map<string, MaterialPanelGroup>()
  for (const type of store.materialProfile.editableTypes) {
    const manifest = store.getManifest(type)
    if (!manifest)
      continue
    const id = manifest.common.category
    const group = groups.get(id) ?? { id, items: [] }
    group.items.push({
      id: type,
      groupId: id,
      label: manifest.common.nameKey,
      icon: store.resolveMaterialIcon(manifest.common.iconKey),
      materialType: type,
    })
    groups.set(id, group)
  }
  return [...groups.values()]
})

const hasRegisteredMaterials = computed(() =>
  visibleMaterialGroups.value.length > 0,
)

function handleAddMaterial(entry: MaterialDragEntry) {
  if (dragDrop?.consumeClickSuppression())
    return
  const node = store.materialProfile.createNode(entry.materialType, {
    x: 50,
    y: 50,
  }, store.schema.unit)
  const cmd = new AddMaterialCommand(store.schema.elements, node)
  store.commands.execute(cmd)
  selectOne(store, node.id)
}

function handlePointerDown(e: PointerEvent, entry: MaterialDragEntry) {
  dragDrop?.startMaterialPointerDrag(e, entry)
}

function handlePointerUp(entry: MaterialDragEntry) {
  if (dragDrop?.consumeClickSuppression())
    return
  handleAddMaterial(entry)
}

function handleKeyAdd(e: KeyboardEvent, entry: MaterialDragEntry) {
  if (e.key !== 'Enter' && e.key !== ' ')
    return
  e.preventDefault()
  handleAddMaterial(entry)
}
</script>

<template>
  <div class="ei-material-panel">
    <div v-if="!hasRegisteredMaterials" class="ei-material-panel__empty">
      <div class="ei-material-panel__empty-title">
        {{ store.t('designer.panel.materialsNotRegistered') }}
      </div>
      <div class="ei-material-panel__empty-text">
        {{ store.t('designer.panel.materialsRegistrationHint') }}
      </div>
    </div>

    <div
      v-for="group in visibleMaterialGroups"
      :key="group.id"
      class="ei-material-panel__section"
    >
      <div class="ei-material-panel__section-title">
        {{ store.t(store.resolveMaterialGroupLabelKey(group.id)) }}
      </div>
      <div class="ei-material-panel__grid">
        <button
          v-for="item in group.items"
          :key="item.id"
          class="ei-material-panel__item"
          draggable="false"
          :title="store.t(item.label)"
          @pointerdown="handlePointerDown($event, item)"
          @pointerup="handlePointerUp(item)"
          @keydown="handleKeyAdd($event, item)"
          @dragstart.prevent
        >
          <component :is="item.icon" :size="20" :stroke-width="1.5" class="ei-material-panel__icon" />
          <span class="ei-material-panel__label">{{ store.t(item.label) }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-material-panel {
  overflow-y: auto;

  &__empty {
    margin-bottom: 12px;
    padding: 12px;
    border: 1px solid var(--ei-border-color, #e0e0e0);
    border-radius: 6px;
    background: var(--ei-hover-bg, #f7f7f7);

    &-title {
      margin-bottom: 4px;
      font-size: 12px;
      font-weight: 600;
      color: var(--ei-text, #333);
    }

    &-text {
      font-size: 11px;
      line-height: 1.5;
      color: var(--ei-text-secondary, #666);
    }
  }

  &__section {
    margin-bottom: 12px;

    &-title {
      font-size: 11px;
      font-weight: 600;
      color: var(--ei-text-secondary, #999);
      margin-bottom: 6px;
      padding: 0 4px;
    }
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
  }

  &__item {
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
    user-select: none;
    touch-action: none;
    -webkit-user-drag: none;

    &:hover {
      background: var(--ei-hover-bg, #f0f0f0);
      border-color: var(--ei-primary, #1890ff);
      color: var(--ei-primary, #1890ff);

      .ei-material-panel__icon {
        color: var(--ei-primary, #1890ff);
      }
    }

    &:active {
      cursor: grabbing;
    }
  }

  &__icon {
    flex-shrink: 0;
    color: var(--ei-text-secondary, #666);
  }

  &__label {
    font-size: 10px;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
}
</style>
