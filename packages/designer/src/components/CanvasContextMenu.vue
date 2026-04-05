<script setup lang="ts">
import type { MaterialNode } from '@easyink/schema'
import type { ContextAction } from '../types'
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useDesignerStore } from '../composables'
import {
  RemoveMaterialCommand,
  MoveMaterialCommand,
  RotateMaterialCommand,
  ClearBindingCommand,
} from '@easyink/core'

const store = useDesignerStore()

const visible = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const targetNodeId = ref<string | undefined>()

const selectedNodes = computed<MaterialNode[]>(() => {
  return store.selection.ids
    .map(id => store.getElementById(id))
    .filter((n): n is MaterialNode => n != null)
})

const builtinActions = computed<ContextAction[]>(() => {
  const nodes = selectedNodes.value
  if (nodes.length === 0) {
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
  }

  return actions
})

const materialActions = computed<ContextAction[]>(() => {
  if (selectedNodes.value.length !== 1)
    return []
  const node = selectedNodes.value[0]!
  const ext = store.getDesignerExtension(node.type)
  return ext?.getContextActions?.(node) ?? []
})

const allActions = computed(() => [...builtinActions.value, ...materialActions.value])

function onContextMenu(e: MouseEvent) {
  e.preventDefault()
  menuX.value = e.clientX
  menuY.value = e.clientY

  // Check if right-clicking on a specific element
  const target = e.target as HTMLElement
  const elDiv = target.closest('.ei-canvas-element') as HTMLElement | null
  if (elDiv) {
    // Find element id from sibling data or iteration context
    // In the current architecture the element id is not stored as data attribute.
    // We'll leave the selection as-is (the pointerdown already selected it).
  }

  visible.value = true
}

function handleAction(action: ContextAction) {
  visible.value = false

  const nodes = selectedNodes.value
  const elements = store.schema.elements

  switch (action.id) {
    case 'delete':
      for (const node of nodes) {
        const cmd = new RemoveMaterialCommand(elements, node.id)
        store.commands.execute(cmd)
      }
      store.selection.clear()
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

    default: {
      // Material extension actions -- delegate back to extension
      if (nodes.length === 1) {
        const ext = store.getDesignerExtension(nodes[0]!.type)
        if (ext?.getContextActions) {
          // Extension handles its own action via the store
        }
      }
      break
    }
  }
}

function closeMenu() {
  visible.value = false
}

// Close menu on any click outside
function onDocumentClick() {
  if (visible.value)
    visible.value = false
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick)
})

onUnmounted(() => {
  document.removeEventListener('click', onDocumentClick)
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
        v-for="action in allActions"
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
      <div v-if="allActions.length === 0" class="ei-context-menu__empty">
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
