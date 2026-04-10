<script setup lang="ts">
import type { Component } from 'vue'
import type { PropSchema } from '../types'
import { EiButton, EiCheckbox, EiColorPicker, EiFontPicker, EiInput, EiSelect, EiSwitch, EiTextarea } from '@easyink/ui'
import { computed } from 'vue'

const props = defineProps<{
  schema: PropSchema
  value: unknown
  disabled?: boolean
  fonts?: Array<{ family: string, displayName: string }>
  t: (key: string) => string
  /** Inherited value displayed as placeholder when value is undefined */
  inheritedValue?: unknown
  /** Whether to show "clear override" button */
  canClearOverride?: boolean
  /** Custom editor component map: key = schema.editor value */
  customEditors?: Record<string, Component>
}>()

const emit = defineEmits<{
  change: [key: string, value: unknown]
  clearOverride: [key: string]
}>()

const label = computed(() => props.t(props.schema.label))

const enumOptions = computed(() => {
  if (!props.schema.enum)
    return []
  return props.schema.enum.map(e => ({
    label: String(e.label),
    value: e.value as string | number,
  }))
})

/** Resolve the custom editor component if schema.editor is set */
const customEditorComponent = computed<Component | undefined>(() => {
  const editorKey = props.schema.editor
  if (!editorKey || !props.customEditors)
    return undefined
  return props.customEditors[editorKey]
})

/** Whether to show inherited placeholder */
const showInheritedPlaceholder = computed(() =>
  props.value === undefined && props.inheritedValue !== undefined,
)

/** Whether to show the clear override button */
const showClearOverride = computed(() =>
  props.canClearOverride && props.value !== undefined,
)

function onUpdate(val: unknown) {
  let resolved = val
  if (props.schema.type === 'number') {
    resolved = Number(val)
    if (Number.isNaN(resolved as number))
      return
  }
  emit('change', props.schema.key, resolved)
}

function handleClearOverride() {
  emit('clearOverride', props.schema.key)
}
</script>

<template>
  <div class="ei-prop-editor">
    <!-- Custom editor component -->
    <template v-if="customEditorComponent">
      <component
        :is="customEditorComponent"
        :schema="schema"
        :value="value"
        :inherited-value="inheritedValue"
        :disabled="disabled"
        :fonts="fonts"
        :t="t"
        @change="(key: string, val: unknown) => emit('change', key, val)"
      />
    </template>

    <!-- string / image -->
    <template v-else>
      <EiInput
        v-if="schema.type === 'string' || schema.type === 'image'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :disabled="disabled"
        :placeholder="showInheritedPlaceholder ? String(inheritedValue) : undefined"
        @update:model-value="onUpdate"
      />

      <!-- number -->
      <EiInput
        v-else-if="schema.type === 'number' || schema.type === 'unit'"
        :label="label"
        type="number"
        :model-value="(value as number) ?? (showInheritedPlaceholder ? undefined : 0)"
        :disabled="disabled"
        :placeholder="showInheritedPlaceholder ? String(inheritedValue) : undefined"
        @update:model-value="onUpdate"
      />

      <!-- boolean -->
      <EiCheckbox
        v-else-if="schema.type === 'boolean'"
        :label="label"
        :model-value="(value as boolean) ?? false"
        :disabled="disabled"
        @update:model-value="onUpdate"
      />

      <!-- switch -->
      <EiSwitch
        v-else-if="schema.type === 'switch'"
        :label="label"
        :model-value="(value as boolean) ?? false"
        :disabled="disabled"
        @update:model-value="onUpdate"
      />

      <!-- textarea -->
      <EiTextarea
        v-else-if="schema.type === 'textarea'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :disabled="disabled"
        :rows="(schema.editorOptions?.rows as number) ?? 3"
        @update:model-value="onUpdate"
      />

      <!-- color -->
      <EiColorPicker
        v-else-if="schema.type === 'color'"
        :label="label"
        :model-value="(value as string) ?? '#000000'"
        @update:model-value="onUpdate"
      />

      <!-- enum -->
      <EiSelect
        v-else-if="schema.type === 'enum'"
        :label="label"
        :model-value="(value as string | number) ?? ''"
        :options="enumOptions"
        :disabled="disabled"
        @update:model-value="onUpdate"
      />

      <!-- font -->
      <EiFontPicker
        v-else-if="schema.type === 'font'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :fonts="fonts"
        :disabled="disabled"
        @update:model-value="onUpdate"
      />

      <!-- rich-text: fallback to string input -->
      <EiInput
        v-else-if="schema.type === 'rich-text'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :disabled="disabled"
        @update:model-value="onUpdate"
      />

      <!-- fallback -->
      <EiInput
        v-else
        :label="label"
        :model-value="String(value ?? '')"
        :disabled="disabled"
        @update:model-value="onUpdate"
      />
    </template>

    <!-- Clear override button -->
    <EiButton
      v-if="showClearOverride"
      size="sm"
      class="ei-prop-editor__clear"
      @click="handleClearOverride"
    >
      {{ t('designer.property.clearOverride') }}
    </EiButton>
  </div>
</template>

<style scoped>
.ei-prop-editor {
  width: 100%;
}

.ei-prop-editor__clear {
  margin-top: 2px;
  font-size: 11px;
}
</style>
