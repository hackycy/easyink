<script setup lang="ts">
import type { MaterialDataContract } from '@easyink/core'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { DatasourceFieldDragData } from '../composables/use-designer-drag-drop'
import { IconGripVertical } from '@easyink/icons'
import { computed, inject, onBeforeUnmount, ref, watchEffect } from 'vue'
import { DESIGNER_DRAG_DROP_KEY } from '../composables/use-designer-drag-drop'
import {
  applyMaterialDataSlotBinding,
  canBindMaterialDataSlot,
  clearMaterialDataSlotBinding,
  findMaterialDataSlotBinding,
  swapMaterialDataSlotBindings,
} from '../material-data-binding'

const props = defineProps<{
  element: MaterialNode
  contract: MaterialDataContract
  t: (key: string) => string
}>()

const emit = defineEmits<{
  updateBinding: [binding: BindingRef[] | undefined]
}>()

const dragDrop = inject(DESIGNER_DRAG_DROP_KEY, null)
const unregisterTargets: Array<() => void> = []
const draggingSlotId = ref<string>()
const dragOverSlotId = ref<string>()

const slots = computed(() =>
  [...props.contract.slots]
    .filter(slot => slot.kind === 'field')
    .sort((a, b) => a.bindIndex - b.bindIndex),
)

watchEffect((onCleanup) => {
  unregisterDropTargets()
  if (!dragDrop)
    return

  for (const slot of slots.value) {
    const target = {
      id: `${props.element.id}:material-data:${slot.id}`,
      element: () => document.getElementById(slotElementId(slot.id)),
      onDragOver: (data: DatasourceFieldDragData) => {
        const result = canBindMaterialDataSlot(props.contract, props.element.binding, data, slot.id)
        return {
          status: result.accepted ? 'accepted' as const : 'rejected' as const,
          label: result.accepted ? slot.label : result.messageKey ? props.t(result.messageKey) : result.message,
        }
      },
      onDrop: (data: DatasourceFieldDragData) => {
        const result = canBindMaterialDataSlot(props.contract, props.element.binding, data, slot.id)
        if (!result.accepted)
          return
        commitBindings(applyMaterialDataSlotBinding(props.contract, props.element.binding, data, slot.id))
      },
    }
    unregisterTargets.push(dragDrop.registerDatasourceDropTarget(target))
  }

  onCleanup(unregisterDropTargets)
})

onBeforeUnmount(unregisterDropTargets)

function bindingFor(slotId: string): BindingRef | undefined {
  return findMaterialDataSlotBinding(props.contract, props.element.binding, slotId)
}

function slotElementId(slotId: string): string {
  return `ei-material-data-slot-${props.element.id}-${slotId}`
}

function clearSlot(slotId: string) {
  commitBindings(clearMaterialDataSlotBinding(props.contract, props.element.binding, slotId))
}

function startRoleDrag(slotId: string) {
  draggingSlotId.value = slotId
}

function overRole(slotId: string) {
  if (!draggingSlotId.value || draggingSlotId.value === slotId)
    return
  dragOverSlotId.value = slotId
}

function dropRole(slotId: string) {
  const fromSlotId = draggingSlotId.value
  draggingSlotId.value = undefined
  dragOverSlotId.value = undefined
  if (!fromSlotId || fromSlotId === slotId)
    return
  commitBindings(swapMaterialDataSlotBindings(props.contract, props.element.binding, fromSlotId, slotId))
}

function endRoleDrag() {
  draggingSlotId.value = undefined
  dragOverSlotId.value = undefined
}

function commitBindings(bindings: BindingRef[]) {
  emit('updateBinding', bindings.length > 0 ? bindings : undefined)
}

function unregisterDropTargets() {
  while (unregisterTargets.length > 0)
    unregisterTargets.pop()?.()
}
</script>

<template>
  <div class="ei-material-data-binding">
    <div class="ei-material-data-binding__slots">
      <div
        v-for="slot in slots"
        :id="slotElementId(slot.id)"
        :key="slot.id"
        class="ei-material-data-binding__slot"
        :class="{
          'ei-material-data-binding__slot--over': dragOverSlotId === slot.id,
          'ei-material-data-binding__slot--empty': !bindingFor(slot.id),
        }"
        @dragover.prevent="overRole(slot.id)"
        @dragleave="dragOverSlotId = undefined"
        @drop.prevent="dropRole(slot.id)"
      >
        <button
          class="ei-material-data-binding__handle"
          type="button"
          draggable="true"
          @dragstart.stop="startRoleDrag(slot.id)"
          @dragend="endRoleDrag"
        >
          <IconGripVertical :size="14" :stroke-width="1.6" />
        </button>
        <div class="ei-material-data-binding__content">
          <div class="ei-material-data-binding__head">
            <span class="ei-material-data-binding__label">{{ slot.label }}</span>
            <span v-if="slot.required" class="ei-material-data-binding__required">{{ t('designer.materialDataBinding.required') }}</span>
            <button
              v-if="bindingFor(slot.id)"
              type="button"
              class="ei-material-data-binding__clear"
              @click="clearSlot(slot.id)"
            >
              {{ t('designer.materialDataBinding.clear') }}
            </button>
          </div>

          <template v-if="bindingFor(slot.id)">
            <div class="ei-material-data-binding__row">
              <span class="ei-material-data-binding__k">{{ t('designer.dataSource.source') }}</span>
              <span class="ei-material-data-binding__v">{{ bindingFor(slot.id)?.sourceName || bindingFor(slot.id)?.sourceId }}</span>
            </div>
            <div class="ei-material-data-binding__row">
              <span class="ei-material-data-binding__k">{{ t('designer.dataSource.field') }}</span>
              <div class="ei-material-data-binding__field">
                <span class="ei-material-data-binding__v">{{ bindingFor(slot.id)?.fieldLabel || bindingFor(slot.id)?.fieldPath }}</span>
                <span
                  v-if="bindingFor(slot.id)?.fieldLabel"
                  class="ei-material-data-binding__path"
                  :title="bindingFor(slot.id)?.fieldPath"
                >{{ bindingFor(slot.id)?.fieldPath }}</span>
              </div>
            </div>
          </template>
          <div v-else class="ei-material-data-binding__empty">
            {{ t('designer.materialDataBinding.dropField') }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-material-data-binding {
  width: 100%;

  &__slots {
    display: flex;
    flex-direction: column;
  }

  &__slot {
    display: flex;
    align-items: stretch;
    padding: 7px 0;
    border-top: 1px solid #f0f0f0;
    transition: background 0.12s, box-shadow 0.12s;

    &:first-child {
      border-top: none;
    }

    &--over {
      border-radius: 5px;
      background: color-mix(in srgb, var(--ei-primary, #1890ff) 8%, var(--ei-bg, #fff));
      outline: 1px solid color-mix(in srgb, var(--ei-primary, #1890ff) 35%, transparent);
      outline-offset: -1px;
    }

    &--empty {
      padding-bottom: 8px;
    }
  }

  &__content {
    flex: 1;
    min-width: 0;
    padding-left: 5px;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-bottom: 5px;
  }

  &__handle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: stretch;
    width: 20px;
    min-height: 100%;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--ei-text-secondary, #b8b8b8);
    cursor: grab;
    transition: background 0.12s, color 0.12s;

    &:hover {
      background: var(--ei-panel-header-bg, #f0f0f0);
      color: var(--ei-text-secondary, #777);
    }

    &:active {
      cursor: grabbing;
    }
  }

  &__row {
    display: flex;
    align-items: flex-start;
    gap: 6px;

    & + & {
      margin-top: 3px;
    }
  }

  &__label {
    color: var(--ei-text, #333);
    font-size: 12px;
    font-weight: 600;
  }

  &__required {
    padding: 1px 4px 0;
    border-radius: 3px;
    background: #fff1f0;
    color: #cf1322;
    font-size: 10px;
    line-height: 1.3;
  }

  &__clear {
    flex-shrink: 0;
    margin-left: auto;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--ei-text-secondary, #aaa);
    font-size: 11px;
    line-height: 18px;
    cursor: pointer;
    transition: color 0.12s;
    padding-right: 6px;

    &:hover {
      color: #cf1322;
    }
  }

  &__k {
    width: 28px;
    flex-shrink: 0;
    padding-top: 1px;
    color: var(--ei-text-secondary, #c8c8c8);
    font-size: 10px;
  }

  &__v {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--ei-text, #333);
    font-size: 12px;
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__field {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }

  &__path {
    overflow: hidden;
    color: var(--ei-text-secondary, #c0c0c0);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__empty {
    display: flex;
    align-items: center;
    min-height: 24px;
    padding: 0 8px;
    border: 1px dashed #dedede;
    border-radius: 5px;
    background: #fafafa;
    color: var(--ei-text-secondary, #999);
    font-size: 12px;
  }

}
</style>
