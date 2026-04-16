<script setup lang="ts">
import type { Component } from 'vue'
import type { PropSchema } from '../types'
import { EiBorderToggle, EiCheckbox, EiColorPicker, EiFontPicker, EiInput, EiNumberInput, EiSelect, EiSwitch, EiTextarea } from '@easyink/ui'
import { computed } from 'vue'

const props = defineProps<{
  schema: PropSchema
  value: unknown
  disabled?: boolean
  fonts?: Array<{ family: string, displayName: string }>
  t: (key: string) => string
  /** Custom editor component map: key = schema.editor value */
  customEditors?: Record<string, Component>
}>()

const emit = defineEmits<{
  preview: [key: string, value: unknown]
  change: [key: string, value: unknown]
}>()

const label = computed(() => props.t(props.schema.label))

const enumOptions = computed(() => {
  if (!props.schema.enum)
    return []
  return props.schema.enum.map(e => ({
    label: props.t(String(e.label)),
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

function resolveValue(val: unknown): unknown {
  let resolved = val
  if (props.schema.type === 'number') {
    if (resolved == null) {
      resolved = props.schema.default ?? 0
    }
    else {
      resolved = Number(val)
      if (Number.isNaN(resolved as number))
        return undefined
    }
  }
  return resolved
}

function onPreview(val: unknown) {
  const resolved = resolveValue(val)
  if (resolved === undefined)
    return
  emit('preview', props.schema.key, resolved)
}

function onCommit(val: unknown) {
  const resolved = resolveValue(val)
  if (resolved === undefined)
    return
  emit('change', props.schema.key, resolved)
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
        :disabled="disabled"
        :fonts="fonts"
        :t="t"
        @preview="(key: string, val: unknown) => emit('preview', key, val)"
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
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- number -->
      <EiNumberInput
        v-else-if="schema.type === 'number' || schema.type === 'unit'"
        :label="label"
        :model-value="(value as number | null) ?? null"
        :min="schema.min"
        :max="schema.max"
        :step="schema.step"
        :disabled="disabled"
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- boolean -->
      <EiCheckbox
        v-else-if="schema.type === 'boolean'"
        :label="label"
        :model-value="(value as boolean) ?? false"
        :disabled="disabled"
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- switch -->
      <EiSwitch
        v-else-if="schema.type === 'switch'"
        :label="label"
        :model-value="(value as boolean) ?? false"
        :disabled="disabled"
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- textarea -->
      <EiTextarea
        v-else-if="schema.type === 'textarea'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :disabled="disabled"
        :rows="(schema.editorOptions?.rows as number) ?? 3"
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- color -->
      <EiColorPicker
        v-else-if="schema.type === 'color'"
        :label="label"
        :model-value="(value as string) ?? '#000000'"
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- enum -->
      <EiSelect
        v-else-if="schema.type === 'enum'"
        :label="label"
        :model-value="(value as string | number) ?? ''"
        :options="enumOptions"
        :disabled="disabled"
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- font -->
      <EiFontPicker
        v-else-if="schema.type === 'font'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :fonts="fonts"
        :disabled="disabled"
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- border-toggle -->
      <EiBorderToggle
        v-else-if="schema.type === 'border-toggle'"
        :label="label"
        :model-value="(value as Record<string, boolean>) ?? undefined"
        :disabled="disabled"
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- rich-text: fallback to string input -->
      <EiInput
        v-else-if="schema.type === 'rich-text'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :disabled="disabled"
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- fallback -->
      <EiInput
        v-else
        :label="label"
        :model-value="String(value ?? '')"
        :disabled="disabled"
        @update:model-value="onPreview"
        @commit="onCommit"
      />
    </template>
  </div>
</template>

<style scoped>
.ei-prop-editor {
  width: 100%;
}
</style>
