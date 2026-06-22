<script setup lang="ts">
import type { MaterialConditionDefinition } from '@easyink/core'
import type { MaterialNode, RenderCondition } from '@easyink/schema'
import { IconDelete, IconPlus } from '@easyink/icons'
import { deepClone } from '@easyink/shared'
import { EiButton, EiIcon, EiSelect, EiSwitch } from '@easyink/ui'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DESIGNER_DRAG_DROP_KEY } from '../composables/use-designer-drag-drop'
import { createRenderCondition, isRenderConditionComplete } from '../conditions/editor-model'
import ConditionRuleEditor from './ConditionRuleEditor.vue'

const props = defineProps<{
  element: MaterialNode
  capability: MaterialConditionDefinition
}>()

const emit = defineEmits<{
  update: [condition: RenderCondition | undefined, mergeKey?: string]
}>()

const draft = ref<RenderCondition | undefined>(deepClone(props.element.renderCondition))
const dirty = ref(false)
const root = ref<HTMLElement | null>(null)
const dragDrop = inject(DESIGNER_DRAG_DROP_KEY, null)
let unregister: (() => void) | undefined

const complete = computed(() => !!draft.value && isRenderConditionComplete(draft.value))
const whenFalseOptions = computed(() => [
  ...(props.capability.effects.includes('remove') ? [{ label: '移除且不占位', value: 'remove' }] : []),
  ...(props.capability.effects.includes('reserve') ? [{ label: '隐藏但保留空间', value: 'reserve' }] : []),
])
const unknownOptions = [
  { label: '继续显示', value: 'include' },
  { label: '按不满足处理', value: 'exclude' },
]

watch(() => props.element.renderCondition, (condition) => {
  if (!dirty.value || condition)
    draft.value = deepClone(condition)
  dirty.value = false
}, { deep: true })

onMounted(() => {
  if (!dragDrop)
    return
  unregister = dragDrop.registerDatasourceDropTarget({
    id: `condition-root:${props.element.id}`,
    element: () => root.value,
    onDragOver: data => data.union?.length
      ? { status: 'rejected', label: 'Union fields are not supported in conditions' }
      : { status: 'accepted', label: `创建 ${data.fieldLabel || data.fieldPath} 条件` },
    onDrop: (data) => {
      if (data.union?.length)
        return
      const next = createRenderCondition(data.fieldPath)
      draft.value = next
      dirty.value = true
    },
  })
})

onBeforeUnmount(() => unregister?.())

function enable() {
  if (!draft.value) {
    draft.value = createRenderCondition()
    dirty.value = true
    return
  }
  update({ ...draft.value, enabled: true })
}

function update(condition: RenderCondition, mergeKey?: string) {
  draft.value = condition
  dirty.value = true
  if (isRenderConditionComplete(condition)) {
    emit('update', deepClone(condition), mergeKey)
    dirty.value = false
  }
}

function remove() {
  draft.value = undefined
  dirty.value = false
  emit('update', undefined)
}
</script>

<template>
  <div ref="root" class="condition-editor">
    <div v-if="!draft" class="condition-editor__empty">
      <p>按运行时数据决定是否输出该物料。也可以把数据字段直接拖到这里。</p>
      <EiButton size="sm" @click="enable">
        <EiIcon :icon="IconPlus" :size="13" />
        添加条件
      </EiButton>
    </div>

    <template v-else>
      <div class="condition-editor__header">
        <EiSwitch
          label="启用条件"
          :model-value="draft.enabled !== false"
          @update:model-value="update({ ...draft!, enabled: $event })"
        />
        <EiButton
          class="condition-editor__remove"
          variant="ghost"
          size="sm"
          title="移除条件配置"
          aria-label="移除条件配置"
          @click="remove"
        >
          <EiIcon :icon="IconDelete" :size="14" />
        </EiButton>
      </div>

      <div class="condition-editor__settings">
        <EiSelect
          label="不满足时"
          :model-value="draft.whenFalse ?? 'remove'"
          :options="whenFalseOptions"
          @update:model-value="update({ ...draft!, whenFalse: $event as 'remove' | 'reserve' })"
        />
        <EiSelect
          label="数据异常时"
          :model-value="draft.onUnknown ?? 'include'"
          :options="unknownOptions"
          @update:model-value="update({ ...draft!, onUnknown: $event as 'include' | 'exclude' })"
        />
      </div>

      <ConditionRuleEditor :model-value="draft.rule" :variables="[]" path="rule" @update:model-value="(rule, mergeKey) => update({ ...draft!, rule }, mergeKey)" />
      <p v-if="!complete" class="condition-editor__hint">
        规则尚未填写完整，完成前不会写入模板或撤销历史。
      </p>
    </template>
  </div>
</template>

<style scoped lang="scss">
.condition-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__empty {
    padding: 10px;
    text-align: center;
    color: var(--ei-text-secondary, #666);
    border: 1px dashed var(--ei-border-color, #d9d9d9);
    border-radius: 6px;
  }
  &__empty p { margin: 0 0 8px; line-height: 1.5; }
  &__header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  &__header > :first-child { flex: 1; }
  &__remove { flex: 0 0 26px; width: 26px; padding: 0; color: var(--ei-danger, #d4380d); }
  &__settings { display: grid; grid-template-columns: 1fr; gap: 6px; }
  &__hint { margin: 0; color: var(--ei-warning, #d46b08); font-size: 11px; line-height: 1.4; }
}
</style>
