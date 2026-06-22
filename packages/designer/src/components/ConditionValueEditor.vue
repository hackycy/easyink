<script setup lang="ts">
import type { FieldValueExpression, ValueCast, ValueExpression } from '@easyink/schema'
import { EiInput, EiNumberInput, EiSelect, EiSwitch } from '@easyink/ui'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DESIGNER_DRAG_DROP_KEY } from '../composables/use-designer-drag-drop'

const props = defineProps<{
  modelValue: ValueExpression
  slotId: string
  t: (key: string) => string
  label?: string
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
  { label: props.t('designer.condition.valueKindField'), value: 'field' },
  { label: props.t('designer.condition.valueKindLiteral'), value: 'literal' },
])
const castOptions = computed(() => [
  { label: props.t('designer.condition.castRaw'), value: '' },
  { label: props.t('designer.condition.castString'), value: 'string' },
  { label: props.t('designer.condition.castTrimmedString'), value: 'trimmed-string' },
  { label: props.t('designer.condition.castNumber'), value: 'number' },
  { label: props.t('designer.condition.castBoolean'), value: 'boolean' },
  { label: props.t('designer.condition.castDatetime'), value: 'datetime' },
])
const literalTypeOptions = computed(() => [
  { label: props.t('designer.condition.literalString'), value: 'string' },
  { label: props.t('designer.condition.literalNumber'), value: 'number' },
  { label: props.t('designer.condition.literalBoolean'), value: 'boolean' },
  { label: props.t('designer.condition.literalNull'), value: 'null' },
])
const pathExpression = computed<FieldValueExpression | undefined>(() => props.modelValue.kind === 'field' ? props.modelValue : undefined)

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
      ? { status: 'rejected', label: props.t('designer.condition.rejectUnion') }
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
  else
    emit('update:modelValue', { kind: 'field', path: '' })
}

function updatePath(path: string) {
  textDraft.value = path
  const current = pathExpression.value
  if (!current)
    return
  const next = { ...current, path }
  emit('update:modelValue', next, `${props.slotId}:path`)
}

function updateCast(cast: string) {
  const current = pathExpression.value
  if (!current)
    return
  const next = { ...current, cast: cast ? cast as ValueCast : undefined }
  emit('update:modelValue', next)
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
  <div ref="root" class="condition-value">
    <span v-if="label" class="condition-value__label">{{ label }}</span>
    <div class="condition-value__controls" :class="{ 'condition-value__controls--path': pathExpression }">
      <EiSelect class="condition-control condition-value__kind" :model-value="expressionKind" :options="kindOptions" @update:model-value="changeKind(String($event))" />

      <template v-if="pathExpression">
        <EiInput class="condition-control condition-value__path" :model-value="textDraft" :placeholder="t('designer.condition.pathPlaceholder')" @update:model-value="updatePath(String($event))" />
        <EiSelect class="condition-control condition-value__cast" :model-value="pathExpression.cast ?? ''" :options="castOptions" @update:model-value="updateCast(String($event))" />
      </template>

      <template v-else-if="modelValue.kind === 'literal'">
        <EiSelect class="condition-control" :model-value="modelValue.value === null ? 'null' : typeof modelValue.value" :options="literalTypeOptions" @update:model-value="changeLiteralType(String($event))" />
        <EiSwitch v-if="typeof modelValue.value === 'boolean'" class="condition-control condition-value__boolean" :label="t('designer.condition.literalValue')" :model-value="modelValue.value" @update:model-value="$emit('update:modelValue', { kind: 'literal', value: $event })" />
        <EiNumberInput v-else-if="typeof modelValue.value === 'number'" class="condition-control condition-value__path" :model-value="modelValue.value" :nullable="false" @update:model-value="updateNumberLiteral" />
        <EiInput v-else-if="modelValue.value !== null" class="condition-control condition-value__path" :model-value="textDraft" @update:model-value="updateLiteral(String($event))" />
      </template>
    </div>
  </div>
</template>

<style scoped lang="scss">
.condition-value {
  display: flex;
  flex-direction: column;
  gap: 4px;

  &__label {
    color: var(--ei-text-secondary, #666);
    font-size: 11px;
    line-height: 1.3;
  }

  &__controls {
    display: grid;
    grid-template-columns: 76px minmax(0, 1fr);
    gap: 4px;
    align-items: start;

    &--path {
      grid-template-columns: 76px minmax(0, 1fr);
    }
  }

  &__kind { min-width: 0; }
  &__path { min-width: 0; }
  &__cast { grid-column: 2; }
  &__boolean { min-height: 28px; }
}
</style>
