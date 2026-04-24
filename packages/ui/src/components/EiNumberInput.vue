<script setup lang="ts">
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
const snapshotValue = ref<number | null | undefined>()

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
    attrs.min = props.min
  if (props.max != null)
    attrs.max = props.max
  if (props.step != null)
    attrs.step = props.step
  else if (props.precision != null && props.precision > 0)
    attrs.step = 1 / (10 ** props.precision)
  return attrs
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

function onFocus() {
  snapshotValue.value = props.modelValue
}

function onInput(event: Event) {
  const raw = (event.target as HTMLInputElement).value
  displayText.value = raw

  // Allow empty input => emit null (or 0 if not nullable)
  if (raw === '' || raw === '-') {
    emit('update:modelValue', props.nullable ? null : 0)
    return
  }

  const num = Number(raw)
  if (!Number.isNaN(num)) {
    emit('update:modelValue', clamp(roundToPrecision(num)))
  }
  // If NaN, don't emit - will be corrected on blur
}

function onBlur() {
  const raw = displayText.value.trim()
  let finalValue: number | null

  // Empty => emit null or 0
  if (raw === '') {
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

  // Always emit update:modelValue to ensure model consistency
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
    <input
      class="ei-number-input"
      type="number"
      :value="displayText"
      :placeholder="placeholder"
      :disabled="disabled"
      v-bind="inputAttrs"
      @focus="onFocus"
      @input="onInput"
      @blur="onBlur"
    >
  </div>
</template>

<style scoped>
.ei-number-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ei-number-input__label {
  font-size: 12px;
  color: var(--ei-text-secondary, #666);
}

.ei-number-input {
  padding: 4px 8px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  background: var(--ei-input-bg, #fff);
  color: var(--ei-text, #333);
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
}

.ei-number-input:focus {
  border-color: var(--ei-primary, #1890ff);
}

.ei-number-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
