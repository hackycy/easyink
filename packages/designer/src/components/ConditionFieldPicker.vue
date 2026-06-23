<script setup lang="ts">
import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import type { ConditionFieldRef } from '@easyink/schema'
import { IconSearch } from '@easyink/icons'
import { EiIcon, EiInput, EiPopover } from '@easyink/ui'
import { computed, reactive, ref, watch } from 'vue'
import DataSourceTree from './datasource/DataSourceTree.vue'
import { resolveDataFieldPath } from './datasource/field-path'

const props = defineProps<{
  modelValue?: ConditionFieldRef
  sources: DataSourceDescriptor[]
  t: (key: string) => string
}>()

const emit = defineEmits<{
  select: [field: ConditionFieldRef]
}>()

const open = ref(false)
const search = ref('')
const collapsedKeys = reactive(new Set<string>())

const query = computed(() => search.value.trim().toLowerCase())
const visibleSources = computed<DataSourceDescriptor[]>(() => {
  if (!query.value)
    return props.sources
  const result: DataSourceDescriptor[] = []
  for (const source of props.sources) {
    if (matchesSource(source, query.value)) {
      result.push(source)
      continue
    }
    const fields = filterFields(source.fields ?? [], query.value)
    if (fields.length > 0)
      result.push({ ...source, fields })
  }
  return result
})
const displayLabel = computed(() => props.modelValue?.fieldLabel || props.modelValue?.path || props.t('designer.condition.selectField'))
const displayMeta = computed(() => displayPath(props.modelValue) || props.t('designer.condition.clickToSelect'))
const triggerLabel = computed(() => displayLabel.value)
const triggerMeta = computed(() => displayMeta.value)

function isFieldSelectable(field: DataFieldNode, source: DataSourceDescriptor): boolean {
  const rawPath = resolvePathForSource(source, field)
  return rawPath.trim().length > 0
}

function filterFields(fields: DataFieldNode[], value: string): DataFieldNode[] {
  const result: DataFieldNode[] = []
  for (const field of fields) {
    if (matchesField(field, value)) {
      result.push(field)
      continue
    }
    if (!field.fields)
      continue
    const children = filterFields(field.fields, value)
    if (children.length > 0)
      result.push({ ...field, fields: children })
  }
  return result
}

function matchesSource(source: DataSourceDescriptor, value: string): boolean {
  return [
    source.title,
    source.name,
    source.id,
    source.tag,
  ].some(item => matchesValue(value, item))
}

function matchesField(field: DataFieldNode, value: string): boolean {
  return [
    field.title,
    field.name,
    field.path,
    field.key,
    field.id,
    field.tag,
  ].some(item => matchesValue(value, item))
}

function matchesValue(queryValue: string, value: unknown): boolean {
  return typeof value === 'string' && value.toLowerCase().includes(queryValue)
}

function resolvePath(field: DataFieldNode, parentPath: string): string {
  return resolveDataFieldPath(field, parentPath)
}

function resolvePathForSource(source: DataSourceDescriptor, target: DataFieldNode): string {
  return findFieldPath(source.fields ?? [], target, '') ?? target.path ?? target.key ?? target.name
}

function findFieldPath(fields: DataFieldNode[], target: DataFieldNode, parentPath: string): string | undefined {
  for (const field of fields) {
    const path = resolvePath(field, parentPath)
    if (field === target || path === target.path)
      return path
    const child = findFieldPath(field.fields ?? [], target, path)
    if (child)
      return child
  }
  return undefined
}

function displayPath(value?: ConditionFieldRef): string {
  if (!value?.path)
    return ''
  return value.path
}

function choose(field: DataFieldNode, source: DataSourceDescriptor) {
  const label = field.title || field.name
  const rawPath = resolvePathForSource(source, field)
  emit('select', {
    path: rawPath,
    sourceId: source.id,
    sourceName: source.name,
    sourceTag: source.tag,
    fieldKey: field.key,
    fieldLabel: label,
    fieldTag: field.tag,
  })
  search.value = ''
  open.value = false
}

function isExpanded(key: string): boolean {
  return !collapsedKeys.has(key)
}

function toggleExpand(key: string) {
  if (collapsedKeys.has(key))
    collapsedKeys.delete(key)
  else
    collapsedKeys.add(key)
}

watch(() => props.sources, (sources) => {
  for (const source of sources) {
    if (source.expand === false)
      collapsedKeys.add(source.id)
  }
}, { immediate: true })
</script>

<template>
  <EiPopover v-model:open="open" class="condition-field-picker">
    <button
      type="button"
      class="condition-field-picker__trigger"
      :class="{ 'condition-field-picker__trigger--empty': !modelValue?.path }"
      @click="open = !open"
    >
      <span class="condition-field-picker__copy">
        <span class="condition-field-picker__label">{{ triggerLabel }}</span>
        <span class="condition-field-picker__meta">{{ triggerMeta }}</span>
      </span>
    </button>
    <template #content>
      <div class="condition-field-picker__panel">
        <div class="condition-field-picker__search">
          <EiIcon :icon="IconSearch" :size="14" />
          <EiInput v-model="search" :placeholder="t('designer.condition.searchField')" />
        </div>
        <div v-if="visibleSources.length" class="condition-field-picker__tree">
          <DataSourceTree
            :sources="visibleSources"
            mode="select"
            :toggle-expand="toggleExpand"
            :is-expanded="isExpanded"
            :is-field-selectable="isFieldSelectable"
            :show-field-path="true"
            @select="choose"
          />
        </div>
        <p v-else class="condition-field-picker__empty">
          {{ t('designer.condition.noMatchingField') }}
        </p>
      </div>
    </template>
  </EiPopover>
</template>

<style scoped lang="scss">
.condition-field-picker {
  width: 100%;
}

.condition-field-picker__trigger {
  width: 100%;
  min-height: 34px;
  display: flex;
  align-items: center;
  padding: 4px 8px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  text-align: left;

  &:hover {
    border-color: var(--ei-border-color, #d0d0d0);
    background: var(--ei-hover-bg, #f5f5f5);
  }

  &--empty {
    border-color: var(--ei-border-color, #d0d0d0);
    background: var(--ei-input-bg, #fff);
  }
}

.condition-field-picker__copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
  text-align: left;
}

.condition-field-picker__label {
  overflow: hidden;
  color: var(--ei-text, #333);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.condition-field-picker__meta {
  overflow: hidden;
  color: var(--ei-text-secondary, #999);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.condition-field-picker__panel {
  width: min(540px, calc(100vw - 48px));
}

.condition-field-picker__search {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
}

.condition-field-picker__tree {
  max-height: min(360px, calc(var(--ei-popover-available-height, 420px) - 48px));
  overflow: auto;
}

.condition-field-picker__empty {
  margin: 12px 4px;
  color: var(--ei-text-secondary, #999);
  font-size: 12px;
  text-align: center;
}
</style>
