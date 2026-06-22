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
  t: (key: string) => string
  removable?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ConditionNode, mergeKey?: string]
  'remove': []
}>()

const nodeVariables = computed(() => props.modelValue.kind === 'quantifier'
  ? [...props.variables, props.modelValue.as].filter(Boolean)
  : props.variables)
const kindOptions = computed(() => [
  { label: props.t('designer.condition.modeCompare'), value: 'compare' },
  { label: props.t('designer.condition.modeGroup'), value: 'group' },
  { label: props.t('designer.condition.modeNot'), value: 'not' },
  { label: props.t('designer.condition.modeQuantifier'), value: 'quantifier' },
])
const compareLabelKeys: Record<CompareOperator, string> = {
  eq: 'designer.condition.operatorEq',
  neq: 'designer.condition.operatorNeq',
  gt: 'designer.condition.operatorGt',
  gte: 'designer.condition.operatorGte',
  lt: 'designer.condition.operatorLt',
  lte: 'designer.condition.operatorLte',
  between: 'designer.condition.operatorBetween',
  notBetween: 'designer.condition.operatorNotBetween',
  in: 'designer.condition.operatorIn',
  notIn: 'designer.condition.operatorNotIn',
  contains: 'designer.condition.operatorContains',
  notContains: 'designer.condition.operatorNotContains',
  startsWith: 'designer.condition.operatorStartsWith',
  endsWith: 'designer.condition.operatorEndsWith',
  exists: 'designer.condition.operatorExists',
  notExists: 'designer.condition.operatorNotExists',
  isEmpty: 'designer.condition.operatorIsEmpty',
  isNotEmpty: 'designer.condition.operatorIsNotEmpty',
}
const compareOptions = computed(() => COMPARE_OPERATORS.map(value => ({ label: props.t(compareLabelKeys[value]), value })))
const groupOptions = computed(() => [
  { label: props.t('designer.condition.groupAll'), value: 'and' },
  { label: props.t('designer.condition.groupAny'), value: 'or' },
])
const quantifierOptions = computed(() => [
  { label: props.t('designer.condition.quantifierAny'), value: 'any' },
  { label: props.t('designer.condition.quantifierAll'), value: 'all' },
  { label: props.t('designer.condition.quantifierNone'), value: 'none' },
])
const caseSensitiveOperators: CompareOperator[] = ['eq', 'neq', 'in', 'notIn', 'contains', 'notContains', 'startsWith', 'endsWith']

const modeText = computed(() => {
  if (props.modelValue.kind === 'group')
    return props.t('designer.condition.modeTextGroup')
  if (props.modelValue.kind === 'not')
    return props.t('designer.condition.modeTextNot')
  if (props.modelValue.kind === 'quantifier')
    return props.t('designer.condition.modeTextQuantifier')
  return props.t('designer.condition.modeTextCompare')
})
const compareOperands = computed<ValueExpression[]>(() => props.modelValue.kind === 'compare'
  ? normalizeCompareOperands(props.modelValue.operator, props.modelValue.operands)
  : [])

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

function compareOperandLabel(operator: CompareOperator, index: number): string {
  if (index === 0)
    return props.t('designer.condition.operandSubject')
  if (operator === 'between' || operator === 'notBetween')
    return index === 1 ? props.t('designer.condition.operandStart') : props.t('designer.condition.operandEnd')
  if (operator === 'in' || operator === 'notIn')
    return `${props.t('designer.condition.operandCandidate')} ${index}`
  return props.t('designer.condition.operandCompare')
}
</script>

<template>
  <div class="condition-rule" :class="`condition-rule--${modelValue.kind}`">
    <div class="condition-rule__mode">
      <div class="condition-rule__mode-copy">
        <span class="condition-rule__mode-title">{{ t('designer.condition.mode') }}</span>
        <span class="condition-rule__mode-text">{{ modeText }}</span>
      </div>
      <EiSelect class="condition-control condition-rule__mode-select" :model-value="modelValue.kind" :options="kindOptions" @update:model-value="changeKind(String($event))" />
      <EiButton v-if="removable" class="condition-rule__remove" variant="ghost" size="sm" :title="t('designer.condition.deleteRule')" :aria-label="t('designer.condition.deleteRule')" @click="$emit('remove')">
        <EiIcon :icon="IconDelete" :size="13" />
      </EiButton>
    </div>

    <template v-if="modelValue.kind === 'compare'">
      <ConditionValueEditor
        :model-value="compareOperands[0]"
        :variables="variables"
        :slot-id="`${path}.operand.0`"
        :label="compareOperandLabel(modelValue.operator, 0)"
        :t="t"
        @update:model-value="(value, mergeKey) => updateOperand(0, value, mergeKey)"
      />
      <EiSelect class="condition-control" :label="t('designer.condition.operator')" :model-value="modelValue.operator" :options="compareOptions" @update:model-value="updateCompareOperator(String($event))" />
      <ConditionValueEditor
        v-for="(operand, index) in compareOperands.slice(1)"
        :key="`${path}.operand.${index + 1}`"
        :model-value="operand"
        :variables="variables"
        :slot-id="`${path}.operand.${index + 1}`"
        :label="compareOperandLabel(modelValue.operator, index + 1)"
        :t="t"
        @update:model-value="(value, mergeKey) => updateOperand(index + 1, value, mergeKey)"
      />
      <EiCheckbox
        v-if="caseSensitiveOperators.includes(modelValue.operator)"
        :label="t('designer.condition.caseSensitive')"
        :model-value="modelValue.options?.caseSensitive !== false"
        @update:model-value="$emit('update:modelValue', { ...modelValue, options: { ...modelValue.options, caseSensitive: $event } })"
      />
      <EiButton v-if="modelValue.operator === 'in' || modelValue.operator === 'notIn'" size="sm" @click="$emit('update:modelValue', { ...modelValue, operands: [...modelValue.operands, { kind: 'literal', value: '' }] })">
        <EiIcon :icon="IconPlus" :size="12" />
        {{ t('designer.condition.addCandidate') }}
      </EiButton>
    </template>

    <template v-else-if="modelValue.kind === 'group'">
      <div class="condition-rule__sentence">
        <span>{{ t('designer.condition.groupWhen') }}</span>
        <EiSelect class="condition-control condition-rule__inline-select" :model-value="modelValue.operator" :options="groupOptions" @update:model-value="updateGroupOperator(String($event))" />
        <span>{{ t('designer.condition.groupThen') }}</span>
      </div>
      <div v-for="(child, index) in modelValue.children" :key="`${path}.child.${index}`" class="condition-rule__child">
        <span class="condition-rule__child-index">{{ index + 1 }}</span>
        <ConditionRuleEditor
          class="condition-rule__child-body"
          :model-value="child"
          :variables="variables"
          :path="`${path}.child.${index}`"
          :removable="modelValue.children.length > 1"
          :t="t"
          @update:model-value="(value, mergeKey) => updateChild(index, value, mergeKey)"
          @remove="removeChild(index)"
        />
      </div>
      <div class="condition-rule__add-row">
        <EiButton size="sm" @click="addChild('compare')">
          <EiIcon :icon="IconPlus" :size="12" />
          {{ t('designer.condition.addCondition') }}
        </EiButton>
        <EiButton size="sm" @click="addChild('group')">
          <EiIcon :icon="IconPlus" :size="12" />
          {{ t('designer.condition.addGroup') }}
        </EiButton>
      </div>
    </template>

    <template v-else-if="modelValue.kind === 'not'">
      <p class="condition-rule__note">
        {{ t('designer.condition.notHint') }}
      </p>
      <ConditionRuleEditor :model-value="modelValue.child" :variables="variables" :path="`${path}.not`" :t="t" @update:model-value="updateNotChild" />
    </template>

    <template v-else>
      <EiSelect class="condition-control" :label="t('designer.condition.quantifier')" :model-value="modelValue.operator" :options="quantifierOptions" @update:model-value="updateQuantifierOperator(String($event))" />
      <ConditionValueEditor :label="t('designer.condition.collection')" :model-value="modelValue.collection" :variables="variables" :slot-id="`${path}.collection`" :t="t" @update:model-value="updateQuantifierCollection" />
      <EiInput class="condition-control" :label="t('designer.condition.variableName')" :model-value="modelValue.as" @update:model-value="updateQuantifierVariable(String($event))" />
      <p class="condition-rule__note">
        {{ t('designer.condition.quantifierHint') }}
      </p>
      <ConditionRuleEditor :model-value="modelValue.condition" :variables="nodeVariables" :path="`${path}.condition`" :t="t" @update:model-value="updateQuantifierCondition" />
    </template>
  </div>
</template>

<style scoped lang="scss">
.condition-rule {
  display: flex;
  flex-direction: column;
  gap: 8px;

  &__mode {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 104px auto;
    gap: 6px;
    align-items: center;
  }

  &__mode-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }

  &__mode-title {
    color: var(--ei-text, #222);
    font-size: 12px;
    line-height: 1.35;
  }

  &__mode-text, &__note {
    color: var(--ei-text-secondary, #666);
    font-size: 11px;
    line-height: 1.4;
  }

  &__mode-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__mode-select { min-width: 0; }
  &__remove {
    flex: 0 0 26px;
    width: 26px;
    height: 26px;
    padding: 0;
    color: var(--ei-danger, #d4380d);
    border: 0;
  }

  &__sentence {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    color: var(--ei-text-secondary, #666);
    font-size: 12px;
  }

  &__inline-select { min-width: 0; }

  &__child {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    column-gap: 5px;
    align-items: start;
  }

  &__child-index {
    padding-top: 6px;
    color: var(--ei-text-tertiary, #999);
    font-size: 11px;
    line-height: 1;
    text-align: right;
  }

  &__child-body { min-width: 0; }

  &__add-row {
    display: flex;
    gap: 6px;
    align-items: center;
    padding-left: 23px;
  }

  &__add-row > * { flex: 1; }

  &__note { margin: 0; }
}
</style>
