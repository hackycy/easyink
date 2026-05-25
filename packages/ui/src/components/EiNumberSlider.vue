<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  modelValue?: number | null
  label?: string
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

const snapshotValue = ref<number | null>(null)

const effectiveMin = computed(() => props.min ?? 0)
const effectiveMax = computed(() => props.max ?? 100)
const effectiveStep = computed(() => {
  if (props.step != null)
    return props.step
  if (props.precision != null && props.precision > 0)
    return 1 / (10 ** props.precision)
  return 1
})

const currentValue = computed(() => {
  const fallback = props.nullable ? effectiveMin.value : 0
  return clamp(roundToPrecision(props.modelValue ?? fallback))
})

const progressPercent = computed(() => {
  const range = effectiveMax.value - effectiveMin.value
  if (range <= 0)
    return 0
  return ((currentValue.value - effectiveMin.value) / range) * 100
})

const sliderStyle = computed(() => ({
  '--ei-number-slider-percent': `${progressPercent.value}%`,
}))

watch(() => props.modelValue, (value) => {
  if (value == null)
    return
  const next = clamp(roundToPrecision(value))
  if (next !== value)
    emit('update:modelValue', next)
}, { immediate: true })

function clamp(val: number): number {
  let result = val
  if (result < effectiveMin.value)
    result = effectiveMin.value
  if (result > effectiveMax.value)
    result = effectiveMax.value
  return result
}

function roundToPrecision(val: number): number {
  if (props.precision == null)
    return val
  const factor = 10 ** props.precision
  return Math.round(val * factor) / factor
}

function normalizeValue(value: number | null | undefined): number | null {
  return value ?? null
}

function parseSliderValue(raw: string): number {
  return clamp(roundToPrecision(Number(raw)))
}

function takeSnapshot() {
  snapshotValue.value = normalizeValue(props.modelValue)
}

function onInput(event: Event) {
  emit('update:modelValue', parseSliderValue((event.target as HTMLInputElement).value))
}

function onCommit(event: Event) {
  const next = parseSliderValue((event.target as HTMLInputElement).value)
  if (next !== normalizeValue(props.modelValue))
    emit('update:modelValue', next)
  if (next !== snapshotValue.value)
    emit('commit', next)
  snapshotValue.value = next
}
</script>

<template>
  <div class="ei-number-slider-wrapper">
    <div v-if="label" class="ei-number-slider__header">
      <label class="ei-number-slider__label">{{ label }}</label>
      <span class="ei-number-slider__value">{{ currentValue }}</span>
    </div>
    <div
      class="ei-number-slider"
      :class="{ 'ei-number-slider--disabled': disabled }"
    >
      <input
        class="ei-number-slider__range"
        type="range"
        :value="currentValue"
        :min="effectiveMin"
        :max="effectiveMax"
        :step="effectiveStep"
        :disabled="disabled"
        :style="sliderStyle"
        @focus="takeSnapshot"
        @pointerdown="takeSnapshot"
        @input="onInput"
        @change="onCommit"
      >
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-number-slider-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.ei-number-slider {
  display: flex;
  align-items: center;
  min-width: 0;
  width: 100%;
  height: 26px;
  box-sizing: border-box;

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
  }

  &__label {
    min-width: 0;
    color: var(--ei-text-secondary, #666);
    font-size: 12px;
  }

  &__value {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 18px;
    padding: 0 6px;
    border: 1px solid var(--ei-border-color, #d0d0d0);
    border-radius: 4px;
    background: var(--ei-input-bg, #fff);
    color: var(--ei-text, #333);
    font-size: 12px;
    line-height: 18px;
    box-sizing: border-box;
  }

  &__range {
    width: 100%;
    min-width: 0;
    height: 18px;
    margin: 0;
    border: 0;
    outline: none;
    appearance: none;
    background: transparent;
    cursor: pointer;

    &::-webkit-slider-runnable-track {
      height: 4px;
      border-radius: 999px;
      background:
        linear-gradient(
          90deg,
          var(--ei-primary, #1890ff) 0,
          var(--ei-primary, #1890ff) var(--ei-number-slider-percent, 0%),
          var(--ei-border-color, #d0d0d0) var(--ei-number-slider-percent, 0%),
          var(--ei-border-color, #d0d0d0) 100%
        );
    }

    &::-moz-range-track {
      height: 4px;
      border-radius: 999px;
      background: var(--ei-border-color, #d0d0d0);
    }

    &::-moz-range-progress {
      height: 4px;
      border-radius: 999px;
      background: var(--ei-primary, #1890ff);
    }

    &::-webkit-slider-thumb {
      width: 14px;
      height: 14px;
      margin-top: -5px;
      border: 2px solid var(--ei-primary, #1890ff);
      border-radius: 50%;
      appearance: none;
      background: var(--ei-input-bg, #fff);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.16);
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    &::-moz-range-thumb {
      width: 10px;
      height: 10px;
      border: 2px solid var(--ei-primary, #1890ff);
      border-radius: 50%;
      background: var(--ei-input-bg, #fff);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.16);
      transition: border-color 0.15s, box-shadow 0.15s;
    }

    &:focus-visible::-webkit-slider-thumb,
    &:hover:not(:disabled)::-webkit-slider-thumb {
      box-shadow: 0 0 0 3px var(--ei-hover-bg, rgba(24, 144, 255, 0.12));
    }

    &:focus-visible::-moz-range-thumb,
    &:hover:not(:disabled)::-moz-range-thumb {
      box-shadow: 0 0 0 3px var(--ei-hover-bg, rgba(24, 144, 255, 0.12));
    }

    &:disabled {
      cursor: not-allowed;
    }
  }

  &--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
