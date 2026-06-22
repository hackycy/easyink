<script setup lang="ts">
import type { CompareOperator, ConditionNode, ValueExpression } from '@easyink/schema'
import { IconDelete, IconPlus } from '@easyink/icons'
import { EiButton, EiCheckbox, EiIcon, EiInput, EiSelect } from '@easyink/ui'
import { computed } from 'vue'
import { COMPARE_OPERATORS, createConditionNode, normalizeCompareOperands } from '../conditions/editor-model'
import ConditionValueEditor from './ConditionValueEditor.vue'

const props = defineProps<{
  modelValue: ConditionNode
  variables: string[]
  path: string
  removable?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ConditionNode, mergeKey?: string]
  'remove': []
}>()

const nodeVariables = computed(() => props.modelValue.kind === 'quantifier'
  ? [...props.variables, props.modelValue.as].filter(Boolean)
  : props.variables)
const kindOptions = [
  { label: '比较', value: 'compare' },
  { label: '逻辑组', value: 'group' },
  { label: '取反', value: 'not' },
  { label: '集合判断', value: 'quantifier' },
]
const compareOptions = COMPARE_OPERATORS.map(value => ({ label: value, value }))
const groupOptions = [
  { label: '满足全部（AND）', value: 'and' },
  { label: '满足任一（OR）', value: 'or' },
]
const quantifierOptions = [
  { label: '任一记录满足', value: 'any' },
  { label: '全部记录满足', value: 'all' },
  { label: '无记录满足', value: 'none' },
]

function changeKind(kind: string) {
  emit('update:modelValue', createConditionNode(kind as ConditionNode['kind']))
}

function updateCompareOperator(operator: string) {
  if (props.modelValue.kind !== 'compare')
    return
  emit('update:modelValue', {
    ...props.modelValue,
    operator: operator as CompareOperator,
    operands: normalizeCompareOperands(operator as CompareOperator, props.modelValue.operands),
  })
}

function updateOperand(index: number, value: ValueExpression, mergeKey?: string) {
  if (props.modelValue.kind !== 'compare')
    return
  const operands = [...props.modelValue.operands]
  operands[index] = value
  emit('update:modelValue', { ...props.modelValue, operands }, mergeKey)
}

function updateChild(index: number, child: ConditionNode, mergeKey?: string) {
  if (props.modelValue.kind !== 'group')
    return
  const children = [...props.modelValue.children]
  children[index] = child
  emit('update:modelValue', { ...props.modelValue, children }, mergeKey)
}

function removeChild(index: number) {
  if (props.modelValue.kind !== 'group' || props.modelValue.children.length <= 1)
    return
  emit('update:modelValue', { ...props.modelValue, children: props.modelValue.children.filter((_, childIndex) => childIndex !== index) })
}

function addChild(kind: ConditionNode['kind'] = 'compare') {
  if (props.modelValue.kind !== 'group')
    return
  emit('update:modelValue', { ...props.modelValue, children: [...props.modelValue.children, createConditionNode(kind)] })
}

function updateGroupOperator(operator: string) {
  if (props.modelValue.kind === 'group')
    emit('update:modelValue', { ...props.modelValue, operator: operator as 'and' | 'or' })
}

function updateNotChild(child: ConditionNode, mergeKey?: string) {
  if (props.modelValue.kind === 'not')
    emit('update:modelValue', { ...props.modelValue, child }, mergeKey)
}

function updateQuantifierOperator(operator: string) {
  if (props.modelValue.kind === 'quantifier')
    emit('update:modelValue', { ...props.modelValue, operator: operator as 'any' | 'all' | 'none' })
}

function updateQuantifierCollection(collection: ValueExpression, mergeKey?: string) {
  if (props.modelValue.kind === 'quantifier')
    emit('update:modelValue', { ...props.modelValue, collection }, mergeKey)
}

function updateQuantifierVariable(as: string) {
  if (props.modelValue.kind === 'quantifier')
    emit('update:modelValue', { ...props.modelValue, as })
}

function updateQuantifierCondition(condition: ConditionNode, mergeKey?: string) {
  if (props.modelValue.kind === 'quantifier')
    emit('update:modelValue', { ...props.modelValue, condition }, mergeKey)
}
</script>

<template>
  <div class="condition-rule" :class="`condition-rule--${modelValue.kind}`">
    <div class="condition-rule__toolbar">
      <EiSelect class="condition-control" :model-value="modelValue.kind" :options="kindOptions" @update:model-value="changeKind(String($event))" />
      <EiButton v-if="removable" class="condition-rule__remove" variant="ghost" size="sm" title="删除规则" aria-label="删除规则" @click="$emit('remove')">
        <EiIcon :icon="IconDelete" :size="13" />
      </EiButton>
    </div>

    <template v-if="modelValue.kind === 'compare'">
      <EiSelect class="condition-control" :model-value="modelValue.operator" :options="compareOptions" @update:model-value="updateCompareOperator(String($event))" />
      <ConditionValueEditor
        v-for="(operand, index) in modelValue.operands"
        :key="`${path}.operand.${index}`"
        :model-value="operand"
        :variables="variables"
        :slot-id="`${path}.operand.${index}`"
        @update:model-value="(value, mergeKey) => updateOperand(index, value, mergeKey)"
      />
      <EiCheckbox
        v-if="['eq', 'neq', 'in', 'notIn', 'contains', 'notContains', 'startsWith', 'endsWith'].includes(modelValue.operator)"
        label="区分大小写"
        :model-value="modelValue.options?.caseSensitive !== false"
        @update:model-value="$emit('update:modelValue', { ...modelValue, options: { ...modelValue.options, caseSensitive: $event } })"
      />
      <EiButton v-if="modelValue.operator === 'in' || modelValue.operator === 'notIn'" size="sm" @click="$emit('update:modelValue', { ...modelValue, operands: [...modelValue.operands, { kind: 'literal', value: '' }] })">
        <EiIcon :icon="IconPlus" :size="12" />
        添加候选值
      </EiButton>
    </template>

    <template v-else-if="modelValue.kind === 'group'">
      <EiSelect class="condition-control" :model-value="modelValue.operator" :options="groupOptions" @update:model-value="updateGroupOperator(String($event))" />
      <details v-for="(child, index) in modelValue.children" :key="`${path}.child.${index}`" class="condition-rule__child" open>
        <summary>规则 {{ index + 1 }} · {{ child.kind }}</summary>
        <ConditionRuleEditor
          :model-value="child"
          :variables="variables"
          :path="`${path}.child.${index}`"
          :removable="modelValue.children.length > 1"
          @update:model-value="(value, mergeKey) => updateChild(index, value, mergeKey)"
          @remove="removeChild(index)"
        />
      </details>
      <div class="condition-rule__add-row">
        <EiButton size="sm" @click="addChild('compare')">
          <EiIcon :icon="IconPlus" :size="12" />
          添加条件
        </EiButton>
        <EiButton size="sm" @click="addChild('group')">
          <EiIcon :icon="IconPlus" :size="12" />
          添加条件组
        </EiButton>
      </div>
    </template>

    <template v-else-if="modelValue.kind === 'not'">
      <ConditionRuleEditor :model-value="modelValue.child" :variables="variables" :path="`${path}.not`" @update:model-value="updateNotChild" />
    </template>

    <template v-else>
      <EiSelect class="condition-control" :model-value="modelValue.operator" :options="quantifierOptions" @update:model-value="updateQuantifierOperator(String($event))" />
      <ConditionValueEditor :model-value="modelValue.collection" :variables="variables" :slot-id="`${path}.collection`" @update:model-value="updateQuantifierCollection" />
      <EiInput class="condition-control" label="变量名" :model-value="modelValue.as" @update:model-value="updateQuantifierVariable(String($event))" />
      <ConditionRuleEditor :model-value="modelValue.condition" :variables="nodeVariables" :path="`${path}.condition`" @update:model-value="updateQuantifierCondition" />
    </template>
  </div>
</template>

<style scoped lang="scss">
.condition-rule {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 7px;
  border: 1px solid var(--ei-border-color, #e5e5e5);
  border-radius: 6px;
  background: var(--ei-bg-elevated, #fff);

  &__toolbar, &__add-row { display: flex; gap: 6px; align-items: center; }
  &__toolbar .condition-control { flex: 1; }
  &__remove { flex: 0 0 26px; width: 26px; padding: 0; color: var(--ei-danger, #d4380d); }
  &__child { border-left: 2px solid color-mix(in srgb, var(--ei-primary, #1677ff) 25%, transparent); padding-left: 6px; }
  &__child summary { cursor: pointer; color: var(--ei-text-secondary, #666); font-size: 11px; margin-bottom: 5px; }
  &__add-row > * { flex: 1; }
}
</style>
