<script setup lang="ts">
import type { PagePropertyContext, PagePropertyDescriptor } from '../page-properties'
import { EiCheckbox, EiColorPicker, EiFontPicker, EiInput, EiSelect } from '@easyink/ui'
import { computed } from 'vue'

const props = defineProps<{
  descriptor: PagePropertyDescriptor
  value: unknown
  fonts?: Array<{ family: string, displayName: string }>
  t: (key: string) => string
}>()

const emit = defineEmits<{
  change: [descriptor: PagePropertyDescriptor, value: unknown]
}>()

const label = computed(() => props.t(props.descriptor.label))

const enumOptions = computed(() => {
  if (!props.descriptor.enum)
    return []
  return props.descriptor.enum.map(e => ({
    label: props.t(e.label),
    value: e.value,
  }))
})

function onUpdate(val: unknown) {
  let resolved = val
  if (props.descriptor.editor === 'number') {
    resolved = Number(val)
    if (Number.isNaN(resolved as number))
      return
  }
  emit('change', props.descriptor, resolved)
}
</script>

<template>
  <div class="ei-page-prop-editor">
    <!-- readonly -->
    <EiInput
      v-if="descriptor.editor === 'readonly'"
      :label="label"
      :model-value="String(value ?? '')"
      disabled
    />

    <!-- number -->
    <EiInput
      v-else-if="descriptor.editor === 'number'"
      :label="label"
      type="number"
      :model-value="(value as number) ?? 0"
      @update:model-value="onUpdate"
    />

    <!-- select -->
    <EiSelect
      v-else-if="descriptor.editor === 'select'"
      :label="label"
      :model-value="(value as string | number) ?? ''"
      :options="enumOptions"
      @update:model-value="onUpdate"
    />

    <!-- switch -->
    <EiCheckbox
      v-else-if="descriptor.editor === 'switch'"
      :label="label"
      :model-value="(value as boolean) ?? false"
      @update:model-value="onUpdate"
    />

    <!-- color -->
    <EiColorPicker
      v-else-if="descriptor.editor === 'color'"
      :label="label"
      :model-value="(value as string) ?? ''"
      @update:model-value="onUpdate"
    />

    <!-- asset (image url input) -->
    <EiInput
      v-else-if="descriptor.editor === 'asset'"
      :label="label"
      :model-value="(value as string) ?? ''"
      @update:model-value="onUpdate"
    />

    <!-- font -->
    <EiFontPicker
      v-else-if="descriptor.editor === 'font'"
      :label="label"
      :model-value="(value as string) ?? ''"
      :fonts="fonts"
      @update:model-value="onUpdate"
    />
  </div>
</template>

<style scoped>
.ei-page-prop-editor {
  width: 100%;
}
</style>
