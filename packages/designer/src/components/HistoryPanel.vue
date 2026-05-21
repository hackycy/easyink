<script setup lang="ts">
import type { HistoryEntry } from '@easyink/core'
import { nextTick, ref, watchEffect } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

const TYPE_TO_LOCALE: Record<string, string> = {
  'add-material': 'designer.history.addMaterial',
  'remove-material': 'designer.history.removeMaterial',
  'add-element-group': 'designer.history.addElementGroup',
  'remove-element-group': 'designer.history.removeElementGroup',
  'move-material': 'designer.history.moveMaterial',
  'resize-material': 'designer.history.resizeMaterial',
  'rotate-material': 'designer.history.rotateMaterial',
  'update-material-meta': 'designer.history.updateMeta',
  'update-material-props': 'designer.history.updateProps',
  'update-material-behavior': 'designer.history.updateBehavior',
  'update-page': 'designer.history.updatePage',
  'add-page-sheet': 'designer.history.addPageSheet',
  'remove-page-sheet': 'designer.history.removePageSheet',
  'update-guides': 'designer.history.updateGuides',
  'update-document': 'designer.history.updateDocument',
  'update-geometry': 'designer.history.updateGeometry',
  'bind-field': 'designer.history.bindField',
  'clear-binding': 'designer.history.clearBinding',
  'update-binding-format': 'designer.history.updateBindingFormat',
  'import-template': 'designer.history.importTemplate',
  'batch': 'designer.history.batch',
  'union-drop': 'designer.history.unionDrop',
  'patch': 'designer.history.patch',
  'insert-table-row': 'designer.history.insertTableRow',
  'remove-table-row': 'designer.history.removeTableRow',
  'resize-table-column': 'designer.history.resizeTableColumn',
  'update-table-visibility': 'designer.history.updateTableVisibility',
  'update-table-cell': 'designer.history.updateTableCell',
  'update-table-section': 'designer.history.updateTableSection',
  'update-usage': 'designer.history.updateUsage',
}

function localizeEntry(entry: HistoryEntry): string {
  const key = TYPE_TO_LOCALE[entry.type]
  return store.t(key ?? entry.description)
}

const entries = ref<HistoryEntry[]>([])
const cursor = ref(0)
const listEl = ref<HTMLElement>()

function sync() {
  entries.value = store.commands.historyEntries
  cursor.value = store.commands.cursor
  nextTick(scrollToCursor)
}

function scrollToCursor() {
  if (!listEl.value)
    return
  const active = listEl.value.querySelector('.ei-history-panel__item--active') as HTMLElement | null
  if (active)
    active.scrollIntoView({ block: 'nearest' })
}

function handleClick(index: number) {
  store.commands.goTo(index)
}

const dispose = store.commands.onChange(sync)
sync()

watchEffect((onCleanup) => {
  onCleanup(dispose)
})
</script>

<template>
  <div class="ei-history-panel">
    <div ref="listEl" class="ei-history-panel__list">
      <div
        class="ei-history-panel__item"
        :class="{ 'ei-history-panel__item--active': cursor === 0 }"
        @click="handleClick(0)"
      >
        {{ store.t('designer.history.initialState') }}
      </div>
      <div
        v-for="(entry, i) in entries"
        :key="entry.id"
        class="ei-history-panel__item"
        :class="{
          'ei-history-panel__item--active': cursor === i + 1,
          'ei-history-panel__item--undone': i + 1 > cursor,
        }"
        @click="handleClick(i + 1)"
      >
        {{ localizeEntry(entry) }}
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-history-panel {
  font-size: 12px;

  &__list {
    display: flex;
    flex-direction: column;
  }

  &__item {
    padding: 4px 8px;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &:hover {
      background: var(--ei-hover-bg, #f0f0f0);
    }

    &--active {
      background: var(--ei-selected-bg, #e6f7ff);
      color: var(--ei-primary, #1890ff);

      &:hover {
        background: var(--ei-selected-bg, #e6f7ff);
      }
    }

    &--undone {
      opacity: 0.4;
    }
  }
}
</style>
