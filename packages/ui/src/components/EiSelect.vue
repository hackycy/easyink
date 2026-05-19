<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { IconCheck, IconClose, IconDown } from '@easyink/icons'
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'

type SelectValue = string | number

export interface EiSelectOption {
  label: string
  value: SelectValue
  disabled?: boolean
  title?: string
}

const props = withDefaults(
  defineProps<{
    modelValue?: SelectValue
    options: EiSelectOption[]
    placeholder?: string
    disabled?: boolean
    label?: string
    clearable?: boolean
    emptyText?: string
    maxHeight?: number
    dropdownWidth?: number | string
    placement?: 'bottom-start' | 'bottom-end'
  }>(),
  {
    emptyText: '--',
    maxHeight: 220,
    placement: 'bottom-start',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: SelectValue]
  'commit': [value: SelectValue]
  'openChange': [open: boolean]
}>()

const triggerId = useId()
const listboxId = `${triggerId}-listbox`

const isOpen = ref(false)
const activeIndex = ref(-1)
const triggerRef = ref<HTMLElement | null>(null)
const triggerButtonRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const panelPos = ref({ top: 0, left: 0, minWidth: 0, maxWidth: 0 })

const selectedIndex = computed(() =>
  props.options.findIndex(opt => isSameValue(opt.value, props.modelValue)),
)

const selectedOption = computed(() =>
  selectedIndex.value >= 0 ? props.options[selectedIndex.value] : undefined,
)

const displayValue = computed(() => selectedOption.value?.label ?? props.placeholder ?? '')
const hasValue = computed(() => selectedOption.value !== undefined)
const canClear = computed(() => props.clearable && hasValue.value && !props.disabled)

const panelStyle = computed<CSSProperties>(() => {
  const width = normalizeCssSize(props.dropdownWidth)
  return {
    'position': 'fixed',
    'top': `${panelPos.value.top}px`,
    'left': `${panelPos.value.left}px`,
    'minWidth': `${panelPos.value.minWidth}px`,
    'width': width ?? `${panelPos.value.minWidth}px`,
    'maxWidth': panelPos.value.maxWidth ? `${panelPos.value.maxWidth}px` : undefined,
    'zIndex': 9999,
    '--ei-select-max-height': `${props.maxHeight}px`,
  }
})

function normalizeCssSize(value: number | string | undefined) {
  if (typeof value === 'number')
    return `${value}px`
  return value
}

function isSameValue(a: SelectValue | undefined, b: SelectValue | undefined) {
  if (a === undefined || b === undefined)
    return a === b
  return String(a) === String(b)
}

function findEnabledIndex(start: number, direction: 1 | -1) {
  if (props.options.length === 0)
    return -1

  for (let step = 0; step < props.options.length; step += 1) {
    const index = (start + step * direction + props.options.length) % props.options.length
    if (!props.options[index]?.disabled)
      return index
  }
  return -1
}

function setInitialActiveIndex() {
  if (selectedIndex.value >= 0 && !props.options[selectedIndex.value]?.disabled) {
    activeIndex.value = selectedIndex.value
    return
  }
  activeIndex.value = findEnabledIndex(0, 1)
}

function calcPanelPos() {
  const trigger = triggerRef.value
  if (!trigger)
    return

  const rect = trigger.getBoundingClientRect()
  const panelH = panelRef.value?.offsetHeight ?? Math.min(props.maxHeight + 8, 260)
  const panelW = panelRef.value?.offsetWidth || rect.width
  const margin = 8
  const gap = 4
  const spaceBelow = window.innerHeight - rect.bottom - margin
  const spaceAbove = rect.top - margin
  const shouldFlip = spaceBelow < panelH && spaceAbove > spaceBelow

  let top = shouldFlip ? rect.top - panelH - gap : rect.bottom + gap
  top = Math.max(margin, Math.min(top, window.innerHeight - panelH - margin))

  let left = props.placement === 'bottom-end' ? rect.right - panelW : rect.left
  left = Math.max(margin, Math.min(left, window.innerWidth - panelW - margin))

  panelPos.value = {
    top,
    left,
    minWidth: rect.width,
    maxWidth: window.innerWidth - margin * 2,
  }
}

function openDropdown() {
  if (props.disabled || isOpen.value)
    return
  isOpen.value = true
  setInitialActiveIndex()
}

function closeDropdown() {
  if (!isOpen.value)
    return
  isOpen.value = false
}

function toggleDropdown() {
  if (isOpen.value)
    closeDropdown()
  else
    openDropdown()
}

function selectOption(option: EiSelectOption) {
  if (option.disabled)
    return

  closeDropdown()
  triggerButtonRef.value?.focus()

  if (isSameValue(option.value, props.modelValue))
    return

  emit('update:modelValue', option.value)
  emit('commit', option.value)
}

function clearValue(event: MouseEvent) {
  event.stopPropagation()
  closeDropdown()
  emit('update:modelValue', '')
  emit('commit', '')
  triggerButtonRef.value?.focus()
}

function moveActive(direction: 1 | -1) {
  const start = activeIndex.value >= 0
    ? activeIndex.value + direction
    : direction > 0 ? 0 : props.options.length - 1
  activeIndex.value = findEnabledIndex(start, direction)
}

function onTriggerKeydown(event: KeyboardEvent) {
  if (props.disabled)
    return

  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!isOpen.value)
      openDropdown()
    else
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
    return
  }

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (!isOpen.value) {
      openDropdown()
      return
    }
    const option = props.options[activeIndex.value]
    if (option)
      selectOption(option)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeDropdown()
    triggerButtonRef.value?.focus()
  }
}

function onOptionMouseenter(index: number) {
  if (!props.options[index]?.disabled)
    activeIndex.value = index
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target as Node | null
  if (!target)
    return
  if (triggerRef.value?.contains(target) || panelRef.value?.contains(target))
    return
  closeDropdown()
}

watch(isOpen, (open) => {
  emit('openChange', open)
  if (open) {
    nextTick(() => {
      if (!isOpen.value)
        return
      calcPanelPos()
      document.addEventListener('pointerdown', onDocumentPointerDown, true)
      window.addEventListener('resize', calcPanelPos)
      window.addEventListener('scroll', calcPanelPos, true)
    })
  }
  else {
    document.removeEventListener('pointerdown', onDocumentPointerDown, true)
    window.removeEventListener('resize', calcPanelPos)
    window.removeEventListener('scroll', calcPanelPos, true)
  }
})

watch(
  () => props.options,
  () => {
    if (isOpen.value) {
      setInitialActiveIndex()
      nextTick(calcPanelPos)
    }
  },
  { deep: true },
)

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  window.removeEventListener('resize', calcPanelPos)
  window.removeEventListener('scroll', calcPanelPos, true)
})
</script>

<template>
  <div ref="triggerRef" class="ei-select-wrapper">
    <label v-if="label" class="ei-select__label" :for="triggerId">{{ label }}</label>
    <div
      class="ei-select"
      :class="{
        'ei-select--open': isOpen,
        'ei-select--disabled': disabled,
        'ei-select--placeholder': !hasValue,
      }"
    >
      <div
        :id="triggerId"
        ref="triggerButtonRef"
        class="ei-select__trigger"
        :class="{ 'ei-select__trigger--disabled': disabled }"
        role="combobox"
        :tabindex="disabled ? -1 : 0"
        :aria-expanded="isOpen"
        :aria-controls="listboxId"
        :aria-activedescendant="activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined"
        :aria-disabled="disabled"
        aria-haspopup="listbox"
        @click="toggleDropdown"
        @keydown="onTriggerKeydown"
      >
        <span class="ei-select__value" :title="displayValue">{{ displayValue || placeholder || '--' }}</span>
        <button
          v-if="canClear"
          type="button"
          class="ei-select__clear"
          aria-label="Clear selected value"
          @click="clearValue"
        >
          <IconClose :size="12" :stroke-width="1.7" />
        </button>
        <IconDown class="ei-select__arrow" :size="14" :stroke-width="1.7" />
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div
      v-if="isOpen"
      :id="listboxId"
      ref="panelRef"
      class="ei-select__dropdown"
      :style="panelStyle"
      role="listbox"
      :aria-labelledby="triggerId"
      @keydown="onTriggerKeydown"
    >
      <ul v-if="options.length > 0" class="ei-select__list">
        <li
          v-for="(opt, index) in options"
          :id="`${listboxId}-option-${index}`"
          :key="`${String(opt.value)}-${index}`"
          class="ei-select__option"
          :class="{
            'ei-select__option--active': index === activeIndex,
            'ei-select__option--selected': isSameValue(opt.value, modelValue),
            'ei-select__option--disabled': opt.disabled,
          }"
          role="option"
          :aria-selected="isSameValue(opt.value, modelValue)"
          :aria-disabled="opt.disabled"
          :title="opt.title ?? opt.label"
          @mouseenter="onOptionMouseenter(index)"
          @click="selectOption(opt)"
        >
          <span class="ei-select__option-label">{{ opt.label }}</span>
          <IconCheck
            v-if="isSameValue(opt.value, modelValue)"
            class="ei-select__check"
            :size="14"
            :stroke-width="1.8"
          />
        </li>
      </ul>
      <div v-else class="ei-select__empty">
        {{ emptyText }}
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.ei-select-wrapper {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ei-select {
  min-width: 0;
  width: 100%;

  &__label {
    font-size: 12px;
    color: var(--ei-text-secondary, #666);
  }

  &__trigger {
    display: flex;
    align-items: center;
    gap: 4px;
    width: 100%;
    min-width: 0;
    height: 27px;
    padding: 4px 6px 4px 8px;
    border: 1px solid var(--ei-border-color, #d0d0d0);
    border-radius: 4px;
    outline: none;
    background: var(--ei-input-bg, #fff);
    color: var(--ei-text, #333);
    box-sizing: border-box;
    cursor: pointer;
    font-size: 13px;
    line-height: 18px;
    text-align: left;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;

    &:not(.ei-select__trigger--disabled):hover {
      border-color: var(--ei-primary, #1890ff);
    }

    &:focus-visible {
      border-color: var(--ei-primary, #1890ff);
      box-shadow: 0 0 0 2px rgba(24, 144, 255, 0.16);
    }

    &--disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &--open &__trigger {
    border-color: var(--ei-primary, #1890ff);
  }

  &__value {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &--placeholder &__value {
    color: var(--ei-text-secondary, #999);
  }

  &__arrow {
    flex: 0 0 auto;
    color: var(--ei-text-secondary, #999);
    transition: transform 0.15s;
  }

  &--open &__arrow {
    transform: rotate(180deg);
  }

  &__clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: var(--ei-text-secondary, #999);
    cursor: pointer;

    &:hover {
      background: var(--ei-hover-bg, #f0f0f0);
      color: var(--ei-text, #333);
    }
  }

  &__dropdown {
    border: 1px solid var(--ei-border-color, #d0d0d0);
    border-radius: 4px;
    background: var(--ei-bg-elevated, var(--ei-panel-bg, #fff));
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    box-sizing: border-box;
    overflow: hidden;
  }

  &__list {
    max-height: var(--ei-select-max-height);
    margin: 0;
    padding: 4px;
    list-style: none;
    overflow-y: auto;
    box-sizing: border-box;
  }

  &__option {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 26px;
    padding: 4px 7px;
    border-radius: 3px;
    color: var(--ei-text, #333);
    cursor: pointer;
    font-size: 13px;
    line-height: 18px;
    box-sizing: border-box;
    user-select: none;

    &:hover,
    &--active {
      background: var(--ei-hover-bg, #f0f0f0);
    }

    &--selected {
      color: var(--ei-primary, #1890ff);
      font-weight: 500;
      background: var(--ei-selected-bg, #e6f7ff);
    }

    &--disabled {
      color: var(--ei-text-secondary, #999);
      cursor: not-allowed;
      opacity: 0.55;
      background: transparent;
    }
  }

  &__option-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__check {
    flex: 0 0 auto;
  }

  &__empty {
    padding: 10px 8px;
    color: var(--ei-text-secondary, #999);
    font-size: 12px;
    text-align: center;
  }
}
</style>
