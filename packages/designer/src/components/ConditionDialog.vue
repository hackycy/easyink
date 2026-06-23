<script setup lang="ts">
import type { MaterialConditionDefinition } from '@easyink/core'
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { CollectionConditionScope, CompareOperator, ConditionFieldRef, ConditionRow, ConditionValue, ConditionValueType, RenderCondition } from '@easyink/schema'
import { IconCopy, IconDelete, IconPlus } from '@easyink/icons'
import { deepClone } from '@easyink/shared'
import { EiButton, EiCheckbox, EiDialog, EiIcon, EiSelect } from '@easyink/ui'
import { computed, ref, watch } from 'vue'
import { changeRowValueType, COMPARE_OPERATORS, CONDITION_VALUE_TYPES, createConditionGroup, createConditionRow, createDialogDraft, isRenderConditionComplete, normalizeRenderCondition, UNARY_OPERATORS, updateRowOperator } from '../conditions/editor-model'
import ConditionFieldPicker from './ConditionFieldPicker.vue'
import ConditionValueCell from './ConditionValueCell.vue'

type FieldSelection = ConditionFieldRef & { collectionScope?: CollectionConditionScope }
type ValueSelection = ConditionValue | ConditionValue[]

const props = defineProps<{
  open: boolean
  condition?: RenderCondition
  capability: MaterialConditionDefinition
  sources: DataSourceDescriptor[]
  t: (key: string) => string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'confirm': [condition: RenderCondition]
}>()

const draft = ref<RenderCondition>(createDialogDraft(props.condition))

const complete = computed(() => isRenderConditionComplete(draft.value))
const operatorLabels: Record<CompareOperator, string> = {
  eq: 'operatorEq',
  neq: 'operatorNeq',
  gt: 'operatorGt',
  gte: 'operatorGte',
  lt: 'operatorLt',
  lte: 'operatorLte',
  between: 'operatorBetween',
  notBetween: 'operatorNotBetween',
  in: 'operatorIn',
  notIn: 'operatorNotIn',
  contains: 'operatorContains',
  notContains: 'operatorNotContains',
  startsWith: 'operatorStartsWith',
  endsWith: 'operatorEndsWith',
  exists: 'operatorExists',
  notExists: 'operatorNotExists',
  isEmpty: 'operatorIsEmpty',
  isNotEmpty: 'operatorIsNotEmpty',
}
const operatorOptions = computed(() => COMPARE_OPERATORS.map(value => ({ label: props.t(`designer.condition.${operatorLabels[value]}`), value })))
const valueTypeOptions = computed(() => CONDITION_VALUE_TYPES.map(value => ({ label: props.t(`designer.condition.type${value.replace(/(^|-)(\w)/g, (_, _dash, char) => char.toUpperCase())}`), value })))
const matchedOptions = computed(() => [
  { label: props.t('designer.condition.show'), value: 'show' },
  { label: props.t('designer.condition.hide'), value: 'hide' },
])
const hiddenEffectOptions = computed(() => [
  ...(props.capability.hiddenEffects.includes('remove') ? [{ label: props.t('designer.condition.hiddenRemove'), value: 'remove' }] : []),
  ...(props.capability.hiddenEffects.includes('reserve') ? [{ label: props.t('designer.condition.hiddenReserve'), value: 'reserve' }] : []),
])
const quantifierOptions = computed(() => [
  { label: props.t('designer.condition.quantifierAny'), value: 'any' },
  { label: props.t('designer.condition.quantifierAll'), value: 'all' },
  { label: props.t('designer.condition.quantifierNone'), value: 'none' },
])
const caseSensitiveOperators: CompareOperator[] = ['eq', 'neq', 'in', 'notIn', 'contains', 'notContains', 'startsWith', 'endsWith']

watch(() => props.open, (open) => {
  if (open)
    draft.value = createDialogDraft(props.condition)
})

function close() {
  emit('update:open', false)
}

function save() {
  if (!complete.value)
    return
  emit('confirm', normalizeRenderCondition(draft.value))
  close()
}

function addGroup() {
  draft.value.groups.push(createConditionGroup())
}

function removeGroup(index: number) {
  draft.value.groups.splice(index, 1)
  if (draft.value.groups.length === 0)
    draft.value.groups.push(createConditionGroup())
}

function addRow(groupIndex: number) {
  const group = draft.value.groups[groupIndex]
  if (group)
    group.conditions.push(createConditionRow(group.scope ? { scope: 'item', path: '' } : { path: '' }))
}

function copyRow(groupIndex: number, rowIndex: number) {
  const group = draft.value.groups[groupIndex]
  const row = group?.conditions[rowIndex]
  if (group && row)
    group.conditions.splice(rowIndex + 1, 0, deepClone(row))
}

function removeRow(groupIndex: number, rowIndex: number) {
  draft.value.groups[groupIndex]?.conditions.splice(rowIndex, 1)
}

function updateRow(groupIndex: number, rowIndex: number, row: ConditionRow) {
  const group = draft.value.groups[groupIndex]
  if (group)
    group.conditions[rowIndex] = row
}

function setSource(groupIndex: number, rowIndex: number, source: FieldSelection) {
  const row = draft.value.groups[groupIndex]?.conditions[rowIndex]
  if (!row)
    return
  const { field, collectionScope } = normalizeFieldSelection(source)
  applyCollectionSelection(groupIndex, collectionScope)
  updateRow(groupIndex, rowIndex, { ...row, source: field })
  reconcileGroupScope(groupIndex)
}

function setOperator(groupIndex: number, rowIndex: number, operator: CompareOperator) {
  const row = draft.value.groups[groupIndex]?.conditions[rowIndex]
  if (row)
    updateRow(groupIndex, rowIndex, updateRowOperator(row, operator))
}

function setValueType(groupIndex: number, rowIndex: number, type: ConditionValueType) {
  const row = draft.value.groups[groupIndex]?.conditions[rowIndex]
  if (row)
    updateRow(groupIndex, rowIndex, changeRowValueType(row, type))
}

function setValue(groupIndex: number, rowIndex: number, value: ValueSelection) {
  const row = draft.value.groups[groupIndex]?.conditions[rowIndex]
  if (!row)
    return
  const normalized = normalizeValueSelection(value)
  applyCollectionSelection(groupIndex, normalized.collectionScope)
  updateRow(groupIndex, rowIndex, { ...row, value: normalized.value })
  reconcileGroupScope(groupIndex)
}

function normalizeFieldSelection(selection: FieldSelection): { field: ConditionFieldRef, collectionScope?: CollectionConditionScope } {
  const { collectionScope, ...field } = selection
  return { field, collectionScope }
}

function normalizeValueSelection(value: ValueSelection): { value: ConditionValue | ConditionValue[], collectionScope?: CollectionConditionScope } {
  let collectionScope: CollectionConditionScope | undefined
  const normalize = (item: ConditionValue): ConditionValue => {
    if (item.kind !== 'field')
      return item
    const normalized = normalizeFieldSelection(item.field as FieldSelection)
    collectionScope ??= normalized.collectionScope
    return { kind: 'field', field: normalized.field }
  }
  return {
    value: Array.isArray(value) ? value.map(normalize) : normalize(value),
    collectionScope,
  }
}

function applyCollectionSelection(groupIndex: number, scope?: CollectionConditionScope) {
  const group = draft.value.groups[groupIndex]
  if (!group || !scope)
    return
  group.scope = { ...scope, quantifier: group.scope?.quantifier ?? scope.quantifier }
}

function reconcileGroupScope(groupIndex: number) {
  const group = draft.value.groups[groupIndex]
  if (!group?.scope)
    return
  if (!group.conditions.some(hasItemReference))
    delete group.scope
}

function hasItemReference(row: ConditionRow): boolean {
  if ((row.source.scope ?? 'root') === 'item')
    return true
  const values = Array.isArray(row.value) ? row.value : row.value ? [row.value] : []
  return values.some(value => value.kind === 'field' && (value.field.scope ?? 'root') === 'item')
}

function collectionTitle(scope: CollectionConditionScope): string {
  return scope.fieldLabel || scope.path
}
</script>

<template>
  <EiDialog
    :open="open"
    :title="t('designer.condition.dialogTitle')"
    width="calc(100vw - 64px)"
    max-width="1180px"
    :cancel-text="t('designer.condition.cancel')"
    :confirm-text="t('designer.condition.save')"
    :confirm-disabled="!complete"
    :close-on-overlay="false"
    @update:open="$emit('update:open', $event)"
    @cancel="close"
    @confirm="save"
  >
    <div class="condition-dialog">
      <div class="condition-dialog__behavior">
        <EiSelect :label="t('designer.condition.whenMatched')" :model-value="draft.whenMatched" :options="matchedOptions" @update:model-value="draft.whenMatched = $event as 'show' | 'hide'" />
        <EiSelect :label="t('designer.condition.whenHidden')" :model-value="draft.whenHidden ?? 'remove'" :options="hiddenEffectOptions" @update:model-value="draft.whenHidden = $event as 'remove' | 'reserve'" />
        <EiSelect :label="t('designer.condition.onUnknown')" :model-value="draft.onUnknown ?? 'show'" :options="matchedOptions" @update:model-value="draft.onUnknown = $event as 'show' | 'hide'" />
      </div>

      <p class="condition-dialog__logic-hint">
        {{ t('designer.condition.logicHint') }}
      </p>

      <div class="condition-dialog__groups">
        <template v-for="(group, groupIndex) in draft.groups" :key="groupIndex">
          <div v-if="groupIndex > 0" class="condition-dialog__or">
            <span>{{ t('designer.condition.or') }}</span>
          </div>
          <section class="condition-group" :class="{ 'condition-group--collection': group.scope }">
            <header class="condition-group__header">
              <div class="condition-group__title">
                <strong>{{ t('designer.condition.group') }} {{ groupIndex + 1 }}</strong>
                <span>{{ t('designer.condition.groupAndHint') }}</span>
              </div>
              <div v-if="group.scope" class="condition-group__collection-rule">
                <span class="condition-group__collection-name">{{ collectionTitle(group.scope) }}</span>
                <span>{{ t('designer.condition.collectionInfix') }}</span>
                <EiSelect class="condition-group__quantifier" :model-value="group.scope.quantifier" :options="quantifierOptions" @update:model-value="group.scope!.quantifier = $event as 'any' | 'all' | 'none'" />
                <span>{{ t('designer.condition.collectionMatchSuffix') }}</span>
              </div>
              <EiButton variant="ghost" size="sm" class="condition-group__delete" :aria-label="t('designer.condition.deleteGroup')" @click="removeGroup(groupIndex)">
                <EiIcon :icon="IconDelete" :size="14" />
              </EiButton>
            </header>

            <div class="condition-group__table-wrap">
              <table class="condition-group__table">
                <thead>
                  <tr>
                    <th>{{ t('designer.condition.dataSource') }}</th>
                    <th>{{ t('designer.condition.operator') }}</th>
                    <th>{{ t('designer.condition.value') }}</th>
                    <th>{{ t('designer.condition.dataType') }}</th>
                    <th>{{ t('designer.condition.actions') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, rowIndex) in group.conditions" :key="rowIndex">
                    <td class="condition-group__source-cell">
                      <ConditionFieldPicker :model-value="row.source" :sources="sources" :collection-scope="group.scope" :allow-collection="UNARY_OPERATORS.includes(row.operator)" :t="t" @select="setSource(groupIndex, rowIndex, $event)" />
                    </td>
                    <td><EiSelect :model-value="row.operator" :options="operatorOptions" @update:model-value="setOperator(groupIndex, rowIndex, $event as CompareOperator)" /></td>
                    <td>
                      <ConditionValueCell v-if="!UNARY_OPERATORS.includes(row.operator)" :row="row" :sources="sources" :collection-scope="group.scope" :t="t" @update="setValue(groupIndex, rowIndex, $event)" />
                      <span v-else class="condition-group__not-applicable">--</span>
                      <EiCheckbox v-if="caseSensitiveOperators.includes(row.operator)" class="condition-group__secondary-option" :label="t('designer.condition.caseSensitive')" :model-value="row.options?.caseSensitive !== false" @update:model-value="updateRow(groupIndex, rowIndex, { ...row, options: { ...row.options, caseSensitive: $event } })" />
                    </td>
                    <td>
                      <EiSelect v-if="!UNARY_OPERATORS.includes(row.operator)" :model-value="row.valueType ?? 'string'" :options="valueTypeOptions" @update:model-value="setValueType(groupIndex, rowIndex, $event as ConditionValueType)" />
                      <span v-else class="condition-group__not-applicable">--</span>
                    </td>
                    <td>
                      <div class="condition-group__actions">
                        <EiButton variant="ghost" size="sm" :title="t('designer.condition.copyCondition')" @click="copyRow(groupIndex, rowIndex)">
                          <EiIcon :icon="IconCopy" :size="14" />
                        </EiButton>
                        <EiButton variant="ghost" size="sm" :title="t('designer.condition.deleteRule')" @click="removeRow(groupIndex, rowIndex)">
                          <EiIcon :icon="IconDelete" :size="14" />
                        </EiButton>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <EiButton size="sm" class="condition-group__add" @click="addRow(groupIndex)">
              <EiIcon :icon="IconPlus" :size="12" />{{ t('designer.condition.addCondition') }}
            </EiButton>
          </section>
        </template>
      </div>

      <EiButton class="condition-dialog__add-group" @click="addGroup">
        <EiIcon :icon="IconPlus" :size="13" />{{ t('designer.condition.addGroup') }}
      </EiButton>
      <p v-if="!complete" class="condition-dialog__error">
        {{ t('designer.condition.incompleteHint') }}
      </p>
    </div>
  </EiDialog>
</template>

<style scoped lang="scss">
.condition-dialog {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.condition-dialog__behavior {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr));
  gap: 12px;
}

.condition-dialog__logic-hint {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--ei-hover-bg, #f5f5f5);
  color: var(--ei-text-secondary, #666);
  font-size: 12px;
}

.condition-dialog__groups {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.condition-dialog__or {
  position: relative;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ei-primary, #1890ff);
  font-size: 11px;
  font-weight: 600;

  &::before {
    position: absolute;
    right: 0;
    left: 0;
    height: 1px;
    background: var(--ei-border-color, #e5e5e5);
    content: '';
  }

  span {
    position: relative;
    padding: 2px 10px;
    border-radius: 10px;
    background: var(--ei-bg-elevated, #fff);
  }
}

.condition-dialog__add-group {
  align-self: flex-start;
}

.condition-dialog__error {
  margin: 0;
  color: var(--ei-danger, #d4380d);
  font-size: 12px;
}

.condition-group {
  padding: 12px;
  border: 1px solid var(--ei-border-color, #e3e6ea);
  border-radius: 8px;
  background: var(--ei-bg-elevated, #fff);

  &--collection {
    border-color: color-mix(in srgb, var(--ei-primary, #1890ff) 28%, var(--ei-border-color, #e3e6ea));
  }
}

.condition-group__header {
  display: grid;
  grid-template-columns: minmax(120px, auto) minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.condition-group__title {
  display: flex;
  flex-direction: column;
  gap: 2px;

  strong {
    font-size: 13px;
  }

  span {
    color: var(--ei-text-secondary, #777);
    font-size: 11px;
  }
}

.condition-group__collection-rule {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  color: var(--ei-text-secondary, #666);
  font-size: 12px;
}

.condition-group__collection-name {
  max-width: 220px;
  overflow: hidden;
  color: var(--ei-text, #333);
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.condition-group__quantifier {
  width: 124px;
  flex: 0 0 124px;
}

.condition-group__delete {
  color: var(--ei-danger, #d4380d);
}

.condition-group__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--ei-border-color, #eceff3);
  border-radius: 6px;
}

.condition-group__table {
  width: 100%;
  min-width: 940px;
  border-collapse: collapse;
  table-layout: fixed;
}

.condition-group__table th {
  height: 32px;
  padding: 0 10px;
  border-bottom: 1px solid var(--ei-border-color, #eceff3);
  background: var(--ei-hover-bg, #f7f8fa);
  color: var(--ei-text-secondary, #777);
  font-size: 11px;
  font-weight: 500;
  text-align: left;
}

.condition-group__table td {
  min-height: 44px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--ei-border-color, #f0f1f3);
  vertical-align: top;
}

.condition-group__table tbody tr:last-child td {
  border-bottom: 0;
}

.condition-group__table th:nth-child(1) { width: 24%; }
.condition-group__table th:nth-child(2) { width: 15%; }
.condition-group__table th:nth-child(3) { width: 36%; }
.condition-group__table th:nth-child(4) { width: 15%; }
.condition-group__table th:nth-child(5) { width: 78px; }

.condition-group__source-cell {
  padding-left: 4px;
}

.condition-group__actions {
  min-height: 34px;
  display: flex;
  justify-content: flex-end;
  gap: 2px;
}

.condition-group__not-applicable {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  color: var(--ei-text-secondary, #999);
}

.condition-group__secondary-option {
  margin-top: 4px;
  color: var(--ei-text-secondary, #777);
}

.condition-group__add {
  margin-top: 10px;
}

.condition-group__table :deep(.ei-select__trigger),
.condition-group__table :deep(.ei-input),
.condition-group__table :deep(.ei-number-input) {
  min-height: 34px;
  border-color: transparent;
  background: transparent;

  &:hover,
  &:focus,
  &:focus-within {
    border-color: var(--ei-border-color, #d0d0d0);
    background: var(--ei-input-bg, #fff);
  }
}

@media (max-width: 760px) {
  .condition-dialog__behavior {
    grid-template-columns: 1fr;
  }

  .condition-group__header {
    grid-template-columns: 1fr auto;
  }

  .condition-group__collection-rule {
    grid-column: 1 / -1;
  }
}
</style>
