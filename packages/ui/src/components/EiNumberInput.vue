<script setup lang="ts">
import { IconDown, IconUp } from '@easyink/icons'
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: number | null
  label?: string
  placeholder?: string
  disabled?: boolean
  min?: number
  max?: number
  step?: number
  /** Decimal places to keep. 0 = integer only. undefined = no restriction */
  precision?: number
  /** When false, emit 0 instead of null for empty input. Default true. */
  nullable?: boolean
}>(), {
  nullable: true,
})

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
  'commit': [value: number | null]
}>()

// Internal display text, independent from modelValue to allow empty/intermediate input
const displayText = ref('')

// Snapshot of modelValue at focus time for commit guard
const snapshotValue = ref<number | null>(null)

// Sync displayText when modelValue changes externally
watch(() => props.modelValue, (val) => {
  if (val == null) {
    displayText.value = ''
  }
  else {
    displayText.value = String(val)
  }
}, { immediate: true })

const inputAttrs = computed(() => {
  const attrs: Record<string, unknown> = {}
  if (props.min != null)
    attrs['aria-valuemin'] = props.min
  if (props.max != null)
    attrs['aria-valuemax'] = props.max
  if (props.modelValue != null)
    attrs['aria-valuenow'] = props.modelValue
  return attrs
})

const effectiveStep = computed(() => {
  if (props.step != null)
    return props.step
  if (props.precision != null && props.precision > 0)
    return 1 / (10 ** props.precision)
  return 1
})

const parsedDisplayValue = computed(() => {
  const raw = displayText.value.trim()
  if (raw === '' || raw === '-')
    return null
  const num = Number(raw)
  return Number.isNaN(num) ? null : num
})

const canStepUp = computed(() => {
  if (props.disabled)
    return false
  const value = parsedDisplayValue.value ?? props.modelValue
  if (value == null)
    return props.max == null || getEmptyStepValue(1) <= props.max
  return props.max == null || value < props.max
})

const canStepDown = computed(() => {
  if (props.disabled)
    return false
  const value = parsedDisplayValue.value ?? props.modelValue
  if (value == null)
    return false
  return props.min == null || value > props.min
})

function clamp(val: number): number {
  let result = val
  if (props.min != null && result < props.min)
    result = props.min
  if (props.max != null && result > props.max)
    result = props.max
  return result
}

function roundToPrecision(val: number): number {
  if (props.precision == null)
    return val
  const factor = 10 ** props.precision
  return Math.round(val * factor) / factor
}

function normalizeValue(val: number | null | undefined): number | null {
  return val ?? null
}

function parseInputNumber(raw: string): number | null | undefined {
  if (raw === '' || raw === '-')
    return props.nullable ? null : undefined

  const num = Number(raw)
  if (Number.isNaN(num) || isOutOfRange(num))
    return undefined
  return roundToPrecision(num)
}

function isOutOfRange(val: number): boolean {
  return (props.min != null && val < props.min) || (props.max != null && val > props.max)
}

function onFocus() {
  snapshotValue.value = normalizeValue(props.modelValue)
}

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  displayText.value = raw

  // Preserve intermediate text such as "4" for a min=10 field so users can
  // continue typing "40"; range clamping happens on blur/step commits.
  const next = parseInputNumber(raw)
  if (next === undefined)
    return

  emit('update:modelValue', next)
  // If NaN, don't emit - will be corrected on blur
}

function getEmptyStepValue(direction: 1 | -1): number {
  const step = effectiveStep.value
  const base = direction > 0 && props.min != null && props.min > step ? props.min - step : 0
  return clamp(roundToPrecision(base + step * direction))
}

function getStepBase(direction: 1 | -1): number {
  const current = parsedDisplayValue.value ?? props.modelValue
  if (current != null)
    return current
  return getEmptyStepValue(direction) - effectiveStep.value * direction
}

function stepBy(direction: 1 | -1) {
  if (props.disabled)
    return
  if (direction > 0 && !canStepUp.value)
    return
  if (direction < 0 && !canStepDown.value)
    return

  const finalValue = clamp(roundToPrecision(getStepBase(direction) + effectiveStep.value * direction))
  displayText.value = String(finalValue)
  emit('update:modelValue', finalValue)
  emit('commit', finalValue)
  snapshotValue.value = finalValue
}

function onBlur() {
  const raw = displayText.value.trim()
  let finalValue: number | null

  // Empty => emit null or 0
  if (raw === '' || raw === '-') {
    if (props.nullable || (snapshotValue.value == null && props.modelValue == null)) {
      displayText.value = ''
      finalValue = null
    }
    else {
      displayText.value = '0'
      finalValue = 0
    }
  }
  else {
    const num = Number(raw)
    if (Number.isNaN(num)) {
      // Invalid input: revert to modelValue
      if (props.modelValue == null) {
        if (props.nullable) {
          displayText.value = ''
          finalValue = null
        }
        else {
          displayText.value = '0'
          finalValue = 0
        }
      }
      else {
        displayText.value = String(props.modelValue)
        finalValue = props.modelValue
      }
    }
    else {
      finalValue = clamp(roundToPrecision(num))
      displayText.value = String(finalValue)
    }
  }

  // Avoid turning a plain focus/blur on an empty nullable field into a write.
  if (finalValue !== normalizeValue(props.modelValue))
    emit('update:modelValue', finalValue)

  // Only emit commit if value actually changed from snapshot
  if (finalValue !== snapshotValue.value) {
    emit('commit', finalValue)
  }
  snapshotValue.value = finalValue
}
</script>

<template>
  <div class="ei-number-input-wrapper">
    <label v-if="label" class="ei-number-input__label">{{ label }}</label>
    <div class="ei-number-input" :class="{ 'ei-number-input--disabled': disabled }">
      <input
        class="ei-number-input__field"
        type="text"
        inputmode="decimal"
        role="spinbutton"
        :value="displayText"
        :placeholder="placeholder"
        :disabled="disabled"
        v-bind="inputAttrs"
        @focus="onFocus"
        @input="onInput"
        @blur="onBlur"
      >
      <div class="ei-number-input__stepper">
        <button
          class="ei-number-input__step"
          type="button"
          tabindex="-1"
          aria-label="Increment"
          :disabled="!canStepUp"
          @mousedown.prevent
          @click="stepBy(1)"
        >
          <IconUp :size="10" />
        </button>
        <button
          class="ei-number-input__step"
          type="button"
          tabindex="-1"
          aria-label="Decrement"
          :disabled="!canStepDown"
          @mousedown.prevent
          @click="stepBy(-1)"
        >
          <IconDown :size="10" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-number-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ei-number-input {
  display: flex;
  align-items: stretch;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  background: var(--ei-input-bg, #fff);
  color: var(--ei-text, #333);
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  overflow: hidden;
  transition: border-color 0.15s;

  &__label {
    font-size: 12px;
    color: var(--ei-text-secondary, #666);
  }

  &__field {
    flex: 1;
    min-width: 0;
    width: 100%;
    padding: 4px 8px;
    border: 0;
    outline: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 13px;
    box-sizing: border-box;

    &:disabled {
      cursor: not-allowed;
    }
  }

  &__stepper {
    display: flex;
    flex: 0 0 18px;
    flex-direction: column;
    border-left: 1px solid var(--ei-border-color, #d0d0d0);
    background: var(--ei-bg, #fff);
  }

  &__step {
    display: inline-flex;
    flex: 1 1 0;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    min-height: 0;
    padding: 0;
    border: 0;
    color: var(--ei-text-secondary, #666);
    background: transparent;
    cursor: pointer;

    & + & {
      border-top: 1px solid var(--ei-border-color, #d0d0d0);
    }

    &:hover:not(:disabled) {
      color: var(--ei-primary, #1890ff);
      background: var(--ei-hover-bg, #f5f7fa);
    }

    &:disabled {
      color: var(--ei-text-disabled, #b8b8b8);
      cursor: not-allowed;
    }
  }

  &:focus-within {
    border-color: var(--ei-primary, #1890ff);
  }

  &--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
