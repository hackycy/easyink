<script setup lang="ts">
import type { ConditionRow, ConditionValue } from '@easyink/schema'
import { IconDelete, IconPlus } from '@easyink/icons'
import { castConditionLiteralValue } from '@easyink/schema'
import { EiButton, EiIcon, EiInput, EiNumberInput, EiSelect } from '@easyink/ui'
import { computed } from 'vue'
import { defaultLiteralForType, isBetweenOperator, isInOperator, literal } from '../conditions/editor-model'

const props = defineProps<{
  row: ConditionRow
  t: (key: string) => string
}>()

const emit = defineEmits<{
  update: [value: ConditionValue | ConditionValue[]]
}>()

const values = computed(() => Array.isArray(props.row.value) ? props.row.value : props.row.value ? [props.row.value] : [])
const multiple = computed(() => isBetweenOperator(props.row.operator) || isInOperator(props.row.operator))
const canAdd = computed(() => isInOperator(props.row.operator))
const booleanOptions = computed(() => [
  { label: props.t('designer.condition.booleanTrue'), value: 'true' },
  { label: props.t('designer.condition.booleanFalse'), value: 'false' },
])

function updateAt(index: number, value: ConditionValue) {
  const next = [...values.value]
  next[index] = value
  emit('update', multiple.value ? next : value)
}

function updateLiteral(index: number, value: string | number | boolean) {
  updateAt(index, literal(value))
}

function addCandidate() {
  emit('update', [...values.value, defaultLiteralForType(props.row.valueType ?? 'string')])
}

function removeCandidate(index: number) {
  if (values.value.length <= 1)
    return
  emit('update', values.value.filter((_, valueIndex) => valueIndex !== index))
}

function literalText(value: ConditionValue): string | number {
  return value.value != null ? String(value.value) : ''
}

function literalNumber(value: ConditionValue): number | null {
  return typeof value.value === 'number' ? value.value : null
}

function literalBoolean(value: ConditionValue): boolean {
  const cast = castConditionLiteralValue(value.value, 'boolean')
  return cast.success && cast.value === true
}

function literalBooleanKey(value: ConditionValue): 'true' | 'false' {
  return literalBoolean(value) ? 'true' : 'false'
}

function labelFor(index: number): string {
  if (isBetweenOperator(props.row.operator))
    return index === 0 ? props.t('designer.condition.operandStart') : props.t('designer.condition.operandEnd')
  if (canAdd.value)
    return `${props.t('designer.condition.operandCandidate')} ${index + 1}`
  return ''
}
</script>

<template>
  <div class="condition-value-cell">
    <div v-for="(value, index) in values" :key="index" class="condition-value-cell__item">
      <span v-if="multiple" class="condition-value-cell__item-label">{{ labelFor(index) }}</span>
      <div class="condition-value-cell__editor">
        <EiSelect v-if="row.valueType === 'boolean'" :model-value="literalBooleanKey(value)" :options="booleanOptions" @update:model-value="updateLiteral(index, $event === 'true')" />
        <EiNumberInput v-else-if="row.valueType === 'number'" :model-value="literalNumber(value)" :nullable="false" @update:model-value="$event != null && updateLiteral(index, $event)" />
        <EiInput v-else :model-value="literalText(value)" :placeholder="row.valueType === 'datetime' ? '2026-01-01T00:00:00Z' : ''" @update:model-value="updateLiteral(index, String($event))" />
        <EiButton v-if="canAdd && values.length > 1" variant="ghost" size="sm" :aria-label="t('designer.condition.deleteValue')" @click="removeCandidate(index)">
          <EiIcon :icon="IconDelete" :size="13" />
        </EiButton>
      </div>
    </div>
    <EiButton v-if="canAdd" variant="ghost" size="sm" class="condition-value-cell__add" @click="addCandidate">
      <EiIcon :icon="IconPlus" :size="12" />
      {{ t('designer.condition.addCandidate') }}
    </EiButton>
  </div>
</template>

<style scoped lang="scss">
.condition-value-cell {
  display: flex;
  min-width: 260px;
  flex-direction: column;
  gap: 6px;
}

.condition-value-cell__item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.condition-value-cell__item-label {
  color: var(--ei-text-secondary, #999);
  font-size: 10px;
  line-height: 12px;
}

.condition-value-cell__editor {
  display: grid;
  grid-template-columns: minmax(150px, 1fr) auto;
  gap: 6px;
  align-items: start;
}

.condition-value-cell__add {
  align-self: flex-start;
  margin-top: -1px;
}
</style>
