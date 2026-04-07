<script setup lang="ts">
import type { MaterialNode } from '@easyink/schema'
import type { ContextAction } from '../types'
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useDesignerStore } from '../composables'
import {
  AddMaterialCommand,
  RemoveMaterialCommand,
  ClearBindingCommand,
} from '@easyink/core'
import { deepClone, generateId } from '@easyink/shared'

const store = useDesignerStore()

const visible = ref(false)
const menuX = ref(0)
const menuY = ref(0)

// Snapshot the actions at open time so selection changes don't cause menu flicker
const snapshotActions = ref<ContextAction[]>([])

const selectedNodes = computed<MaterialNode[]>(() => {
  return store.selection.ids
    .map(id => store.getElementById(id))
    .filter((n): n is MaterialNode => n != null)
})

function buildActions(isBlank: boolean): ContextAction[] {
  const nodes = selectedNodes.value
  if (isBlank || nodes.length === 0) {
    return [
      { id: 'paste', label: store.t('designer.context.paste') },
      { id: 'select-all', label: store.t('designer.context.selectAll') },
    ]
  }

  const actions: ContextAction[] = [
    { id: 'copy', label: store.t('designer.context.copy') },
    { id: 'cut', label: store.t('designer.context.cut') },
    { id: 'delete', label: store.t('designer.context.delete'), destructive: true },
  ]

  if (nodes.length === 1) {
    const node = nodes[0]!
    actions.push(
      { id: 'bring-front', label: store.t('designer.context.bringToFront') },
      { id: 'send-back', label: store.t('designer.context.sendToBack') },
    )

    if (node.locked) {
      actions.push({ id: 'unlock', label: store.t('designer.context.unlock') })
    }
    else {
      actions.push({ id: 'lock', label: store.t('designer.context.lock') })
    }

    if (node.binding) {
      actions.push({ id: 'clear-binding', label: store.t('designer.context.clearBinding') })
    }

    const ext = store.getDesignerExtension(node.type)
    const extActions = ext?.getContextActions?.(node) ?? []
    actions.push(...extActions)
  }

  return actions
}

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  menuX.value = e.clientX
  menuY.value = e.clientY

  const target = e.target as HTMLElement
  const isBlank = !target.closest('.ei-canvas-element')

  // Snapshot actions at open time — immune to later selection changes
  snapshotActions.value = buildActions(isBlank)
  visible.value = true
}

function handleAction(action: ContextAction) {
  visible.value = false

  const nodes = selectedNodes.value
  const elements = store.schema.elements

  switch (action.id) {
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

    case 'clear-binding':
      if (nodes.length === 1) {
        const cmd = new ClearBindingCommand(elements, nodes[0]!.id)
        store.commands.execute(cmd)
      }
      break

    case 'select-all':
      store.selection.selectMultiple(elements.map(el => el.id))
      break

    default:
      break
  }
}

// Use pointerdown in capture phase — fires before workspace clears selection
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
      <div
        v-for="action in snapshotActions"
        :key="action.id"
        class="ei-context-menu__item"
        :class="{
          'ei-context-menu__item--destructive': action.destructive,
          'ei-context-menu__item--disabled': action.disabled,
        }"
        @click="!action.disabled && handleAction(action)"
      >
        {{ action.label || action.id }}
      </div>
      <div v-if="snapshotActions.length === 0" class="ei-context-menu__empty">
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
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  padding: 4px 0;
  min-width: 140px;
  font-size: 12px;
}

.ei-context-menu__item {
  padding: 6px 16px;
  cursor: pointer;
  color: var(--ei-text, #333);
  white-space: nowrap;
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

.ei-context-menu__empty {
  padding: 8px 16px;
  color: var(--ei-text-secondary, #999);
  text-align: center;
}
</style>
