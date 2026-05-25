<script setup lang="ts">
import type { PagePropertyDescriptor } from '../page-properties'
import type { DesignerResolvedAsset } from '../types'
import { EiColorPicker, EiFontPicker, EiInput, EiNumberInput, EiNumberSlider, EiSelect, EiSwitch } from '@easyink/ui'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'
import ImageSourceEditor from './ImageSourceEditor.vue'

const props = defineProps<{
  descriptor: PagePropertyDescriptor
  value: unknown
  fonts?: Array<{ family: string, displayName: string }>
  fontStatuses?: Record<string, 'unloaded' | 'loading' | 'loaded' | 'error'>
  t: (key: string) => string
}>()

const emit = defineEmits<{
  preview: [descriptor: PagePropertyDescriptor, value: unknown]
  change: [descriptor: PagePropertyDescriptor, value: unknown]
  loadFont: [family: string]
}>()

const store = useDesignerStore()

const label = computed(() => props.t(props.descriptor.label))

const enumOptions = computed(() => {
  if (!props.descriptor.enum)
    return []
  return props.descriptor.enum.map(e => ({
    label: props.t(e.label),
    value: e.value,
  }))
})

function onPreview(val: unknown) {
  emit('preview', props.descriptor, val)
}

function onCommit(val: unknown) {
  emit('change', props.descriptor, val)
}

function onImagePicked(result: DesignerResolvedAsset) {
  onCommit(result.url)
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
    <EiNumberInput
      v-else-if="descriptor.editor === 'number'"
      :label="label"
      :model-value="(value as number | null) ?? null"
      :min="descriptor.min"
      :max="descriptor.max"
      :step="descriptor.step"
      :nullable="descriptor.nullable ?? false"
      @update:model-value="onPreview"
      @commit="onCommit"
    />

    <!-- number slider -->
    <EiNumberSlider
      v-else-if="descriptor.editor === 'number-slider'"
      :label="label"
      :model-value="(value as number | null) ?? null"
      :min="descriptor.min"
      :max="descriptor.max"
      :step="descriptor.step"
      :nullable="descriptor.nullable ?? false"
      @update:model-value="onPreview"
      @commit="onCommit"
    />

    <!-- select -->
    <EiSelect
      v-else-if="descriptor.editor === 'select'"
      :label="label"
      :model-value="(value as string | number) ?? ''"
      :options="enumOptions"
      @update:model-value="onPreview"
      @commit="onCommit"
    />

    <!-- switch -->
    <EiSwitch
      v-else-if="descriptor.editor === 'switch'"
      :label="label"
      :model-value="(value as boolean) ?? false"
      @update:model-value="onPreview"
      @commit="onCommit"
    />

    <!-- color -->
    <EiColorPicker
      v-else-if="descriptor.editor === 'color'"
      :label="label"
      :model-value="(value as string) ?? ''"
      @update:model-value="onPreview"
      @commit="onCommit"
    />

    <!-- asset (image source) -->
    <ImageSourceEditor
      v-else-if="descriptor.editor === 'asset'"
      :label="label"
      :model-value="(value as string) ?? ''"
      :pick-request="{
        id: 'designer.pageBackground.pickImage',
        source: 'page-background',
        title: label,
        currentUrl: (value as string) ?? '',
        accept: ['image/*'],
        payload: { page: store.schema.page },
      }"
      :t="t"
      @update:model-value="onPreview"
      @commit="onCommit"
      @pick="onImagePicked"
    />

    <!-- font -->
    <EiFontPicker
      v-else-if="descriptor.editor === 'font'"
      :label="label"
      :model-value="(value as string) ?? ''"
      :fonts="fonts"
      :font-statuses="fontStatuses"
      :default-label="t('designer.property.default')"
      :load-label="t('designer.property.loadFont')"
      @update:model-value="onPreview"
      @commit="onCommit"
      @load="(family: string) => emit('loadFont', family)"
    />
  </div>
</template>

<style scoped lang="scss">
.ei-page-prop-editor {
  width: 100%;
}
</style>
