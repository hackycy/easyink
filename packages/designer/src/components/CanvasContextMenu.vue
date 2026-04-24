<script setup lang="ts">
import type { MaterialNode } from '@easyink/schema'
import type { Component } from 'vue'
import {
  AddMaterialCommand,
  RemoveMaterialCommand,
} from '@easyink/core'
import {
  IconCopy,
  IconCopyPlus,
  IconDelete,
  IconLayerBottom,
  IconLayerDown,
  IconLayerTop,
  IconLayerUp,
  IconLock,
  IconPaste,
  IconScissors,
  IconSelectAll,
  IconUnlock,
} from '@easyink/icons'
import { deepClone, generateId } from '@easyink/shared'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useDesignerStore } from '../composables'

interface ContextMenuItem {
  id: string
  label: string
  icon?: Component
  disabled?: boolean
  destructive?: boolean
  shortcut?: string
}

interface ContextMenuGroup {
  id: string
  items: ContextMenuItem[]
}

const store = useDesignerStore()

const visible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

const snapshotGroups = ref<ContextMenuGroup[]>([])

const selectedNodes = computed<MaterialNode[]>(() => {
  return store.selection.ids
    .map(id => store.getElementById(id))
    .filter((n): n is MaterialNode => n != null)
})

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent)
const modKey = isMac ? 'Cmd' : 'Ctrl'

function buildGroups(isBlank: boolean): ContextMenuGroup[] {
  const nodes = selectedNodes.value

  if (isBlank || nodes.length === 0) {
    return [
      {
        id: 'edit',
        items: [
          { id: 'paste', label: store.t('designer.context.paste'), icon: IconPaste, shortcut: `${modKey}+V`, disabled: store.clipboard.length === 0 },
          { id: 'select-all', label: store.t('designer.context.selectAll'), icon: IconSelectAll, shortcut: `${modKey}+A` },
        ],
      },
    ]
  }

  const groups: ContextMenuGroup[] = []

  // Group 1: edit
  groups.push({
    id: 'edit',
    items: [
      { id: 'copy', label: store.t('designer.context.copy'), icon: IconCopy, shortcut: `${modKey}+C` },
      { id: 'cut', label: store.t('designer.context.cut'), icon: IconScissors, shortcut: `${modKey}+X` },
      { id: 'paste', label: store.t('designer.context.paste'), icon: IconPaste, shortcut: `${modKey}+V`, disabled: store.clipboard.length === 0 },
      { id: 'duplicate', label: store.t('designer.context.duplicate'), icon: IconCopyPlus, shortcut: `${modKey}+D` },
    ],
  })

  // Group 2: layer (single selection only)
  if (nodes.length === 1) {
    groups.push({
      id: 'layer',
      items: [
        { id: 'bring-front', label: store.t('designer.context.bringToFront'), icon: IconLayerTop },
        { id: 'send-back', label: store.t('designer.context.sendToBack'), icon: IconLayerBottom },
        { id: 'layer-up', label: store.t('designer.context.layerUp'), icon: IconLayerUp },
        { id: 'layer-down', label: store.t('designer.context.layerDown'), icon: IconLayerDown },
      ],
    })
  }

  // Group 3: control
  const controlItems: ContextMenuItem[] = []
  const allLocked = nodes.every(n => n.locked)
  if (allLocked) {
    controlItems.push({ id: 'unlock', label: store.t('designer.context.unlock'), icon: IconUnlock })
  }
  else {
    controlItems.push({ id: 'lock', label: store.t('designer.context.lock'), icon: IconLock })
  }
  groups.push({ id: 'control', items: controlItems })

  // Group 4: danger
  groups.push({
    id: 'danger',
    items: [
      { id: 'delete', label: store.t('designer.context.delete'), icon: IconDelete, destructive: true, shortcut: 'Del' },
    ],
  })

  return groups
}

function isHitElement(target: HTMLElement): boolean {
  // Direct hit on an element
  if (target.closest('.ei-canvas-element'))
    return true
  // Hit on deep editing overlay/toolbar/drag-handle (these are siblings of .ei-canvas-element)
  if (target.closest('.ei-deep-edit-overlay') || target.closest('.ei-deep-edit-toolbar') || target.closest('.ei-deep-edit-drag-handle'))
    return true
  return false
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  menuX.value = e.clientX
  menuY.value = e.clientY

  const target = e.target as HTMLElement
  const isBlank = !isHitElement(target)

  snapshotGroups.value = buildGroups(isBlank)
  visible.value = true
}

function handleAction(item: ContextMenuItem) {
  visible.value = false

  const nodes = selectedNodes.value
  const elements = store.schema.elements

  switch (item.id) {
    case 'copy':
      if (nodes.length > 0) {
        store.clipboard = nodes.map(n => deepClone(n))
      }
      break

    case 'cut':
      if (nodes.length > 0) {
        store.clipboard = nodes.map(n => deepClone(n))
        store.commands.beginTransaction('Cut')
        for (const node of nodes) {
          store.commands.execute(new RemoveMaterialCommand(elements, node.id))
        }
        store.commands.commitTransaction()
        store.selection.clear()
      }
      break

    case 'paste':
      if (store.clipboard.length > 0) {
        const offset = 10
        const newIds: string[] = []
        store.commands.beginTransaction('Paste')
        for (const node of store.clipboard) {
          const pasted: MaterialNode = {
            ...deepClone(node),
            id: generateId('el'),
            x: node.x + offset,
            y: node.y + offset,
          }
          store.commands.execute(new AddMaterialCommand(elements, pasted))
          newIds.push(pasted.id)
        }
        store.commands.commitTransaction()
        store.selection.selectMultiple(newIds)
      }
      break

    case 'duplicate':
      if (nodes.length > 0) {
        const offset = 10
        const newIds: string[] = []
        store.commands.beginTransaction('Duplicate')
        for (const node of nodes) {
          const dup: MaterialNode = {
            ...deepClone(node),
            id: generateId('el'),
            x: node.x + offset,
            y: node.y + offset,
          }
          store.commands.execute(new AddMaterialCommand(elements, dup))
          newIds.push(dup.id)
        }
        store.commands.commitTransaction()
        store.selection.selectMultiple(newIds)
      }
      break

    case 'delete':
      if (nodes.length > 0) {
        store.commands.beginTransaction('Delete')
        for (const node of nodes) {
          store.commands.execute(new RemoveMaterialCommand(elements, node.id))
        }
        store.commands.commitTransaction()
        store.selection.clear()
      }
      break

    case 'bring-front':
      if (nodes.length === 1) {
        const node = nodes[0]!
        const maxZ = elements.reduce((m, el) => Math.max(m, el.zIndex ?? 0), 0)
        store.updateElement(node.id, { zIndex: maxZ + 1 })
      }
      break

    case 'send-back':
      if (nodes.length === 1) {
        const node = nodes[0]!
        const minZ = elements.reduce((m, el) => Math.min(m, el.zIndex ?? 0), 0)
        store.updateElement(node.id, { zIndex: minZ - 1 })
      }
      break

    case 'layer-up':
      if (nodes.length === 1) {
        const node = nodes[0]!
        const currentZ = node.zIndex ?? 0
        const above = elements
          .filter(el => (el.zIndex ?? 0) > currentZ)
          .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
        if (above.length > 0) {
          const nextZ = above[0]!.zIndex ?? 0
          store.updateElement(node.id, { zIndex: nextZ + 1 })
        }
      }
      break

    case 'layer-down':
      if (nodes.length === 1) {
        const node = nodes[0]!
        const currentZ = node.zIndex ?? 0
        const below = elements
          .filter(el => (el.zIndex ?? 0) < currentZ)
          .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
        if (below.length > 0) {
          const nextZ = below[0]!.zIndex ?? 0
          store.updateElement(node.id, { zIndex: nextZ - 1 })
        }
      }
      break

    case 'lock':
      for (const node of nodes) {
        store.updateElement(node.id, { locked: true })
      }
      break

    case 'unlock':
      for (const node of nodes) {
        store.updateElement(node.id, { locked: false })
      }
      break

    case 'select-all':
      store.selection.selectMultiple(elements.map(el => el.id))
      break

    default:
      break
  }
}

// Use pointerdown in capture phase -- fires before workspace clears selection
function onDocumentPointerDown(e: Event) {
  if (!visible.value)
    return
  const target = e.target as HTMLElement
  if (target.closest('.ei-context-menu'))
    return
  visible.value = false
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
})

defineExpose({ onContextMenu })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="ei-context-menu"
      :style="{ left: `${menuX}px`, top: `${menuY}px` }"
      @click.stop
    >
      <template v-for="(group, gi) in snapshotGroups" :key="group.id">
        <div v-if="gi > 0" class="ei-context-menu__divider" />
        <div
          v-for="item in group.items"
          :key="item.id"
          class="ei-context-menu__item"
          :class="{
            'ei-context-menu__item--destructive': item.destructive,
            'ei-context-menu__item--disabled': item.disabled,
          }"
          @click="!item.disabled && handleAction(item)"
        >
          <component :is="item.icon" v-if="item.icon" class="ei-context-menu__icon" :size="14" :stroke-width="1.5" />
          <span class="ei-context-menu__label">{{ item.label }}</span>
          <span v-if="item.shortcut" class="ei-context-menu__shortcut">{{ item.shortcut }}</span>
        </div>
      </template>
      <div v-if="snapshotGroups.length === 0" class="ei-context-menu__empty">
        {{ store.t('designer.context.noActions') }}
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.ei-context-menu {
  position: fixed;
  z-index: 10000;
  background: var(--ei-menu-bg, #fff);
  border: 1px solid var(--ei-border-color, #e0e0e0);
  border-radius: 6px;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.12);
  padding: 4px 0;
  min-width: 180px;
  font-size: 12px;
}

.ei-context-menu__divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--ei-border-color, #e8e8e8);
}

.ei-context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  color: var(--ei-text, #333);
  white-space: nowrap;
  border-radius: 4px;
  margin: 0 4px;
  transition: background 0.15s;
}

.ei-context-menu__item:hover {
  background: var(--ei-hover-bg, #f0f0f0);
}

.ei-context-menu__item--destructive {
  color: var(--ei-danger, #ff4d4f);
}

.ei-context-menu__item--disabled {
  color: var(--ei-text-secondary, #999);
  cursor: not-allowed;
}

.ei-context-menu__item--disabled:hover {
  background: none;
}

.ei-context-menu__icon {
  flex-shrink: 0;
}

.ei-context-menu__label {
  flex: 1;
}

.ei-context-menu__shortcut {
  color: var(--ei-text-secondary, #999);
  font-size: 11px;
  margin-left: 16px;
}

.ei-context-menu__empty {
  padding: 8px 16px;
  color: var(--ei-text-secondary, #999);
  text-align: center;
}
</style>
