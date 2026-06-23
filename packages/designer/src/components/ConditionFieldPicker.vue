<script setup lang="ts">
import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import type { CollectionConditionScope, ConditionFieldRef } from '@easyink/schema'
import type { TreeNode } from '@easyink/ui'
import { IconDatabase, IconDataTable, IconFolderClosed, IconHash, IconSearch } from '@easyink/icons'
import { EiIcon, EiInput, EiPopover, EiTree } from '@easyink/ui'
import { computed, ref } from 'vue'

interface PickerOption {
  label: string
  meta: string
  sourceId: string
  sourceName: string
  sourceTag?: string
  path: string
  rawPath: string
  field: DataFieldNode
  scope: 'root' | 'item'
  collectionScope?: CollectionConditionScope
  collection: boolean
  selectable: boolean
}

type FieldSelection = ConditionFieldRef & { collectionScope?: CollectionConditionScope }

const props = defineProps<{
  modelValue?: ConditionFieldRef
  sources: DataSourceDescriptor[]
  t: (key: string) => string
  mode?: 'field' | 'collection'
  collectionScope?: CollectionConditionScope
  allowCollection?: boolean
}>()

const emit = defineEmits<{
  select: [field: FieldSelection]
  selectCollection: [scope: CollectionConditionScope]
}>()

const open = ref(false)
const search = ref('')

const query = computed(() => search.value.trim().toLowerCase())
const nodes = computed<TreeNode[]>(() => props.sources.map(source => sourceNode(source)))
const visibleNodes = computed<TreeNode[]>(() => {
  if (!query.value)
    return nodes.value
  return filterNodes(nodes.value)
})
const displayLabel = computed(() => props.modelValue?.fieldLabel || props.modelValue?.path || props.t('designer.condition.selectField'))
const displayMeta = computed(() => displayPath(props.modelValue) || props.t('designer.condition.clickToSelect'))
const triggerLabel = computed(() => props.mode === 'collection'
  ? (props.modelValue?.fieldLabel || props.t('designer.condition.selectCollection'))
  : displayLabel.value)
const triggerMeta = computed(() => props.mode === 'collection'
  ? (props.modelValue?.path || props.t('designer.condition.clickToSelect'))
  : displayMeta.value)
const selectedId = computed(() => {
  if (!props.modelValue)
    return undefined
  const scope = props.modelValue.scope ?? 'root'
  const path = scope === 'item' && props.collectionScope
    ? [props.collectionScope.path, props.modelValue.path].filter(Boolean).join('/')
    : props.modelValue.path
  return `${scope}:${props.modelValue.sourceId ?? ''}:${path}`
})

const iconMap = {
  collection: IconDataTable,
  field: IconHash,
  folder: IconFolderClosed,
  source: IconDatabase,
}

function sourceNode(source: DataSourceDescriptor): TreeNode {
  return {
    id: `root:${source.id}:`,
    label: source.title || source.name,
    icon: 'source',
    data: { selectable: false, label: source.title || source.name, meta: source.name },
    children: (source.fields ?? []).map(field => fieldNode(source, field, '')),
  }
}

function fieldNode(source: DataSourceDescriptor, field: DataFieldNode, parentPath: string, collectionScope?: CollectionConditionScope): TreeNode {
  const rawPath = resolvePath(field, parentPath)
  const collection = isCollection(field)
  const activeCollectionScope = collectionScope && (!props.collectionScope || sameCollectionScope(collectionScope, props.collectionScope))
    ? collectionScope
    : undefined
  const blockedByDifferentCollection = !!collectionScope && !activeCollectionScope
  const scope = activeCollectionScope ? 'item' : 'root'
  const path = activeCollectionScope ? relativePath(rawPath, activeCollectionScope.path) : rawPath
  const hasChildren = !!field.fields?.length
  const selectable = isSelectable(hasChildren, collection, !!activeCollectionScope, blockedByDifferentCollection)
  const nextCollectionScope = collection && props.mode !== 'collection'
    ? createCollectionScope(source, field, rawPath)
    : activeCollectionScope
  const option: PickerOption = {
    label: field.title || field.name,
    meta: `${source.title || source.name} · ${rawPath}`,
    sourceId: source.id,
    sourceName: source.name,
    sourceTag: source.tag,
    path,
    rawPath,
    field,
    scope,
    collectionScope: activeCollectionScope,
    collection,
    selectable,
  }
  return {
    id: `${scope}:${source.id}:${rawPath}`,
    label: option.label,
    icon: collection ? 'collection' : hasChildren ? 'folder' : 'field',
    data: option,
    children: hasChildren
      ? (field.fields ?? []).map(child => fieldNode(source, child, rawPath, nextCollectionScope))
      : undefined,
  }
}

function isSelectable(hasChildren: boolean, collection: boolean, insideCollection: boolean, blocked: boolean): boolean {
  if (blocked)
    return false
  if (props.mode === 'collection')
    return collection
  if (collection)
    return props.allowCollection === true
  return insideCollection || !hasChildren
}

function isCollection(field: DataFieldNode): boolean {
  return field.tag === 'collection' || field.meta?.type === 'array' || field.meta?.collection === true
}

function filterNodes(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = []
  for (const node of nodes) {
    const children = node.children ? filterNodes(node.children) : undefined
    if (matchesNode(node) || children?.length)
      result.push({ ...node, children })
  }
  return result
}

function matchesNode(node: TreeNode): boolean {
  const option = node.data as Partial<PickerOption> | undefined
  return [
    node.label,
    option?.meta,
    option?.path,
    option?.rawPath,
    option?.sourceName,
  ].some(value => typeof value === 'string' && value.toLowerCase().includes(query.value))
}

function createCollectionScope(source: DataSourceDescriptor, field: DataFieldNode, path: string): CollectionConditionScope {
  return {
    kind: 'collection',
    path,
    quantifier: 'any',
    sourceId: source.id,
    sourceName: source.name,
    sourceTag: source.tag,
    fieldLabel: field.title || field.name,
  }
}

function sameCollectionScope(left: CollectionConditionScope, right: CollectionConditionScope): boolean {
  return left.path === right.path && (!left.sourceId || !right.sourceId || left.sourceId === right.sourceId)
}

function resolvePath(field: DataFieldNode, parentPath: string): string {
  return field.path || [parentPath, field.key || field.name].filter(Boolean).join('/')
}

function relativePath(path: string, collectionPath: string): string {
  const prefix = `${collectionPath}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function displayPath(value?: ConditionFieldRef): string {
  if (!value?.path)
    return ''
  if ((value.scope ?? 'root') === 'item' && props.collectionScope?.path)
    return [props.collectionScope.fieldLabel || props.collectionScope.path, value.path].join(' / ')
  return value.path
}

function chooseNode(node: TreeNode) {
  const option = node.data as PickerOption | undefined
  if (!option?.selectable)
    return
  choose(option)
}

function choose(option: PickerOption) {
  if (props.mode === 'collection') {
    emit('selectCollection', {
      kind: 'collection',
      path: option.rawPath,
      quantifier: 'any',
      sourceId: option.sourceId,
      sourceName: option.sourceName,
      sourceTag: option.sourceTag,
      fieldLabel: option.label,
    })
  }
  else {
    emit('select', {
      scope: option.scope,
      path: option.path,
      sourceId: option.sourceId,
      sourceName: option.sourceName,
      sourceTag: option.sourceTag,
      fieldKey: option.field.key,
      fieldLabel: option.label,
      fieldTag: option.field.tag,
      collectionScope: option.collectionScope,
    })
  }
  search.value = ''
  open.value = false
}
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
        <div v-if="visibleNodes.length" class="condition-field-picker__tree">
          <EiTree
            :key="query"
            :nodes="visibleNodes"
            :selected-id="selectedId"
            :icon-map="iconMap"
            default-expand-all
            @select="chooseNode"
          >
            <template #label="{ node }">
              <span
                class="condition-field-picker__node-label"
                :class="{ 'condition-field-picker__node-label--disabled': !(node.data as PickerOption | undefined)?.selectable }"
              >
                {{ node.label }}
              </span>
            </template>
            <template #indicator="{ node }">
              <span v-if="(node.data as PickerOption | undefined)?.collection" class="condition-field-picker__tag">
                {{ t('designer.condition.collectionTag') }}
              </span>
            </template>
            <template #suffix="{ node }">
              <span v-if="(node.data as PickerOption | undefined)?.path" class="condition-field-picker__path">
                {{ (node.data as PickerOption).path }}
              </span>
            </template>
          </EiTree>
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
  width: min(460px, calc(100vw - 48px));
}

.condition-field-picker__search {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  margin-bottom: 8px;
}

.condition-field-picker__tree {
  max-height: 320px;
  overflow: auto;
}

.condition-field-picker__node-label--disabled {
  color: var(--ei-text-secondary, #777);
}

.condition-field-picker__tag {
  padding: 1px 5px;
  border-radius: 999px;
  background: var(--ei-hover-bg, #f5f5f5);
  color: var(--ei-text-secondary, #777);
  font-size: 10px;
}

.condition-field-picker__path {
  max-width: 120px;
  overflow: hidden;
  color: var(--ei-text-secondary, #aaa);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.condition-field-picker__empty {
  margin: 12px 4px;
  color: var(--ei-text-secondary, #999);
  font-size: 12px;
  text-align: center;
}
</style>
