<script setup lang="ts">
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { CollectionConditionScope, ConditionRow, ConditionValue } from '@easyink/schema'
import { IconDelete, IconPlus } from '@easyink/icons'
import { EiButton, EiIcon, EiInput, EiNumberInput, EiSelect, EiSwitch } from '@easyink/ui'
import { computed } from 'vue'
import { defaultLiteralForType, literal } from '../conditions/editor-model'
import ConditionFieldPicker from './ConditionFieldPicker.vue'

const props = defineProps<{
  row: ConditionRow
  sources: DataSourceDescriptor[]
  collectionScope?: CollectionConditionScope
  t: (key: string) => string
}>()

const emit = defineEmits<{
  update: [value: ConditionValue | ConditionValue[]]
}>()

const values = computed(() => Array.isArray(props.row.value) ? props.row.value : props.row.value ? [props.row.value] : [])
const multiple = computed(() => props.row.operator === 'between' || props.row.operator === 'notBetween' || props.row.operator === 'in' || props.row.operator === 'notIn')
const canAdd = computed(() => props.row.operator === 'in' || props.row.operator === 'notIn')
const kindOptions = computed(() => [
  { label: props.t('designer.condition.valueKindLiteral'), value: 'literal' },
  { label: props.t('designer.condition.valueKindField'), value: 'field' },
])

function updateAt(index: number, value: ConditionValue) {
  const next = [...values.value]
  next[index] = value
  emit('update', multiple.value ? next : value)
}

function changeKind(index: number, kind: string) {
  updateAt(index, kind === 'field'
    ? { kind: 'field', field: { path: '' } }
    : defaultLiteralForType(props.row.valueType ?? 'string'))
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
  return value.kind === 'literal' && value.value != null ? String(value.value) : ''
}

function literalNumber(value: ConditionValue): number | null {
  return value.kind === 'literal' && typeof value.value === 'number' ? value.value : null
}

function literalBoolean(value: ConditionValue): boolean {
  return value.kind === 'literal' && value.value === true
}

function labelFor(index: number): string {
  if (props.row.operator === 'between' || props.row.operator === 'notBetween')
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
        <EiSelect :model-value="value.kind" :options="kindOptions" @update:model-value="changeKind(index, String($event))" />
        <ConditionFieldPicker
          v-if="value.kind === 'field'"
          :model-value="value.field"
          :sources="sources"
          :collection-scope="collectionScope"
          :t="t"
          @select="updateAt(index, { kind: 'field', field: $event })"
        />
        <EiSwitch v-else-if="row.valueType === 'boolean'" :model-value="literalBoolean(value)" @update:model-value="updateLiteral(index, $event)" />
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
  gap: 5px;
}

.condition-value-cell__item {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.condition-value-cell__item-label {
  color: var(--ei-text-secondary, #999);
  font-size: 10px;
  line-height: 1;
}

.condition-value-cell__editor {
  display: grid;
  grid-template-columns: 78px minmax(150px, 1fr) auto;
  gap: 4px;
  align-items: center;
}

.condition-value-cell__add {
  align-self: flex-start;
}
</style>
