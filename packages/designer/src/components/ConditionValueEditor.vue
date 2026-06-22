<script setup lang="ts">
import type { ConditionPathExpression, ValueCast, ValueExpression } from '@easyink/schema'
import { EiInput, EiNumberInput, EiSelect, EiSwitch } from '@easyink/ui'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DESIGNER_DRAG_DROP_KEY } from '../composables/use-designer-drag-drop'

const props = defineProps<{
  modelValue: ValueExpression
  variables: string[]
  slotId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ValueExpression, mergeKey?: string]
}>()

const dragDrop = inject(DESIGNER_DRAG_DROP_KEY, null)
const root = ref<HTMLElement | null>(null)
const textDraft = ref('')
let unregister: (() => void) | undefined

const expressionKind = computed(() => props.modelValue.kind)
const kindOptions = computed(() => [
  { label: '字段', value: 'field' },
  ...(props.variables.length ? [{ label: '变量', value: 'variable' }] : []),
  { label: '固定值', value: 'literal' },
  { label: '集合数量', value: 'count' },
])
const variableOptions = computed(() => props.variables.map(value => ({ label: value, value })))
const castOptions = [
  { label: '原类型', value: '' },
  { label: '文本', value: 'string' },
  { label: '去空格文本', value: 'trimmed-string' },
  { label: '数字', value: 'number' },
  { label: '布尔', value: 'boolean' },
  { label: '日期时间', value: 'datetime' },
]
const literalTypeOptions = [
  { label: '文本', value: 'string' },
  { label: '数字', value: 'number' },
  { label: '布尔', value: 'boolean' },
  { label: '空值', value: 'null' },
]
const pathExpression = computed<ConditionPathExpression | undefined>(() => {
  if (props.modelValue.kind === 'field' || props.modelValue.kind === 'variable')
    return props.modelValue
  if (props.modelValue.kind === 'count')
    return props.modelValue.value
  return undefined
})

watch(() => props.modelValue, (value) => {
  if (value.kind === 'literal')
    textDraft.value = value.value == null ? '' : String(value.value)
  else
    textDraft.value = pathExpression.value?.path ?? ''
}, { immediate: true, deep: true })

onMounted(() => {
  if (!dragDrop)
    return
  unregister = dragDrop.registerDatasourceDropTarget({
    id: `condition:${props.slotId}`,
    element: () => root.value,
    onDragOver: data => data.union?.length
      ? { status: 'rejected', label: 'Union fields are not supported in conditions' }
      : { status: 'accepted', label: data.fieldLabel || data.fieldPath },
    onDrop: (data) => {
      if (data.union?.length)
        return
      emit('update:modelValue', { kind: 'field', path: data.fieldPath })
    },
  })
})

onBeforeUnmount(() => unregister?.())

function changeKind(kind: string) {
  if (kind === 'literal')
    emit('update:modelValue', { kind: 'literal', value: '' })
  else if (kind === 'count')
    emit('update:modelValue', { kind: 'count', value: { kind: 'field', path: '' } })
  else if (kind === 'variable')
    emit('update:modelValue', { kind: 'variable', name: props.variables.at(-1) ?? '', path: '' })
  else
    emit('update:modelValue', { kind: 'field', path: '' })
}

function updatePath(path: string) {
  textDraft.value = path
  const current = pathExpression.value
  if (!current)
    return
  const next = { ...current, path }
  emit('update:modelValue', props.modelValue.kind === 'count' ? { kind: 'count', value: next } : next, `${props.slotId}:path`)
}

function updateVariable(name: string) {
  if (props.modelValue.kind === 'variable')
    emit('update:modelValue', { ...props.modelValue, name })
  else if (props.modelValue.kind === 'count' && props.modelValue.value.kind === 'variable')
    emit('update:modelValue', { kind: 'count', value: { ...props.modelValue.value, name } })
}

function updateCast(cast: string) {
  const current = pathExpression.value
  if (!current)
    return
  const next = { ...current, cast: cast ? cast as ValueCast : undefined }
  emit('update:modelValue', props.modelValue.kind === 'count' ? { kind: 'count', value: next } : next)
}

function changeLiteralType(type: string) {
  const value = type === 'number' ? 0 : type === 'boolean' ? false : type === 'null' ? null : ''
  emit('update:modelValue', { kind: 'literal', value })
}

function updateLiteral(value: string) {
  textDraft.value = value
  if (props.modelValue.kind !== 'literal')
    return
  if (typeof props.modelValue.value === 'number') {
    const parsed = Number(value)
    if (value.trim() && Number.isFinite(parsed))
      emit('update:modelValue', { kind: 'literal', value: parsed }, `${props.slotId}:literal`)
    return
  }
  emit('update:modelValue', { kind: 'literal', value }, `${props.slotId}:literal`)
}

function updateNumberLiteral(value: number | null) {
  if (value !== null)
    emit('update:modelValue', { kind: 'literal', value }, `${props.slotId}:literal`)
}
</script>

<template>
  <div ref="root" class="condition-value" :class="{ 'condition-value--field': pathExpression }">
    <EiSelect class="condition-control condition-value__kind" :model-value="expressionKind" :options="kindOptions" @update:model-value="changeKind(String($event))" />

    <template v-if="pathExpression">
      <EiSelect v-if="pathExpression.kind === 'variable'" class="condition-control" :model-value="pathExpression.name" :options="variableOptions" @update:model-value="updateVariable(String($event))" />
      <EiInput class="condition-control condition-value__path" :model-value="textDraft" placeholder="如 order.customer.name" @update:model-value="updatePath(String($event))" />
      <EiSelect class="condition-control" :model-value="pathExpression.cast ?? ''" :options="castOptions" @update:model-value="updateCast(String($event))" />
    </template>

    <template v-else-if="modelValue.kind === 'literal'">
      <EiSelect class="condition-control" :model-value="modelValue.value === null ? 'null' : typeof modelValue.value" :options="literalTypeOptions" @update:model-value="changeLiteralType(String($event))" />
      <EiSwitch v-if="typeof modelValue.value === 'boolean'" class="condition-control condition-value__boolean" label="固定值" :model-value="modelValue.value" @update:model-value="$emit('update:modelValue', { kind: 'literal', value: $event })" />
      <EiNumberInput v-else-if="typeof modelValue.value === 'number'" class="condition-control condition-value__path" :model-value="modelValue.value" :nullable="false" @update:model-value="updateNumberLiteral" />
      <EiInput v-else-if="modelValue.value !== null" class="condition-control condition-value__path" :model-value="textDraft" @update:model-value="updateLiteral(String($event))" />
    </template>
  </div>
</template>

<style scoped lang="scss">
.condition-value {
  display: grid;
  grid-template-columns: 76px minmax(0, 1fr);
  gap: 4px;
  padding: 4px;
  border: 1px dashed var(--ei-border-color, #d9d9d9);
  border-radius: 5px;

  &--field {
    border-color: color-mix(in srgb, var(--ei-primary, #1677ff) 35%, transparent);
    background: color-mix(in srgb, var(--ei-primary, #1677ff) 4%, transparent);
  }

  &__kind { grid-row: span 2; }
  &__path { min-width: 0; }
  &__boolean { min-height: 28px; }
}
</style>
