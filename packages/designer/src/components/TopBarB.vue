<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  IconBold,
  IconClear,
  IconClose,
  IconChevronLeft,
  IconChevronRight,
  IconCopy,
  IconDelete,
  IconDistribute,
  IconGroup,
  IconItalic,
  IconAlignLeft,
  IconAlignCenter,
  IconAlignRight,
  IconLayerUp,
  IconLayerDown,
  IconLock,
  IconManager,
  IconNewTemplate,
  IconPaste,
  IconRedo,
  IconRotation,
  IconSelectAll,
  IconSelectSameType,
  IconSnap,
  IconUnderline,
  IconUndo,
  IconUngroup,
  IconVisibility,
  IconZoomIn,
  IconZoomOut,
} from '@easyink/icons'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

const visibleGroups = computed(() =>
  store.workbench.toolbar.groups
    .filter(g => !g.hidden)
    .sort((a, b) => a.order - b.order),
)

const alignClass = computed(() => `ei-topbar-b--align-${store.workbench.toolbar.align}`)

// ─── Scroll carousel ────────────────────────────────────────────
const groupsRef = ref<HTMLElement | null>(null)
const canScrollLeft = ref(false)
const canScrollRight = ref(false)

function updateScrollState() {
  const el = groupsRef.value
  if (!el) return
  canScrollLeft.value = el.scrollLeft > 1
  canScrollRight.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 1
}

function scrollBy(dir: -1 | 1) {
  const el = groupsRef.value
  if (!el) return
  el.scrollBy({ left: dir * 120, behavior: 'smooth' })
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const el = groupsRef.value
  if (!el) return
  updateScrollState()
  el.addEventListener('scroll', updateScrollState, { passive: true })
  resizeObserver = new ResizeObserver(updateScrollState)
  resizeObserver.observe(el)
})

onUnmounted(() => {
  const el = groupsRef.value
  if (el) el.removeEventListener('scroll', updateScrollState)
  resizeObserver?.disconnect()
})

// ─── Handlers ───────────────────────────────────────────────────
function handleUndo() {
  store.commands.undo()
}

function handleRedo() {
  store.commands.redo()
}

function openToolbarManager() {
  const win = store.workbench.windows.find(w => w.kind === 'toolbar-manager')
  if (win) {
    win.visible = !win.visible
  }
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
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.newTemplate')">
            <IconNewTemplate :size="16" :stroke-width="1.5" />
          </button>
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.clear')">
            <IconClear :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- font -->
        <div v-else-if="group.id === 'font'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.bold')">
            <IconBold :size="16" :stroke-width="1.5" />
          </button>
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.italic')">
            <IconItalic :size="16" :stroke-width="1.5" />
          </button>
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.underline')">
            <IconUnderline :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- rotation -->
        <div v-else-if="group.id === 'rotation'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.rotation')">
            <IconRotation :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- visibility -->
        <div v-else-if="group.id === 'visibility'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.property.hidden')">
            <IconVisibility :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- select -->
        <div v-else-if="group.id === 'select'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.selectAll')">
            <IconSelectAll :size="16" :stroke-width="1.5" />
          </button>
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.selectSameType')">
            <IconSelectSameType :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- distribute -->
        <div v-else-if="group.id === 'distribute'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.distribute')">
            <IconDistribute :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- align -->
        <div v-else-if="group.id === 'align'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.alignLeft')">
            <IconAlignLeft :size="16" :stroke-width="1.5" />
          </button>
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.alignCenter')">
            <IconAlignCenter :size="16" :stroke-width="1.5" />
          </button>
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.alignRight')">
            <IconAlignRight :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- layer -->
        <div v-else-if="group.id === 'layer'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.layerUp')">
            <IconLayerUp :size="16" :stroke-width="1.5" />
          </button>
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.layerDown')">
            <IconLayerDown :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- group -->
        <div v-else-if="group.id === 'group'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.group')">
            <IconGroup :size="16" :stroke-width="1.5" />
          </button>
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.ungroup')">
            <IconUngroup :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- lock -->
        <div v-else-if="group.id === 'lock'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.lock')">
            <IconLock :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- clipboard -->
        <div v-else-if="group.id === 'clipboard'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.copy')">
            <IconCopy :size="16" :stroke-width="1.5" />
          </button>
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.paste')">
            <IconPaste :size="16" :stroke-width="1.5" />
          </button>
          <button
            class="ei-topbar-b__btn"
            :disabled="store.selection.isEmpty"
            :title="store.t('designer.toolbar.delete')"
            @click="store.selection.ids.forEach(id => store.removeElement(id))"
          >
            <IconDelete :size="16" :stroke-width="1.5" />
          </button>
        </div>

        <!-- snap -->
        <div v-else-if="group.id === 'snap'" class="ei-topbar-b__group">
          <button class="ei-topbar-b__btn" :title="store.t('designer.toolbar.snapToGrid')">
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

    <div class="ei-topbar-b__spacer" />

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
  padding: 0 8px;
  border-bottom: 1px solid var(--ei-border-color, #e0e0e0);
  background: var(--ei-topbar-bg, #fafafa);
  gap: 2px;
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
