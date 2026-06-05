<script setup lang="ts">
import type { MaterialDataContract } from '@easyink/core'
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { BindingRef, DataContractBinding, DataContractFieldMapping, MaterialNode } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import type { DatasourceFieldDragData } from '../composables/use-designer-drag-drop'
import { IconGripVertical } from '@easyink/icons'
import { computed, inject, onBeforeUnmount, ref, watchEffect } from 'vue'
import { DESIGNER_DRAG_DROP_KEY } from '../composables/use-designer-drag-drop'
import {
  applyMaterialDataFieldMapping,
  canBindMaterialDataField,
  clearMaterialDataFieldMapping,
  findMaterialDataFieldMapping,
  swapMaterialDataFieldMappings,
} from '../material-data-binding'
import BindingFormatEditor from './BindingFormatEditor.vue'

const props = defineProps<{
  element: MaterialNode
  contract: MaterialDataContract
  t: (key: string) => string
  getDataSource?: (sourceId: string) => DataSourceDescriptor | undefined
}>()

const emit = defineEmits<{
  updateBinding: [binding: DataContractBinding | undefined]
}>()

const dragDrop = inject(DESIGNER_DRAG_DROP_KEY, null)
const unregisterTargets: Array<() => void> = []
const draggingFieldId = ref<string>()
const dragOverFieldId = ref<string>()

const fields = computed(() =>
  Object.entries(props.contract.model.fields).map(([id, field]) => ({ id, field })),
)

watchEffect((onCleanup) => {
  unregisterDropTargets()
  if (!dragDrop)
    return

  for (const entry of fields.value) {
    const target = {
      id: `${props.element.id}:material-data:${entry.id}`,
      element: () => document.getElementById(fieldElementId(entry.id)),
      onDragOver: (data: DatasourceFieldDragData) => {
        const result = canBindMaterialDataField(props.contract, props.element.binding, data, entry.id)
        return {
          status: result.accepted ? 'accepted' as const : 'rejected' as const,
          label: result.accepted ? props.t(entry.field.labelKey) : result.messageKey ? props.t(result.messageKey) : result.message,
        }
      },
      onDrop: (data: DatasourceFieldDragData) => {
        const result = canBindMaterialDataField(props.contract, props.element.binding, data, entry.id)
        if (!result.accepted)
          return
        commitBinding(applyMaterialDataFieldMapping(props.contract, props.element.binding, data, entry.id))
      },
    }
    unregisterTargets.push(dragDrop.registerDatasourceDropTarget(target))
  }

  onCleanup(unregisterDropTargets)
})

onBeforeUnmount(unregisterDropTargets)

function mappingFor(fieldId: string): DataContractFieldMapping | undefined {
  return findMaterialDataFieldMapping(props.contract, props.element.binding, fieldId)
}

function mappingBindingFor(fieldId: string): BindingRef | undefined {
  const mapping = mappingFor(fieldId)
  if (!mapping)
    return undefined
  return {
    sourceId: mapping.sourceId,
    sourceName: mapping.sourceName,
    sourceTag: mapping.sourceTag,
    fieldPath: mapping.select.path,
    fieldKey: mapping.select.key,
    fieldLabel: mapping.select.label,
    format: mapping.format,
  }
}

function fieldElementId(fieldId: string): string {
  return `ei-material-data-field-${props.element.id}-${fieldId}`
}

function clearField(fieldId: string) {
  commitBinding(clearMaterialDataFieldMapping(props.contract, props.element.binding, fieldId))
}

function startFieldDrag(fieldId: string) {
  draggingFieldId.value = fieldId
}

function overField(fieldId: string) {
  if (!draggingFieldId.value || draggingFieldId.value === fieldId)
    return
  dragOverFieldId.value = fieldId
}

function dropField(fieldId: string) {
  const fromFieldId = draggingFieldId.value
  draggingFieldId.value = undefined
  dragOverFieldId.value = undefined
  if (!fromFieldId || fromFieldId === fieldId)
    return
  commitBinding(swapMaterialDataFieldMappings(props.contract, props.element.binding, fromFieldId, fieldId))
}

function endFieldDrag() {
  draggingFieldId.value = undefined
  dragOverFieldId.value = undefined
}

function updateFieldFormat(fieldId: string, format: BindingDisplayFormat | undefined) {
  const binding = applyMaterialDataFieldFormat(props.element.binding, fieldId, format)
  commitBinding(binding)
}

function applyMaterialDataFieldFormat(
  binding: MaterialNode['binding'],
  fieldId: string,
  format: BindingDisplayFormat | undefined,
): DataContractBinding | undefined {
  const mapping = mappingFor(fieldId)
  if (!mapping || !binding || Array.isArray(binding) || !('kind' in binding) || binding.kind !== 'data-contract')
    return undefined
  const next: DataContractBinding = {
    ...binding,
    mappings: {
      ...binding.mappings,
      [fieldId]: {
        ...mapping,
        select: { ...mapping.select },
        format,
      },
    },
  }
  return next
}

function commitBinding(binding: DataContractBinding | undefined) {
  emit('updateBinding', binding)
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
        v-for="entry in fields"
        :id="fieldElementId(entry.id)"
        :key="entry.id"
        class="ei-material-data-binding__slot"
        :class="{
          'ei-material-data-binding__slot--over': dragOverFieldId === entry.id,
          'ei-material-data-binding__slot--empty': !mappingFor(entry.id),
        }"
        @dragover.prevent="overField(entry.id)"
        @dragleave="dragOverFieldId = undefined"
        @drop.prevent="dropField(entry.id)"
      >
        <button
          class="ei-material-data-binding__handle"
          type="button"
          draggable="true"
          @dragstart.stop="startFieldDrag(entry.id)"
          @dragend="endFieldDrag"
        >
          <IconGripVertical :size="14" :stroke-width="1.6" />
        </button>
        <div class="ei-material-data-binding__content">
          <div class="ei-material-data-binding__head">
            <span class="ei-material-data-binding__label">{{ t(entry.field.labelKey) }}</span>
            <span v-if="entry.field.required" class="ei-material-data-binding__required">{{ t('designer.materialDataBinding.required') }}</span>
            <button
              v-if="mappingFor(entry.id)"
              type="button"
              class="ei-material-data-binding__clear"
              @click="clearField(entry.id)"
            >
              {{ t('designer.materialDataBinding.clear') }}
            </button>
          </div>

          <template v-if="mappingFor(entry.id)">
            <div class="ei-material-data-binding__row">
              <span class="ei-material-data-binding__k">{{ t('designer.dataSource.source') }}</span>
              <span class="ei-material-data-binding__v">{{ mappingFor(entry.id)?.sourceName || mappingFor(entry.id)?.sourceId }}</span>
            </div>
            <div class="ei-material-data-binding__row">
              <span class="ei-material-data-binding__k">{{ t('designer.dataSource.field') }}</span>
              <div class="ei-material-data-binding__field">
                <span class="ei-material-data-binding__v">{{ mappingFor(entry.id)?.select.label || mappingFor(entry.id)?.select.path }}</span>
                <span
                  v-if="mappingFor(entry.id)?.select.label"
                  class="ei-material-data-binding__path"
                  :title="mappingFor(entry.id)?.select.path"
                >{{ mappingFor(entry.id)?.select.path }}</span>
              </div>
            </div>
            <BindingFormatEditor
              v-if="mappingBindingFor(entry.id)"
              :binding="mappingBindingFor(entry.id)!"
              :bind-index="0"
              :t="t"
              :get-data-source="getDataSource"
              @update-binding-format="format => updateFieldFormat(entry.id, format)"
            />
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
