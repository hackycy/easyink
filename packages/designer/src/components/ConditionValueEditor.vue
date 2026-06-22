<script setup lang="ts">
import type { FieldValueExpression, ValueCast, ValueExpression } from '@easyink/schema'
import { IconDelete } from '@easyink/icons'
import { EiButton, EiIcon, EiInput, EiNumberInput, EiSelect, EiSwitch } from '@easyink/ui'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DESIGNER_DRAG_DROP_KEY } from '../composables/use-designer-drag-drop'

const props = defineProps<{
  modelValue: ValueExpression
  slotId: string
  t: (key: string) => string
  label?: string
  preferredKind?: 'field' | 'literal'
  lockKind?: boolean
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
const fieldSegments = computed(() => {
  const path = pathExpression.value?.path ?? ''
  return path.split('/').filter(Boolean)
})
const fieldName = computed(() => fieldSegments.value[fieldSegments.value.length - 1] ?? '')
const isFieldMode = computed(() => props.modelValue.kind === 'field' || (props.lockKind && props.preferredKind === 'field'))
const showKindSelect = computed(() => !props.lockKind)
const literalKind = computed(() => props.modelValue.kind === 'literal'
  ? props.modelValue.value === null ? 'null' : typeof props.modelValue.value
  : 'string')
const fieldTitle = computed(() => pathExpression.value?.fieldLabel || fieldName.value || pathExpression.value?.path || '')
const fieldSource = computed(() => pathExpression.value?.sourceName || pathExpression.value?.sourceId || '')
const fieldMeta = computed(() => {
  const current = pathExpression.value
  if (!current?.path)
    return ''
  return fieldSource.value ? `${fieldSource.value} · ${current.path}` : current.path
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
      ? { status: 'rejected', label: props.t('designer.condition.rejectUnion') }
      : { status: 'accepted', label: data.fieldLabel || data.fieldPath },
    onDrop: (data) => {
      if (data.union?.length)
        return
      emit('update:modelValue', {
        kind: 'field',
        path: data.fieldPath,
        sourceId: data.sourceId,
        sourceName: data.sourceName,
        sourceTag: data.sourceTag,
        fieldKey: data.fieldKey,
        fieldLabel: data.fieldLabel,
        fieldTag: data.fieldTag,
      })
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

function clearField() {
  emit('update:modelValue', { kind: 'field', path: '' })
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
    <div class="condition-value__controls">
      <div v-if="showKindSelect" class="condition-value__mode-row">
        <EiSelect class="condition-control condition-value__kind" :model-value="expressionKind" :options="kindOptions" @update:model-value="changeKind(String($event))" />
        <EiSelect v-if="modelValue.kind === 'literal'" class="condition-control condition-value__literal-kind" :model-value="literalKind" :options="literalTypeOptions" @update:model-value="changeLiteralType(String($event))" />
      </div>

      <template v-if="isFieldMode">
        <div class="condition-value__field-slot" :class="{ 'condition-value__field-slot--empty': !pathExpression?.path }">
          <template v-if="pathExpression?.path">
            <div class="condition-value__field-copy">
              <span class="condition-value__field-name" :title="fieldTitle">{{ fieldTitle }}</span>
              <span class="condition-value__field-meta" :title="fieldMeta">
                <span v-if="fieldSource" class="condition-value__field-source">{{ fieldSource }}</span>
                <span class="condition-value__field-path">{{ pathExpression.path }}</span>
              </span>
            </div>
            <EiButton class="condition-value__clear" variant="ghost" size="sm" :title="t('designer.condition.clearField')" :aria-label="t('designer.condition.clearField')" @click="clearField">
              <EiIcon :icon="IconDelete" :size="12" />
            </EiButton>
          </template>
          <span v-else class="condition-value__drop-copy">{{ t('designer.condition.dropField') }}</span>
        </div>
        <div v-if="pathExpression?.path" class="condition-value__meta-row">
          <span class="condition-value__meta-label">{{ t('designer.condition.cast') }}</span>
          <EiSelect class="condition-control condition-value__cast" :model-value="pathExpression.cast ?? ''" :options="castOptions" @update:model-value="updateCast(String($event))" />
        </div>
      </template>

      <template v-else-if="modelValue.kind === 'literal'">
        <EiSwitch v-if="typeof modelValue.value === 'boolean'" class="condition-control condition-value__boolean" :label="t('designer.condition.literalValue')" :model-value="modelValue.value" @update:model-value="$emit('update:modelValue', { kind: 'literal', value: $event })" />
        <EiNumberInput v-else-if="typeof modelValue.value === 'number'" class="condition-control condition-value__path" :model-value="modelValue.value" :nullable="false" @update:model-value="updateNumberLiteral" />
        <EiInput v-else-if="modelValue.value !== null" class="condition-control condition-value__path" :model-value="textDraft" @update:model-value="updateLiteral(String($event))" />
        <span v-else class="condition-value__null">{{ t('designer.condition.literalNull') }}</span>
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
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 4px;
  }

  &__kind { min-width: 0; }
  &__literal-kind { min-width: 0; }
  &__path { min-width: 0; }
  &__cast { min-width: 0; }
  &__boolean { min-height: 28px; }

  &__mode-row, &__meta-row {
    display: grid;
    min-width: 0;
    gap: 4px;
    align-items: center;
  }

  &__mode-row {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  &__meta-row {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  &__meta-label {
    overflow: hidden;
    color: var(--ei-text-secondary, #aaa);
    font-size: 10px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__field-slot {
    display: grid;
    min-height: 29px;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
    padding: 3px 7px;
    border: 1px solid var(--ei-border-color, #d0d0d0);
    border-radius: 4px;
    background: var(--ei-input-bg, #fff);
    box-sizing: border-box;
  }

  &__field-slot--empty {
    display: flex;
    justify-content: flex-start;
    color: var(--ei-text-secondary, #999);
  }

  &__field-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }

  &__field-name {
    overflow: hidden;
    color: var(--ei-text, #333);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__field-meta {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 4px;
  }

  &__field-source {
    flex: 0 1 auto;
    max-width: 42%;
    overflow: hidden;
    color: var(--ei-text-secondary, #999);
    font-size: 10px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__field-path, &__drop-copy {
    overflow: hidden;
    color: var(--ei-text-secondary, #999);
    font-size: 10px;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__field-path {
    min-width: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  &__null {
    display: flex;
    min-height: 28px;
    align-items: center;
    color: var(--ei-text-secondary, #999);
    font-size: 12px;
  }

  &__clear {
    width: 22px;
    height: 22px;
    padding: 0;
    color: var(--ei-text-secondary, #aaa);
    border: 0;
  }
}
</style>
