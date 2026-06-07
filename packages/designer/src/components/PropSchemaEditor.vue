<script setup lang="ts">
import type { CodeEditorLanguage } from '@easyink/ui'
import type { Component } from 'vue'
import type { DesignerAssetPickRequest, DesignerResolvedAsset, PropSchema } from '../types'
import { EiBorderToggle, EiCheckbox, EiCodeEditor, EiColorPicker, EiFontPicker, EiInput, EiNumberInput, EiSelect, EiSwitch, EiTextarea } from '@easyink/ui'
import { computed } from 'vue'
import ImageSourceEditor from './ImageSourceEditor.vue'

const props = defineProps<{
  schema: PropSchema
  value: unknown
  disabled?: boolean
  fonts?: Array<{ family: string, displayName: string }>
  fontStatuses?: Record<string, 'unloaded' | 'loading' | 'loaded' | 'error'>
  t: (key: string) => string
  /** Custom editor component map: key = schema.editor value */
  customEditors?: Record<string, Component>
  imagePickRequest?: DesignerAssetPickRequest
}>()

const emit = defineEmits<{
  preview: [key: string, value: unknown]
  change: [key: string, value: unknown]
  imagePick: [key: string, result: DesignerResolvedAsset]
  loadFont: [family: string]
}>()

const label = computed(() => props.t(props.schema.label))

const placeholder = computed(() => {
  const value = props.schema.editorOptions?.placeholder
  if (typeof value !== 'string')
    return undefined
  return value.startsWith('designer.') ? props.t(value) : value
})

const isNumberLike = computed(() => props.schema.type === 'number' || props.schema.type === 'unit')

const isNullableNumber = computed(() => {
  return isNumberLike.value && (props.schema.nullable === true || props.schema.editorOptions?.nullable === true)
})

const enumOptions = computed(() => {
  if (!props.schema.enum)
    return []
  return props.schema.enum.map(e => ({
    label: props.t(String(e.label)),
    value: e.value as string | number,
  }))
})

function readEditorOptionString(key: string): string | undefined {
  const value = props.schema.editorOptions?.[key]
  return typeof value === 'string' ? value : undefined
}

function readEditorOptionNumber(key: string): number | undefined {
  const value = props.schema.editorOptions?.[key]
  return typeof value === 'number' ? value : undefined
}

const codeLanguage = computed<CodeEditorLanguage>(() => {
  const language = props.schema.editorOptions?.language
  if (language === 'html' || language === 'javascript' || language === 'json')
    return language
  return 'javascript'
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
  if (isNumberLike.value) {
    if (resolved == null) {
      resolved = isNullableNumber.value ? null : props.schema.default ?? 0
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

function onImagePicked(result: DesignerResolvedAsset) {
  emit('imagePick', props.schema.key, result)
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
        :font-statuses="fontStatuses"
        :t="t"
        @preview="(key: string, val: unknown) => emit('preview', key, val)"
        @change="(key: string, val: unknown) => emit('change', key, val)"
      />
    </template>

    <!-- string / image -->
    <template v-else>
      <ImageSourceEditor
        v-if="schema.type === 'image'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :placeholder="placeholder"
        :disabled="disabled"
        :pick-request="imagePickRequest ?? {
          id: 'designer.imageMaterial.pickImage',
          source: 'image-material',
          currentUrl: (value as string) ?? '',
          accept: ['image/*'],
          payload: { propKey: schema.key },
        }"
        :pick-title-key="readEditorOptionString('pickTitle')"
        :clear-title-key="readEditorOptionString('clearTitle')"
        :preview-title-key="readEditorOptionString('previewTitle')"
        :preview-loading-title-key="readEditorOptionString('previewLoadingTitle')"
        :preview-failed-title-key="readEditorOptionString('previewFailedTitle')"
        :t="t"
        @update:model-value="onPreview"
        @commit="onCommit"
        @pick="onImagePicked"
      />

      <EiInput
        v-else-if="schema.type === 'string'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :placeholder="placeholder"
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
        :nullable="isNullableNumber"
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
        :placeholder="placeholder"
        :rows="(schema.editorOptions?.rows as number) ?? 3"
        @update:model-value="onPreview"
        @commit="onCommit"
      />

      <!-- code -->
      <EiCodeEditor
        v-else-if="schema.type === 'code'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :disabled="disabled"
        :placeholder="placeholder"
        :language="codeLanguage"
        :rows="readEditorOptionNumber('rows') ?? 4"
        :dialog-title="readEditorOptionString('dialogTitle') ? t(readEditorOptionString('dialogTitle') as string) : label"
        :dialog-width="readEditorOptionNumber('dialogWidth') ?? 760"
        :editor-height="readEditorOptionNumber('editorHeight') ?? 420"
        :cancel-text="t('designer.dialog.cancel')"
        :confirm-text="t('designer.dialog.confirm')"
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
        :font-statuses="fontStatuses"
        :default-label="t('designer.property.default')"
        :load-label="t('designer.property.loadFont')"
        :disabled="disabled"
        @update:model-value="onPreview"
        @commit="onCommit"
        @load="(family: string) => emit('loadFont', family)"
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

<style scoped lang="scss">
.ei-prop-editor {
  width: 100%;
}
</style>
