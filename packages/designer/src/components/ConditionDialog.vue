<script setup lang="ts">
import type { MaterialConditionDefinition } from '@easyink/core'
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { ConditionCompareOperator, ConditionFieldRef, ConditionRow, ConditionValue, ConditionValueType, RenderCondition } from '@easyink/schema'
import { IconCondition, IconCopy, IconDelete, IconGroup, IconPlus } from '@easyink/icons'
import { deepClone } from '@easyink/shared'
import { EiButton, EiDialog, EiIcon, EiSelect } from '@easyink/ui'
import { computed, ref, watch } from 'vue'
import { changeRowValueType, COMPARE_OPERATORS, CONDITION_QUANTIFIERS, CONDITION_VALUE_TYPES, conditionOperatorFromKey, conditionOperatorKey, createConditionGroup, createConditionRow, createDialogDraft, isRenderConditionComplete, isUnaryOperator, normalizeRenderCondition, updateRowOperator } from '../conditions/editor-model'
import ConditionFieldPicker from './ConditionFieldPicker.vue'
import ConditionValueCell from './ConditionValueCell.vue'

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
const logicHintText = computed(() => [
  props.t(draft.value.whenMatched === 'hide' ? 'designer.condition.logicHintHide' : 'designer.condition.logicHintShow'),
  props.t('designer.condition.logicHintGroups'),
  props.t('designer.condition.logicHintEmpty'),
  ...(!complete.value ? [props.t('designer.condition.incompleteHint')] : []),
].join('\n'))
const operatorLabels: Record<ConditionCompareOperator, string> = {
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
const quantifierLabels = {
  any: 'operatorQuantifierAny',
  all: 'operatorQuantifierAll',
  none: 'operatorQuantifierNone',
} as const
const operatorOptions = computed(() => [
  ...COMPARE_OPERATORS.map(compare => ({ label: props.t(`designer.condition.${operatorLabels[compare]}`), value: compare })),
  ...CONDITION_QUANTIFIERS.flatMap(quantifier =>
    COMPARE_OPERATORS.map(compare => ({
      label: `${props.t(`designer.condition.${quantifierLabels[quantifier]}`)}${props.t(`designer.condition.${operatorLabels[compare]}`)}`,
      value: `${quantifier}:${compare}`,
    })),
  ),
])
const valueTypeOptions = computed(() => CONDITION_VALUE_TYPES.map(value => ({ label: props.t(`designer.condition.type${value.replace(/(^|-)(\w)/g, (_, _dash, char) => char.toUpperCase())}`), value })))
const matchedOptions = computed(() => [
  { label: props.t('designer.condition.show'), value: 'show' },
  { label: props.t('designer.condition.hide'), value: 'hide' },
])
const hiddenEffectOptions = computed(() => [
  ...(props.capability.hiddenEffects.includes('remove') ? [{ label: props.t('designer.condition.hiddenRemove'), value: 'remove' }] : []),
  ...(props.capability.hiddenEffects.includes('reserve') ? [{ label: props.t('designer.condition.hiddenReserve'), value: 'reserve' }] : []),
])

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
}

function addRow(groupIndex: number) {
  const group = draft.value.groups[groupIndex]
  if (group)
    group.conditions.push(createConditionRow())
}

function addFirstGroup() {
  draft.value.groups.push(createConditionGroup())
}

function copyRow(groupIndex: number, rowIndex: number) {
  const group = draft.value.groups[groupIndex]
  const row = group?.conditions[rowIndex]
  if (group && row)
    group.conditions.splice(rowIndex + 1, 0, deepClone(row))
}

function removeRow(groupIndex: number, rowIndex: number) {
  const group = draft.value.groups[groupIndex]
  if (!group)
    return
  group.conditions.splice(rowIndex, 1)
}

function updateRow(groupIndex: number, rowIndex: number, row: ConditionRow) {
  const group = draft.value.groups[groupIndex]
  if (group)
    group.conditions[rowIndex] = row
}

function setSource(groupIndex: number, rowIndex: number, source: ConditionFieldRef) {
  const row = draft.value.groups[groupIndex]?.conditions[rowIndex]
  if (!row)
    return
  updateRow(groupIndex, rowIndex, { ...row, source })
}

function setOperator(groupIndex: number, rowIndex: number, key: string) {
  const row = draft.value.groups[groupIndex]?.conditions[rowIndex]
  if (row)
    updateRow(groupIndex, rowIndex, updateRowOperator(row, conditionOperatorFromKey(key)))
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
  updateRow(groupIndex, rowIndex, { ...row, value })
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
        <label class="condition-dialog__behavior-field">
          <span class="condition-dialog__behavior-label">
            {{ t('designer.condition.whenMatched') }}
          </span>
          <EiSelect :model-value="draft.whenMatched" :options="matchedOptions" @update:model-value="draft.whenMatched = $event as 'show' | 'hide'" />
        </label>
        <label class="condition-dialog__behavior-field">
          <span class="condition-dialog__behavior-label">
            {{ t('designer.condition.whenHidden') }}
          </span>
          <EiSelect :model-value="draft.whenHidden ?? 'remove'" :options="hiddenEffectOptions" @update:model-value="draft.whenHidden = $event as 'remove' | 'reserve'" />
        </label>
        <label class="condition-dialog__behavior-field">
          <span class="condition-dialog__behavior-label">
            {{ t('designer.condition.onUnknown') }}
          </span>
          <EiSelect :model-value="draft.onUnknown ?? 'show'" :options="matchedOptions" @update:model-value="draft.onUnknown = $event as 'show' | 'hide'" />
        </label>
      </div>

      <div class="condition-dialog__logic-hint" :class="{ 'condition-dialog__logic-hint--error': !complete }">
        {{ logicHintText }}
      </div>

      <div v-if="draft.groups.length === 0" class="condition-dialog__empty">
        <div class="condition-dialog__empty-copy">
          <EiIcon :icon="IconCondition" :size="15" />
          <p>{{ t('designer.condition.emptyConditionHint') }}</p>
        </div>
        <EiButton variant="ghost" size="sm" class="condition-dialog__add-action" @click="addFirstGroup">
          <EiIcon :icon="IconPlus" :size="12" />{{ t('designer.condition.addGroup') }}
        </EiButton>
      </div>

      <div v-if="draft.groups.length > 0" class="condition-dialog__groups-toolbar">
        <EiButton variant="ghost" size="sm" class="condition-dialog__add-group condition-dialog__add-action" @click="addGroup">
          <EiIcon :icon="IconPlus" :size="12" />{{ t('designer.condition.addGroup') }}
        </EiButton>
      </div>

      <div class="condition-dialog__groups">
        <template v-for="(group, groupIndex) in draft.groups" :key="groupIndex">
          <div v-if="groupIndex > 0" class="condition-dialog__or">
            <span>{{ t('designer.condition.or') }}</span>
          </div>
          <section class="condition-group">
            <header class="condition-group__header">
              <div class="condition-group__title">
                <EiIcon :icon="IconGroup" :size="14" />
                <strong>{{ t('designer.condition.group') }} {{ groupIndex + 1 }}</strong>
              </div>
              <div class="condition-group__header-actions">
                <EiButton
                  v-if="group.conditions.length > 0"
                  variant="ghost"
                  size="sm"
                  class="condition-dialog__add-action"
                  :aria-label="t('designer.condition.addCondition')"
                  :title="t('designer.condition.addCondition')"
                  @click="addRow(groupIndex)"
                >
                  <EiIcon :icon="IconPlus" :size="14" />
                </EiButton>
                <EiButton variant="ghost" size="sm" class="condition-group__delete" :aria-label="t('designer.condition.deleteGroup')" @click="removeGroup(groupIndex)">
                  <EiIcon :icon="IconDelete" :size="14" />
                </EiButton>
              </div>
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
                  <tr v-if="group.conditions.length === 0">
                    <td colspan="5" class="condition-group__empty-cell">
                      <div class="condition-group__empty">
                        <span>{{ t('designer.condition.emptyGroupHint') }}</span>
                        <EiButton variant="ghost" size="sm" class="condition-dialog__add-action" @click="addRow(groupIndex)">
                          <EiIcon :icon="IconPlus" :size="12" />{{ t('designer.condition.addCondition') }}
                        </EiButton>
                      </div>
                    </td>
                  </tr>
                  <tr v-for="(row, rowIndex) in group.conditions" :key="rowIndex">
                    <td class="condition-group__source-cell">
                      <ConditionFieldPicker :model-value="row.source" :sources="sources" :t="t" @select="setSource(groupIndex, rowIndex, $event)" />
                    </td>
                    <td>
                      <EiSelect :model-value="conditionOperatorKey(row.operator)" :options="operatorOptions" @update:model-value="setOperator(groupIndex, rowIndex, String($event))" />
                    </td>
                    <td>
                      <ConditionValueCell v-if="!isUnaryOperator(row.operator)" :row="row" :t="t" @update="setValue(groupIndex, rowIndex, $event)" />
                      <span v-else class="condition-group__not-applicable">--</span>
                    </td>
                    <td>
                      <EiSelect v-if="!isUnaryOperator(row.operator)" :model-value="row.valueType ?? 'string'" :options="valueTypeOptions" @update:model-value="setValueType(groupIndex, rowIndex, $event as ConditionValueType)" />
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
          </section>
        </template>
      </div>
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

.condition-dialog__behavior-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.condition-dialog__behavior-label {
  display: inline-flex;
  align-items: center;
  color: var(--ei-text-secondary, #666);
  font-size: 12px;
  line-height: 16px;
}

.condition-dialog__logic-hint {
  padding: 9px 11px;
  border-radius: 6px;
  background: var(--ei-bg, #fafafa);
  color: var(--ei-text-secondary, #666);
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-line;
}

.condition-dialog__logic-hint--error {
  background: color-mix(in srgb, var(--ei-danger, #d4380d) 5%, var(--ei-bg, #fafafa));
}

.condition-dialog__empty {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  border-radius: 6px;
  background: var(--ei-bg, #fafafa);
}

.condition-dialog__empty-copy {
  min-width: 0;
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: var(--ei-text-secondary, #666);

  p {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
  }
}

.condition-dialog__groups {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.condition-dialog__groups-toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: -6px;
}

.condition-dialog__or {
  position: relative;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ei-text-secondary, #999);
  font-size: 11px;
  font-weight: 600;

  &::before {
    position: absolute;
    right: 0;
    left: 0;
    height: 1px;
    background: color-mix(in srgb, var(--ei-border-color, #e5e5e5) 58%, transparent);
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
  flex: 0 0 auto;
}

.condition-dialog__add-action {
  background: color-mix(in srgb, var(--ei-primary, #1890ff) 7%, transparent);
  color: var(--ei-primary, #1890ff);

  &:hover {
    background: color-mix(in srgb, var(--ei-primary, #1890ff) 12%, transparent);
  }
}

.condition-group {
  padding: 12px;
  border-radius: 6px;
  background: color-mix(in srgb, var(--ei-bg, #fafafa) 72%, var(--ei-bg-elevated, #fff));
}

.condition-group__header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.condition-group__title {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
  color: var(--ei-text-secondary, #666);

  strong {
    color: var(--ei-text, #333);
    font-size: 13px;
  }
}

.condition-group__header-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.condition-group__empty {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  padding: 10px;
  color: var(--ei-text-secondary, #666);
  font-size: 12px;
}

.condition-group__operator-cell {
  display: flex;
  gap: 6px;
  flex-direction: column;
}

.condition-group__delete {
  color: var(--ei-danger, #d4380d);
}

.condition-group__table-wrap {
  overflow-x: auto;
  border: 1px solid var(--ei-border-color, #e1e5ea);
  border-radius: 6px;
  background: var(--ei-bg-elevated, #fff);
}

.condition-group__table {
  width: 100%;
  min-width: 940px;
  border-collapse: collapse;
  table-layout: fixed;
}

.condition-group__table th {
  height: 34px;
  padding: 0 10px;
  border-bottom: 1px solid var(--ei-border-color, #e1e5ea);
  background: var(--ei-hover-bg, #f6f7f9);
  color: var(--ei-text-secondary, #777);
  font-size: 11px;
  font-weight: 500;
  text-align: left;
}

.condition-group__table td {
  height: 42px;
  padding: 7px 10px;
  border-bottom: 1px solid var(--ei-border-color, #eceff3);
  vertical-align: top;
}

.condition-group__table tbody tr:last-child td {
  border-bottom: 0;
}

.condition-group__table th:nth-child(1) { width: 24%; }
.condition-group__table th:nth-child(2) { width: 17%; }
.condition-group__table th:nth-child(3) { width: 34%; }
.condition-group__table th:nth-child(4) { width: 15%; }
.condition-group__table th:nth-child(5) { width: 78px; }

.condition-group__table th:nth-child(5),
.condition-group__table td:nth-child(5) {
  text-align: center;
}

.condition-group__empty-cell {
  height: 72px;
  padding: 0;
  background: var(--ei-bg, #fafafa);
  text-align: center;
  vertical-align: middle;
}

.condition-group__source-cell {
  padding-left: 4px;
}

.condition-group__actions {
  height: 27px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.condition-group__not-applicable {
  display: inline-flex;
  height: 27px;
  align-items: center;
  color: var(--ei-text-secondary, #999);
}

.condition-group__table :deep(.condition-field-picker__trigger) {
  min-height: 0;
  padding: 4px 8px;
  border-color: var(--ei-border-color, #d0d0d0);
  background: var(--ei-input-bg, #fff);
}

.condition-group__table :deep(.condition-field-picker__trigger:hover) {
  border-color: var(--ei-primary, #1890ff);
  background: var(--ei-input-bg, #fff);
}

.condition-group__table :deep(.condition-field-picker__copy) {
  display: block;
}

.condition-group__table :deep(.condition-field-picker__label) {
  display: block;
  font-size: 13px;
  font-weight: 400;
  line-height: 17px;
}

.condition-group__table :deep(.condition-field-picker__meta) {
  display: none;
}

@media (max-width: 760px) {
  .condition-dialog__behavior {
    grid-template-columns: 1fr;
  }

  .condition-group__header {
    grid-template-columns: 1fr auto;
  }
}
</style>
