<script setup lang="ts">
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { BindingRef } from '@easyink/schema'
import type { BindingDisplayFormat, BindingFormatPresetType, BindingPresetFormat } from '@easyink/shared'
import { findDataFieldNode, getDataFieldCustomFormatTemplates, getDefaultDataFieldCustomFormatTemplate } from '@easyink/datasource'
import { IconCheck, IconEdit } from '@easyink/icons'
import { EiDialog, EiIcon, EiInput } from '@easyink/ui'
import { computed, defineAsyncComponent, ref } from 'vue'
import { createBindingCodeExamples, DEFAULT_CUSTOM_FORMAT_SOURCE } from './binding-format-templates'

const props = defineProps<{
  binding: BindingRef
  bindIndex: number
  t: (key: string) => string
  getDataSource?: (sourceId: string) => DataSourceDescriptor | undefined
}>()

const emit = defineEmits<{
  updateBindingFormat: [format: BindingDisplayFormat | undefined, bindIndex?: number]
}>()

type BindingMode = 'none' | 'preset' | 'custom'
type FormatTab = 'preset' | 'custom'

const BindingCodeEditor = defineAsyncComponent(() => import('./BindingCodeEditor.vue'))

const modeOptions = computed<Array<{ label: string, value: FormatTab }>>(() => [
  { label: props.t('designer.bindingFormat.preset'), value: 'preset' },
  { label: props.t('designer.bindingFormat.custom'), value: 'custom' },
])

interface PresetChoice {
  id: string
  label: string
  hint?: string
  preset?: BindingPresetFormat
}

const presetGroups = computed<Array<{ label: string, choices: PresetChoice[] }>>(() => [
  {
    label: props.t('designer.bindingFormat.presets.groupGeneral'),
    choices: [
      { id: 'raw', label: props.t('designer.bindingFormat.presets.raw'), hint: props.t('designer.bindingFormat.presets.rawHint') },
    ],
  },
  {
    label: props.t('designer.bindingFormat.presets.groupDatetime'),
    choices: [
      { id: 'date-dash', label: '2026-05-04', hint: props.t('designer.bindingFormat.presets.dateHint'), preset: { type: 'datetime', pattern: 'yyyy-MM-dd' } },
      { id: 'date-slash', label: '2026/05/04', hint: props.t('designer.bindingFormat.presets.dateHint'), preset: { type: 'datetime', pattern: 'yyyy/MM/dd' } },
      { id: 'datetime-minute', label: '2026-05-04 09:30', hint: props.t('designer.bindingFormat.presets.datetimeHint'), preset: { type: 'datetime', pattern: 'yyyy-MM-dd HH:mm' } },
      { id: 'datetime-second', label: '2026-05-04 09:30:00', hint: props.t('designer.bindingFormat.presets.datetimeSecondHint'), preset: { type: 'datetime', pattern: 'yyyy-MM-dd HH:mm:ss' } },
      { id: 'time-minute', label: '09:30', hint: props.t('designer.bindingFormat.presets.timeHint'), preset: { type: 'datetime', pattern: 'HH:mm' } },
      { id: 'weekday-long', label: props.t('designer.bindingFormat.presets.weekdayLongLabel'), hint: props.t('designer.bindingFormat.presets.weekdayHint'), preset: { type: 'weekday', weekdayStyle: 'long' } },
    ],
  },
  {
    label: props.t('designer.bindingFormat.presets.groupNumber'),
    choices: [
      { id: 'number-integer', label: '1,235', hint: props.t('designer.bindingFormat.presets.numberIntegerHint'), preset: { type: 'number', maximumFractionDigits: 0 } },
      { id: 'number-decimal2', label: '1,234.50', hint: props.t('designer.bindingFormat.presets.numberDecimalHint'), preset: { type: 'number', minimumFractionDigits: 2, maximumFractionDigits: 2 } },
      { id: 'currency-cny', label: '¥1,234.50', hint: props.t('designer.bindingFormat.presets.currencyCnyHint'), preset: { type: 'currency', currency: 'CNY', minimumFractionDigits: 2, maximumFractionDigits: 2 } },
      { id: 'chinese-money', label: props.t('designer.bindingFormat.presets.chineseMoneyLabel'), hint: props.t('designer.bindingFormat.presets.chineseMoneyHint'), preset: { type: 'chinese-money' } },
      { id: 'percent-integer', label: '13%', hint: props.t('designer.bindingFormat.presets.percentHint'), preset: { type: 'percent', maximumFractionDigits: 0 } },
      { id: 'percent-decimal2', label: '12.50%', hint: props.t('designer.bindingFormat.presets.percentDecimalHint'), preset: { type: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 } },
    ],
  },
])

const presetChoices = computed(() => presetGroups.value.flatMap(group => group.choices))
const formatDialogOpen = ref(false)
const activeTab = ref<FormatTab>('preset')
const draftFormat = ref<BindingDisplayFormat>({})

const activeCustomExamples = computed(() =>
  createBindingCodeExamples(props.t, getDataFieldCustomFormatTemplates(getBindingField(props.binding))),
)
const validationMessage = computed(() => validateFormat(draftFormat.value))

function modeOf(ref: BindingRef): BindingMode {
  return modeOfFormat(ref.format)
}

function modeOfFormat(format: BindingDisplayFormat | undefined): BindingMode {
  if (format?.mode === 'preset' || format?.preset)
    return 'preset'
  if (format?.mode === 'custom' || format?.custom)
    return 'custom'
  return 'none'
}

function cloneFormat(ref: BindingRef): BindingDisplayFormat {
  return {
    ...ref.format,
    preset: ref.format?.preset ? { ...ref.format.preset } : undefined,
    custom: ref.format?.custom ? { ...ref.format.custom } : undefined,
  }
}

function cleanFormat(format: BindingDisplayFormat): BindingDisplayFormat | undefined {
  const next: BindingDisplayFormat = {}
  const isCustom = format.mode === 'custom'
  if (!isCustom && format.prefix)
    next.prefix = format.prefix
  if (!isCustom && format.suffix)
    next.suffix = format.suffix
  if (format.mode === 'preset' && format.preset) {
    next.mode = 'preset'
    next.preset = cleanPreset(format.preset)
  }
  if (format.mode === 'custom' && format.custom?.source?.trim()) {
    next.mode = 'custom'
    next.custom = { source: format.custom.source }
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function cleanPreset(preset: BindingPresetFormat): BindingPresetFormat {
  const next: BindingPresetFormat = { type: preset.type }
  if (preset.pattern)
    next.pattern = preset.pattern
  if (preset.locale)
    next.locale = preset.locale
  if (preset.timeZone)
    next.timeZone = preset.timeZone
  if (preset.weekdayStyle)
    next.weekdayStyle = preset.weekdayStyle
  if (typeof preset.minimumFractionDigits === 'number')
    next.minimumFractionDigits = preset.minimumFractionDigits
  if (typeof preset.maximumFractionDigits === 'number')
    next.maximumFractionDigits = preset.maximumFractionDigits
  if (preset.currency)
    next.currency = preset.currency
  return next
}

function updateDraftTextField(key: 'prefix' | 'suffix', value: string | number) {
  draftFormat.value = { ...draftFormat.value, [key]: String(value) }
}

function updateDraftMode(value: FormatTab) {
  const next = cloneDraftFormat()
  activeTab.value = value
  if (value === 'preset') {
    next.mode = 'preset'
    next.preset = next.preset ?? { type: 'datetime', pattern: 'yyyy-MM-dd HH:mm:ss' }
    next.custom = undefined
  }
  else if (value === 'custom') {
    next.mode = 'custom'
    next.custom = next.custom ?? {
      source: getDefaultCustomFormatSource(props.binding),
    }
    next.preset = undefined
    next.prefix = undefined
    next.suffix = undefined
    next.fallback = undefined
  }
  draftFormat.value = next
}

function applyPresetChoice(choice: PresetChoice) {
  const next = cloneDraftFormat()
  if (!choice.preset) {
    next.mode = undefined
    next.preset = undefined
    next.custom = undefined
  }
  else {
    next.mode = 'preset'
    next.preset = { ...choice.preset }
    next.custom = undefined
  }
  draftFormat.value = next
  activeTab.value = 'preset'
}

function updateDraftCustomSource(value: string) {
  const next = cloneDraftFormat()
  next.mode = 'custom'
  next.custom = { source: value }
  next.preset = undefined
  draftFormat.value = next
  activeTab.value = 'custom'
}

function cloneDraftFormat(): BindingDisplayFormat {
  return {
    ...draftFormat.value,
    preset: draftFormat.value.preset ? { ...draftFormat.value.preset } : undefined,
    custom: draftFormat.value.custom ? { ...draftFormat.value.custom } : undefined,
  }
}

function openFormatDialog() {
  draftFormat.value = cloneFormat(props.binding)
  activeTab.value = modeOf(props.binding) === 'custom' ? 'custom' : 'preset'
  formatDialogOpen.value = true
}

function resetFormatDialog() {
  formatDialogOpen.value = false
  draftFormat.value = {}
  activeTab.value = 'preset'
}

function confirmFormatDialog() {
  if (validationMessage.value)
    return
  emit('updateBindingFormat', cleanFormat(draftFormat.value), props.bindIndex)
  resetFormatDialog()
}

function validateFormat(format: BindingDisplayFormat): string {
  if (format.mode === 'preset' && format.preset) {
    const min = format.preset.minimumFractionDigits
    const max = format.preset.maximumFractionDigits
    if (typeof min === 'number' && !Number.isFinite(min))
      return props.t('designer.bindingFormat.invalidDigits')
    if (typeof max === 'number' && !Number.isFinite(max))
      return props.t('designer.bindingFormat.invalidDigits')
    if (typeof min === 'number' && typeof max === 'number' && min > max)
      return props.t('designer.bindingFormat.invalidDigitRange')
  }
  return ''
}

function formatSummary(ref: BindingRef): string {
  const format = ref.format
  if (!format)
    return props.t('designer.bindingFormat.summaryRaw')

  const parts: string[] = []
  if (modeOf(ref) === 'preset' && format.preset)
    parts.push(`${props.t('designer.bindingFormat.summaryPreset')}: ${presetLabel(format.preset.type)}`)
  else if (modeOf(ref) === 'custom')
    parts.push(props.t('designer.bindingFormat.summaryCustom'))
  else
    parts.push(props.t('designer.bindingFormat.summaryRaw'))

  if (modeOf(ref) !== 'custom') {
    if (format.prefix)
      parts.push(props.t('designer.bindingFormat.summaryPrefix'))
    if (format.suffix)
      parts.push(props.t('designer.bindingFormat.summarySuffix'))
  }
  return parts.join(' / ')
}

function presetLabel(type: BindingFormatPresetType): string {
  const keys: Record<BindingFormatPresetType, string> = {
    'datetime': 'designer.bindingFormat.presetTypes.datetime',
    'weekday': 'designer.bindingFormat.presetTypes.weekday',
    'chinese-money': 'designer.bindingFormat.presetTypes.chineseMoney',
    'number': 'designer.bindingFormat.presetTypes.number',
    'currency': 'designer.bindingFormat.presetTypes.currency',
    'percent': 'designer.bindingFormat.presetTypes.percent',
  }
  return props.t(keys[type]) || type
}

function activePresetChoiceId(): string {
  const preset = draftFormat.value.preset
  if (draftFormat.value.mode !== 'preset' || !preset)
    return 'raw'
  return presetChoices.value.find(choice => choice.preset && isSamePreset(choice.preset, preset))?.id ?? preset.type
}

function isSamePreset(a: BindingPresetFormat, b: BindingPresetFormat): boolean {
  return a.type === b.type
    && a.pattern === b.pattern
    && a.weekdayStyle === b.weekdayStyle
    && a.minimumFractionDigits === b.minimumFractionDigits
    && a.maximumFractionDigits === b.maximumFractionDigits
    && a.currency === b.currency
}

function getDefaultCustomFormatSource(ref: BindingRef | undefined): string {
  return getDefaultDataFieldCustomFormatTemplate(ref ? getBindingField(ref) : undefined)?.source ?? DEFAULT_CUSTOM_FORMAT_SOURCE
}

function getBindingField(ref: BindingRef) {
  return findDataFieldNode(props.getDataSource?.(ref.sourceId), {
    fieldPath: ref.fieldPath,
    fieldKey: ref.fieldKey,
  })
}
</script>

<template>
  <div class="ei-binding-format-editor">
    <span class="ei-binding-format-editor__k">{{ t('designer.property.format') }}</span>
    <div class="ei-binding-format-editor__body">
      <span
        class="ei-binding-format-editor__badge"
        :data-mode="modeOf(binding)"
      >{{ modeOf(binding) === 'preset' ? t('designer.bindingFormat.preset') : modeOf(binding) === 'custom' ? t('designer.bindingFormat.custom') : t('designer.bindingFormat.badgeRaw') }}</span>
      <span class="ei-binding-format-editor__text">{{ formatSummary(binding) }}</span>
    </div>
    <button
      class="ei-binding-format-editor__btn"
      type="button"
      :title="t('designer.bindingFormat.configure')"
      @click="openFormatDialog"
    >
      <EiIcon :icon="IconEdit" :size="14" />
    </button>

    <EiDialog
      :open="formatDialogOpen"
      :title="t('designer.bindingFormat.dialogTitle')"
      :width="860"
      :confirm-text="t('designer.dialog.ok')"
      :cancel-text="t('designer.dialog.cancel')"
      :confirm-disabled="!!validationMessage"
      @update:open="value => { if (!value) resetFormatDialog() }"
      @cancel="resetFormatDialog"
      @close="resetFormatDialog"
      @confirm="confirmFormatDialog"
    >
      <div class="ei-bfd">
        <div class="ei-bfd__tabs">
          <button
            v-for="option in modeOptions"
            :key="option.value"
            class="ei-bfd__tab"
            :class="{ 'ei-bfd__tab--active': activeTab === option.value }"
            type="button"
            @click="updateDraftMode(option.value)"
          >
            {{ option.label }}
          </button>
        </div>

        <div v-if="activeTab === 'preset'" class="ei-bfd__preset-content">
          <div class="ei-bfd__affix-row">
            <span class="ei-bfd__affix-label">{{ t('designer.bindingFormat.prefix') }}</span>
            <EiInput
              :model-value="draftFormat.prefix || ''"
              @update:model-value="value => updateDraftTextField('prefix', value)"
            />
          </div>

          <div
            v-for="group in presetGroups"
            :key="group.label"
            class="ei-bfd__group"
          >
            <div class="ei-bfd__group-label">
              {{ group.label }}
            </div>
            <div class="ei-bfd__chips">
              <button
                v-for="choice in group.choices"
                :key="choice.id"
                class="ei-bfd__chip"
                :class="{ 'ei-bfd__chip--active': activePresetChoiceId() === choice.id }"
                type="button"
                :title="choice.hint"
                @click="applyPresetChoice(choice)"
              >
                <span class="ei-bfd__chip-label">{{ choice.label }}</span>
                <span v-if="choice.hint" class="ei-bfd__chip-hint">{{ choice.hint }}</span>
                <EiIcon
                  v-if="activePresetChoiceId() === choice.id"
                  :icon="IconCheck"
                  :size="11"
                  class="ei-bfd__chip-check"
                />
              </button>
            </div>
          </div>

          <div class="ei-bfd__affix-row">
            <span class="ei-bfd__affix-label">{{ t('designer.bindingFormat.suffix') }}</span>
            <EiInput
              :model-value="draftFormat.suffix || ''"
              @update:model-value="value => updateDraftTextField('suffix', value)"
            />
          </div>
        </div>

        <div v-if="activeTab === 'custom'" class="ei-bfd__custom-body">
          <BindingCodeEditor
            :model-value="draftFormat.custom?.source || getDefaultCustomFormatSource(binding)"
            :placeholder="t('designer.bindingFormat.customSource')"
            :examples="activeCustomExamples"
            :t="t"
            @update:model-value="updateDraftCustomSource"
          />
        </div>

        <div v-if="validationMessage" class="ei-bfd__error">
          {{ validationMessage }}
        </div>
      </div>
    </EiDialog>
  </div>
</template>

<style scoped lang="scss">
.ei-binding-format-editor {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;

  &__k {
    width: 28px;
    flex-shrink: 0;
    padding-top: 1px;
    color: var(--ei-text-secondary, #c8c8c8);
    font-size: 10px;
  }

  &__body {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }

  &__badge {
    flex-shrink: 0;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--ei-primary-soft, #e6f4ff);
    color: var(--ei-primary, #1890ff);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.3px;

    &[data-mode='none'] {
      background: #f0f0f0;
      color: var(--ei-text-secondary, #999);
    }

    &[data-mode='custom'] {
      background: #fff7e6;
      color: #d46b08;
    }
  }

  &__text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--ei-text-secondary, #999);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--ei-text-secondary, #bbb);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;

    &:hover {
      background: var(--ei-panel-header-bg, #f0f0f0);
      color: var(--ei-text, #555);
    }
  }
}

.ei-bfd {
  display: flex;
  flex-direction: column;
  min-height: 560px;

  &__tabs {
    display: inline-flex;
    align-items: stretch;
    align-self: flex-start;
    margin-bottom: 8px;
  }

  &__tab {
    position: relative;
    padding: 2px 12px;
    border: none;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: var(--ei-text-secondary, #999);
    font-size: 12px;
    font-weight: 400;
    cursor: pointer;
    transition: color 0.15s, border-color 0.15s;

    &--active {
      border-bottom-color: var(--ei-primary, #1890ff);
      color: var(--ei-primary, #1890ff);
      font-weight: 600;
    }

    &:not(&--active):hover {
      color: var(--ei-text, #555);
    }

    & + & {
      &::before {
        position: absolute;
        top: 20%;
        left: 0;
        width: 1px;
        height: 60%;
        background: #e0e0e0;
        content: '';
      }
    }
  }

  &__preset-content {
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow-y: auto;
    max-height: 440px;
    padding: 12px 0 0;
  }

  &__group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__group-label,
  &__affix-label {
    color: var(--ei-text-secondary, #bbb);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.9px;
    text-transform: uppercase;
  }

  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  &__chip {
    position: relative;
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    max-width: 180px;
    padding: 5px 10px;
    border: none;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
    transition: background 0.12s;

    &:hover {
      background: color-mix(in srgb, var(--ei-primary, #1890ff) 7%, var(--ei-bg, #fff));
    }

    &--active {
      padding-right: 24px;
      background: color-mix(in srgb, var(--ei-primary, #1890ff) 13%, var(--ei-bg, #fff));
    }
  }

  &__chip-label {
    overflow: hidden;
    max-width: 100%;
    color: var(--ei-text, #333);
    font-size: 12px;
    font-weight: 500;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;

    .ei-bfd__chip--active & {
      color: var(--ei-primary, #1890ff);
      font-weight: 600;
    }
  }

  &__chip-hint {
    color: var(--ei-text-secondary, #bbb);
    font-size: 10px;
    line-height: 1.2;

    .ei-bfd__chip--active & {
      color: color-mix(in srgb, var(--ei-primary, #1890ff) 55%, var(--ei-text-secondary, #bbb));
    }
  }

  &__chip-check {
    position: absolute;
    top: 6px;
    right: 7px;
    flex-shrink: 0;
    color: var(--ei-primary, #1890ff);
  }

  &__custom-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    overflow: hidden;
    padding: 12px 0 0;
  }

  &__affix-row {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  &__group + &__group,
  &__affix-row + &__group,
  &__group + &__affix-row {
    margin-top: 8px;
    padding-top: 12px;
    border-top: 1px dashed rgba(0, 0, 0, 0.07);
  }

  &__error {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    padding: 8px 12px;
    border: 1px solid #ffccc7;
    border-radius: 5px;
    background: #fff2f0;
    color: var(--ei-danger, #ff4d4f);
    font-size: 12px;
    line-height: 1.5;
  }
}
</style>
