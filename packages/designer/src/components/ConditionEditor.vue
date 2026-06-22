<script setup lang="ts">
import type { MaterialConditionDefinition } from '@easyink/core'
import type { MaterialNode, RenderCondition } from '@easyink/schema'
import { IconDelete, IconPlus } from '@easyink/icons'
import { deepClone } from '@easyink/shared'
import { EiButton, EiIcon, EiSelect, EiSwitch } from '@easyink/ui'
import { computed, ref, watch } from 'vue'
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
  <div class="condition-editor">
    <div v-if="!draft" class="condition-editor__empty">
      <p class="condition-editor__eyebrow">
        条件显示
      </p>
      <p>用运行时数据控制该物料是否输出。启用后，可在具体字段槽位中选择或拖入数据字段。</p>
      <EiButton size="sm" @click="enable">
        <EiIcon :icon="IconPlus" :size="13" />
        手动创建规则
      </EiButton>
    </div>

    <template v-else>
      <div class="condition-editor__header">
        <div class="condition-editor__header-copy">
          <span class="condition-editor__title">条件显示</span>
          <span class="condition-editor__summary">规则成立时显示该物料</span>
        </div>
        <EiSwitch :model-value="draft.enabled !== false" @update:model-value="update({ ...draft!, enabled: $event })" />
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

      <div class="condition-editor__section">
        <p class="condition-editor__section-title">
          显示规则
        </p>
        <p class="condition-editor__section-copy">
          当以下规则成立时显示。
        </p>
      </div>
      <ConditionRuleEditor :model-value="draft.rule" :variables="[]" path="rule" @update:model-value="(rule, mergeKey) => update({ ...draft!, rule }, mergeKey)" />
      <p v-if="!complete" class="condition-editor__hint">
        规则尚未填写完整，完成前不会写入模板或撤销历史。
      </p>

      <div class="condition-editor__section condition-editor__section--outcome">
        <p class="condition-editor__section-title">
          否则
        </p>
        <p class="condition-editor__section-copy">
          规则不成立或数据异常时如何处理该物料。
        </p>
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
    </template>
  </div>
</template>

<style scoped lang="scss">
.condition-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;

  &__empty {
    display: flex;
    flex-direction: column;
    gap: 7px;
    align-items: flex-start;
    color: var(--ei-text-secondary, #666);
  }
  &__empty p { margin: 0; line-height: 1.5; }
  &__eyebrow, &__title, &__section-title {
    color: var(--ei-text, #222);
    font-size: 12px;
    line-height: 1.35;
  }
  &__eyebrow { font-weight: 500; }
  &__header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    gap: 8px;
    align-items: center;
  }
  &__header-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }
  &__summary, &__section-copy {
    color: var(--ei-text-secondary, #666);
    font-size: 11px;
    line-height: 1.4;
  }
  &__remove {
    flex: 0 0 26px;
    width: 26px;
    height: 26px;
    padding: 0;
    color: var(--ei-danger, #d4380d);
    border: 0;
  }
  &__section {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-top: 2px;
  }
  &__section--outcome { margin-top: 4px; }
  &__section-title, &__section-copy { margin: 0; }
  &__settings { display: grid; grid-template-columns: 1fr; gap: 6px; }
  &__hint { margin: 0; color: var(--ei-warning, #d46b08); font-size: 11px; line-height: 1.4; }
}
</style>
