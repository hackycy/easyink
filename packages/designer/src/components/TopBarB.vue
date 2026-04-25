<script setup lang="ts">
import type { MaterialNode } from '@easyink/schema'
import type { Component } from 'vue'
import {
  AddMaterialCommand,
  getBoundingRect,
  MoveMaterialCommand,
  normalizeRotation,
  RemoveMaterialCommand,
  RotateMaterialCommand,
  UpdateMaterialPropsCommand,
} from '@easyink/core'
import {
  IconAlignCenter,
  IconAlignLeft,
  IconAlignRight,
  IconBold,
  IconBug,
  IconChevronLeft,
  IconChevronRight,
  IconClear,
  IconCopy,
  IconDatabase,
  IconDelete,
  IconDistribute,
  IconGroup,
  IconHistory,
  IconItalic,
  IconLayerDown,
  IconLayerUp,
  IconListTree,
  IconLock,
  IconManager,
  IconMap,
  IconNewTemplate,
  IconPanelMaterials,
  IconPaste,
  IconRedo,
  IconRotation,
  IconSelectAll,
  IconSelectSameType,
  IconSliders,
  IconSnap,
  IconUnderline,
  IconUndo,
  IconUngroup,
  IconVisibility,
  IconZoomIn,
  IconZoomOut,
} from '@easyink/icons'
import { createDefaultSchema } from '@easyink/schema'
import { deepClone, generateId } from '@easyink/shared'
import { computed, inject, onMounted, onUnmounted, ref } from 'vue'
import { useDesignerStore } from '../composables'
import { CONTRIBUTION_REGISTRY_KEY } from '../contributions/injection'

const contributionRegistry = inject(CONTRIBUTION_REGISTRY_KEY, undefined)
const toolbarActions = computed(() => contributionRegistry?.registry.toolbarActions ?? [])

const store = useDesignerStore()

// ─── Window Toggle Definitions ─────────────────────────────────

interface WindowToggle {
  kind: string
  labelKey: string
  icon: Component
}

const windowToggles: WindowToggle[] = [
  { kind: 'materials', labelKey: 'designer.panel.materials', icon: IconPanelMaterials },
  { kind: 'datasource', labelKey: 'designer.panel.datasource', icon: IconDatabase },
  { kind: 'properties', labelKey: 'designer.panel.properties', icon: IconSliders },
  { kind: 'structure-tree', labelKey: 'designer.panel.structureTree', icon: IconListTree },
  { kind: 'history', labelKey: 'designer.panel.history', icon: IconHistory },
  { kind: 'minimap', labelKey: 'designer.panel.minimap', icon: IconMap },
  { kind: 'debug', labelKey: 'designer.panel.debug', icon: IconBug },
]

function isWindowVisible(kind: string): boolean {
  const win = store.workbench.windows.find(w => w.kind === kind)
  return win ? win.visible : false
}

function toggleWindow(kind: string) {
  const win = store.workbench.windows.find(w => w.kind === kind)
  if (win)
    win.visible = !win.visible
}

const visibleGroups = computed(() =>
  store.workbench.toolbar.groups
    .filter(g => !g.hidden)
    .sort((a, b) => a.order - b.order),
)

const alignClass = computed(() => `ei-topbar-b--align-${store.workbench.toolbar.align}`)

// ─── Helpers ──────────────────────────────────────────────────
const selectedNodes = computed<MaterialNode[]>(() =>
  store.selection.ids
    .map(id => store.getElementById(id))
    .filter((n): n is MaterialNode => n != null),
)

const hasSelection = computed(() => !store.selection.isEmpty)

// ─── Scroll carousel ────────────────────────────────────────────
const groupsRef = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function updateScrollState() {
  const el = groupsRef.value
  if (!el)
    return
  canScrollLeft.value = el.scrollLeft > 1
  canScrollRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 1
}

function scrollBy(dir: -1 | 1) {
  const el = groupsRef.value
  if (!el)
    return
  el.scrollBy({ left: dir * 120, behavior: 'smooth' })
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const el = groupsRef.value
  if (!el)
    return
  updateScrollState()
  el.addEventListener('scroll', updateScrollState, { passive: true })
  resizeObserver = new ResizeObserver(updateScrollState)
  resizeObserver.observe(el)
})

onUnmounted(() => {
  const el = groupsRef.value
  if (el)
    el.removeEventListener('scroll', updateScrollState)
  resizeObserver?.disconnect()
})

// ─── Undo / Redo ─────────────────────────────────────────────
function handleUndo() {
  store.commands.undo()
}

function handleRedo() {
  store.commands.redo()
}

// ─── Toolbar Manager ─────────────────────────────────────────
function openToolbarManager() {
  const win = store.workbench.windows.find(w => w.kind === 'toolbar-manager')
  if (win) {
    win.visible = !win.visible
  }
}

// ─── New / Clear ─────────────────────────────────────────────
function handleNewTemplate() {
  store.setSchema(createDefaultSchema())
}

function handleClear() {
  if (store.schema.elements.length === 0)
    return
  // eslint-disable-next-line no-alert
  if (!confirm(store.t('designer.message.confirmClear')))
    return
  store.setSchema(createDefaultSchema())
}

// ─── Font Style (bold / italic / underline) ──────────────────
function toggleFontProp(prop: 'fontWeight' | 'fontStyle' | 'textDecoration') {
  const nodes = selectedNodes.value
  if (nodes.length === 0)
    return

  const elements = store.schema.elements
  store.commands.beginTransaction(`Toggle ${prop}`)
  for (const node of nodes) {
    const current = node.props[prop]
    let next: unknown
    if (prop === 'fontWeight') {
      next = current === 'bold' ? 'normal' : 'bold'
    }
    else if (prop === 'fontStyle') {
      next = current === 'italic' ? 'normal' : 'italic'
    }
    else {
      next = current === 'underline' ? 'none' : 'underline'
    }
    store.commands.execute(
      new UpdateMaterialPropsCommand(elements, node.id, { [prop]: next }),
    )
  }
  store.commands.commitTransaction()
}

function handleBold() {
  toggleFontProp('fontWeight')
}
function handleItalic() {
  toggleFontProp('fontStyle')
}
function handleUnderline() {
  toggleFontProp('textDecoration')
}

// ─── Rotation ────────────────────────────────────────────────
function handleRotation() {
  const nodes = selectedNodes.value
  if (nodes.length === 0)
    return

  const elements = store.schema.elements
  store.commands.beginTransaction('Rotate +90')
  for (const node of nodes) {
    const next = normalizeRotation((node.rotation ?? 0) + 90)
    store.commands.execute(
      new RotateMaterialCommand(elements, node.id, next),
    )
  }
  store.commands.commitTransaction()
}

// ─── Visibility ──────────────────────────────────────────────
function handleVisibility() {
  const nodes = selectedNodes.value
  if (nodes.length === 0)
    return

  for (const node of nodes) {
    store.updateElement(node.id, { hidden: !node.hidden })
  }
}

// ─── Select ──────────────────────────────────────────────────
function handleSelectAll() {
  store.selection.selectMultiple(store.schema.elements.map(el => el.id))
}

function handleSelectSameType() {
  const nodes = selectedNodes.value
  if (nodes.length === 0)
    return

  const types = new Set(nodes.map(n => n.type))
  const sameTypeIds = store.schema.elements
    .filter(el => types.has(el.type))
    .map(el => el.id)
  store.selection.selectMultiple(sameTypeIds)
}

// ─── Distribute ──────────────────────────────────────────────
function handleDistribute() {
  const nodes = selectedNodes.value
  if (nodes.length < 3)
    return

  const sorted = [...nodes].sort((a, b) => a.x - b.x)
  const first = sorted[0]!
  const last = sorted[sorted.length - 1]!
  const totalSpan = (last.x + last.width) - first.x
  const totalWidth = sorted.reduce((sum, n) => sum + n.width, 0)
  const gap = (totalSpan - totalWidth) / (sorted.length - 1)

  const elements = store.schema.elements
  store.commands.beginTransaction('Distribute horizontally')
  let currentX = first.x + first.width + gap
  for (let i = 1; i < sorted.length - 1; i++) {
    const node = sorted[i]!
    store.commands.execute(
      new MoveMaterialCommand(elements, node.id, { x: currentX, y: node.y }),
    )
    currentX += node.width + gap
  }
  store.commands.commitTransaction()
}

// ─── Align ───────────────────────────────────────────────────
function handleAlign(mode: 'left' | 'center' | 'right') {
  const nodes = selectedNodes.value
  if (nodes.length < 2)
    return

  const rects = nodes.map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height }))
  const bounds = getBoundingRect(rects)
  if (!bounds)
    return

  const elements = store.schema.elements
  store.commands.beginTransaction(`Align ${mode}`)
  for (const node of nodes) {
    let newX = node.x
    if (mode === 'left') {
      newX = bounds.x
    }
    else if (mode === 'center') {
      newX = bounds.x + (bounds.width - node.width) / 2
    }
    else {
      newX = bounds.x + bounds.width - node.width
    }
    if (newX !== node.x) {
      store.commands.execute(
        new MoveMaterialCommand(elements, node.id, { x: newX, y: node.y }),
      )
    }
  }
  store.commands.commitTransaction()
}

// ─── Layer ───────────────────────────────────────────────────
function handleLayerUp() {
  const nodes = selectedNodes.value
  if (nodes.length === 0)
    return

  const elements = store.schema.elements
  for (const node of nodes) {
    const currentZ = node.zIndex ?? 0
    const above = elements
      .filter(el => (el.zIndex ?? 0) > currentZ)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
    if (above.length > 0) {
      const nextZ = above[0]!.zIndex ?? 0
      store.updateElement(node.id, { zIndex: nextZ + 1 })
    }
  }
}

function handleLayerDown() {
  const nodes = selectedNodes.value
  if (nodes.length === 0)
    return

  const elements = store.schema.elements
  for (const node of nodes) {
    const currentZ = node.zIndex ?? 0
    const below = elements
      .filter(el => (el.zIndex ?? 0) < currentZ)
      .sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
    if (below.length > 0) {
      const prevZ = below[0]!.zIndex ?? 0
      store.updateElement(node.id, { zIndex: prevZ - 1 })
    }
  }
}

// ─── Group / Ungroup ─────────────────────────────────────────
function handleGroup() {
  const nodes = selectedNodes.value
  if (nodes.length < 2)
    return

  const rects = nodes.map(n => ({ x: n.x, y: n.y, width: n.width, height: n.height }))
  const bounds = getBoundingRect(rects)
  if (!bounds)
    return

  const elements = store.schema.elements
  const children: MaterialNode[] = nodes.map(n => ({
    ...deepClone(n),
    x: n.x - bounds.x,
    y: n.y - bounds.y,
  }))

  store.commands.beginTransaction('Group')
  for (const node of nodes) {
    store.commands.execute(new RemoveMaterialCommand(elements, node.id))
  }
  const groupNode: MaterialNode = {
    id: generateId('grp'),
    type: 'group',
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    props: {},
    children,
  }
  store.commands.execute(new AddMaterialCommand(elements, groupNode))
  store.commands.commitTransaction()

  store.selection.select(groupNode.id)
}

function handleUngroup() {
  const nodes = selectedNodes.value
  if (nodes.length === 0)
    return

  const elements = store.schema.elements
  const ungroupedIds: string[] = []

  store.commands.beginTransaction('Ungroup')
  for (const node of nodes) {
    if (node.type !== 'group' || !node.children?.length)
      continue
    const children = node.children.map(c => ({
      ...deepClone(c),
      id: generateId('el'),
      x: c.x + node.x,
      y: c.y + node.y,
    }))
    store.commands.execute(new RemoveMaterialCommand(elements, node.id))
    for (const child of children) {
      store.commands.execute(new AddMaterialCommand(elements, child))
      ungroupedIds.push(child.id)
    }
  }
  store.commands.commitTransaction()

  if (ungroupedIds.length > 0) {
    store.selection.selectMultiple(ungroupedIds)
  }
}

// ─── Lock ────────────────────────────────────────────────────
function handleLock() {
  const nodes = selectedNodes.value
  if (nodes.length === 0)
    return

  const allLocked = nodes.every(n => n.locked)
  for (const node of nodes) {
    store.updateElement(node.id, { locked: !allLocked })
  }
}

// ─── Clipboard ───────────────────────────────────────────────
function handleCopy() {
  const nodes = selectedNodes.value
  if (nodes.length === 0)
    return
  store.clipboard = nodes.map(n => deepClone(n))
}

function handlePaste() {
  if (store.clipboard.length === 0)
    return

  const elements = store.schema.elements
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

function handleDelete() {
  const nodes = selectedNodes.value
  if (nodes.length === 0)
    return

  const elements = store.schema.elements
  store.commands.beginTransaction('Delete')
  for (const node of nodes) {
    store.commands.execute(new RemoveMaterialCommand(elements, node.id))
  }
  store.commands.commitTransaction()
  store.selection.clear()
}

// ─── Snap ────────────────────────────────────────────────────
function handleSnap() {
  store.workbench.snap.enabled = !store.workbench.snap.enabled
}
</script>

<template>
  <div class="ei-topbar-b" :class="alignClass">
    <button
      class="ei-topbar-b__btn"
      :title="store.t('designer.toolbar.manager')"
      @click="openToolbarManager"
    >
      <IconManager :size="16" :stroke-width="1.5" />
    </button>

    <div class="ei-topbar-b__divider" />

    <!-- Window toggle buttons -->
    <div class="ei-topbar-b__group ei-topbar-b__window-toggles">
      <button
        v-for="wt in windowToggles"
        :key="wt.kind"
        class="ei-topbar-b__btn"
        :class="{ 'ei-topbar-b__btn--active': isWindowVisible(wt.kind) }"
        :title="store.t(wt.labelKey)"
        @click="toggleWindow(wt.kind)"
      >
        <component :is="wt.icon" :size="16" :stroke-width="1.5" />
      </button>
      <button
        v-for="action in toolbarActions"
        :key="action.id"
        class="ei-topbar-b__btn ei-topbar-b__btn--contribution"
        :title="action.label"
        @click="contributionRegistry && action.onClick(contributionRegistry.context)"
      >
        <component :is="action.icon" :size="16" :stroke-width="1.5" />
      </button>
    </div>

    <div class="ei-topbar-b__divider" />

    <!-- Scroll left arrow -->
    <button
      v-show="canScrollLeft"
      class="ei-topbar-b__scroll-btn"
      @click="scrollBy(-1)"
    >
      <IconChevronLeft :size="14" :stroke-width="1.5" />
    </button>

    <div ref="groupsRef" class="ei-topbar-b__groups">
      <template v-for="(group, idx) in visibleGroups" :key="group.id">
        <div v-if="idx > 0 && !group.hideDivider" class="ei-topbar-b__divider" />

        <!-- undo-redo -->
        <div v-if="group.id === 'undo-redo'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :disabled="!store.commands.canUndo"
            :title="store.t('designer.toolbar.undo')"
            @click="handleUndo"
          >
            <IconUndo :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="!store.commands.canRedo"
            :title="store.t('designer.toolbar.redo')"
            @click="handleRedo"
          >
            <IconRedo :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- new-clear -->
        <div v-else-if="group.id === 'new-clear'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :title="store.t('designer.toolbar.newTemplate')"
            @click="handleNewTemplate"
          >
            <IconNewTemplate :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :title="store.t('designer.toolbar.clear')"
            @click="handleClear"
          >
            <IconClear :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- font -->
        <div v-else-if="group.id === 'font'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="store.t('designer.toolbar.bold')"
            @click="handleBold"
          >
            <IconBold :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="store.t('designer.toolbar.italic')"
            @click="handleItalic"
          >
            <IconItalic :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="store.t('designer.toolbar.underline')"
            @click="handleUnderline"
          >
            <IconUnderline :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- rotation -->
        <div v-else-if="group.id === 'rotation'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="store.t('designer.toolbar.rotation')"
            @click="handleRotation"
          >
            <IconRotation :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- visibility -->
        <div v-else-if="group.id === 'visibility'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="store.t('designer.property.hidden')"
            @click="handleVisibility"
          >
            <IconVisibility :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- select -->
        <div v-else-if="group.id === 'select'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :title="store.t('designer.toolbar.selectAll')"
            @click="handleSelectAll"
          >
            <IconSelectAll :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="store.t('designer.toolbar.selectSameType')"
            @click="handleSelectSameType"
          >
            <IconSelectSameType :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- distribute -->
        <div v-else-if="group.id === 'distribute'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :disabled="selectedNodes.length < 3"
            :title="store.t('designer.toolbar.distribute')"
            @click="handleDistribute"
          >
            <IconDistribute :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- align -->
        <div v-else-if="group.id === 'align'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :disabled="selectedNodes.length < 2"
            :title="store.t('designer.toolbar.alignLeft')"
            @click="handleAlign('left')"
          >
            <IconAlignLeft :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="selectedNodes.length < 2"
            :title="store.t('designer.toolbar.alignCenter')"
            @click="handleAlign('center')"
          >
            <IconAlignCenter :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="selectedNodes.length < 2"
            :title="store.t('designer.toolbar.alignRight')"
            @click="handleAlign('right')"
          >
            <IconAlignRight :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- layer -->
        <div v-else-if="group.id === 'layer'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="store.t('designer.toolbar.layerUp')"
            @click="handleLayerUp"
          >
            <IconLayerUp :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="store.t('designer.toolbar.layerDown')"
            @click="handleLayerDown"
          >
            <IconLayerDown :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- group -->
        <div v-else-if="group.id === 'group'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :disabled="selectedNodes.length < 2"
            :title="store.t('designer.toolbar.group')"
            @click="handleGroup"
          >
            <IconGroup :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="!selectedNodes.some(n => n.type === 'group')"
            :title="store.t('designer.toolbar.ungroup')"
            @click="handleUngroup"
          >
            <IconUngroup :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- lock -->
        <div v-else-if="group.id === 'lock'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="selectedNodes.every(n => n.locked) ? store.t('designer.toolbar.unlock') : store.t('designer.toolbar.lock')"
            @click="handleLock"
          >
            <IconLock :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- clipboard -->
        <div v-else-if="group.id === 'clipboard'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="store.t('designer.toolbar.copy')"
            @click="handleCopy"
          >
            <IconCopy :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="store.clipboard.length === 0"
            :title="store.t('designer.toolbar.paste')"
            @click="handlePaste"
          >
            <IconPaste :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="!hasSelection"
            :title="store.t('designer.toolbar.delete')"
            @click="handleDelete"
          >
            <IconDelete :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- snap -->
        <div v-else-if="group.id === 'snap'" class="ei-topbar-b__group">
          <button
            class="ei-topbar-b__btn"
            :class="{ 'ei-topbar-b__btn--active': store.workbench.snap.enabled }"
            :title="store.t('designer.toolbar.snapToGrid')"
            @click="handleSnap"
          >
            <IconSnap :size="16" :stroke-width="1.5" />
          </button>
        </div>
      </template>
    </div>

    <!-- Scroll right arrow -->
    <button
      v-show="canScrollRight"
      class="ei-topbar-b__scroll-btn"
      @click="scrollBy(1)"
    >
      <IconChevronRight :size="14" :stroke-width="1.5" />
    </button>

    <!-- <div class="ei-topbar-b__spacer" /> -->

    <div class="ei-topbar-b__zoom">
      <button
        class="ei-topbar-b__btn"
        :title="store.t('designer.toolbar.zoomOut')"
        @click="store.workbench.viewport.zoom = Math.max(0.25, store.workbench.viewport.zoom - 0.1)"
      >
        <IconZoomOut :size="16" :stroke-width="1.5" />
      </button>
      <span class="ei-topbar-b__zoom-label">{{ Math.round(store.workbench.viewport.zoom * 100) }}%</span>
      <button
        class="ei-topbar-b__btn"
        :title="store.t('designer.toolbar.zoomIn')"
        @click="store.workbench.viewport.zoom = Math.min(4, store.workbench.viewport.zoom + 0.1)"
      >
        <IconZoomIn :size="16" :stroke-width="1.5" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.ei-topbar-b {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 4px;
  border-bottom: 1px solid var(--ei-border-color, #e0e0e0);
  background: var(--ei-topbar-bg, #fafafa);
  gap: 4px;
}

.ei-topbar-b__groups {
  display: flex;
  align-items: center;
  gap: 2px;
  overflow-x: hidden;
  flex: 1;
  min-width: 0;
  scroll-behavior: smooth;
}

.ei-topbar-b--align-center .ei-topbar-b__groups {
  justify-content: center;
}

.ei-topbar-b--align-end .ei-topbar-b__groups {
  justify-content: flex-end;
}

.ei-topbar-b__group {
  display: flex;
  gap: 1px;
  flex-shrink: 0;
}

.ei-topbar-b__window-toggles {
  overflow: hidden;
  flex-shrink: 1;
  min-width: 0;
}

.ei-topbar-b__btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  color: var(--ei-text, #333);
}

.ei-topbar-b__btn:hover:not(:disabled) {
  background: var(--ei-hover-bg, #e8e8e8);
}

.ei-topbar-b__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.ei-topbar-b__btn--active {
  background: var(--ei-active-bg, #d0d0d0);
  border-color: var(--ei-border-color, #e0e0e0);
}

.ei-topbar-b__btn--contribution {
  color: var(--ei-primary, #4f46e5);
}

.ei-topbar-b__btn--contribution:hover {
  background: var(--ei-primary-light, rgba(79, 70, 229, 0.1));
}

.ei-topbar-b__scroll-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 3px;
  background: transparent;
  cursor: pointer;
  color: var(--ei-text-secondary, #999);
  flex-shrink: 0;
}

.ei-topbar-b__scroll-btn:hover {
  background: var(--ei-hover-bg, #e8e8e8);
  color: var(--ei-text, #333);
}

.ei-topbar-b__divider {
  width: 1px;
  height: 20px;
  background: var(--ei-border-color, #e0e0e0);
  flex-shrink: 0;
}

.ei-topbar-b__spacer {
  flex: 1;
}

.ei-topbar-b__zoom {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.ei-topbar-b__zoom-label {
  font-size: 12px;
  min-width: 40px;
  text-align: center;
  user-select: none;
}
</style>
