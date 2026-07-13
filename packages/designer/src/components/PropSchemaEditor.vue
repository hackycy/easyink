<script setup lang="ts">
import type { AssetUrlPropertyValueInput, PropertyValueInput, TextFilePropertyValueInput } from '@easyink/core'
import type { CodeEditorLanguage } from '@easyink/ui'
import type { DesignerResolvedAsset, PropSchema } from '../types'
import { IconImport, IconLoader } from '@easyink/icons'
import { EiBorderToggle, EiCheckbox, EiCodeEditor, EiColorPicker, EiFontPicker, EiIcon, EiInput, EiNumberInput, EiSelect, EiSwitch, EiTextarea } from '@easyink/ui'
import { computed, nextTick, ref } from 'vue'
import { useDesignerStore } from '../composables'
import ImageSourceEditor from './ImageSourceEditor.vue'

const props = defineProps<{
  schema: PropSchema
  value: unknown
  disabled?: boolean
  mixed?: boolean
  fonts?: Array<{ family: string, displayName: string }>
  fontStatuses?: Record<string, 'unloaded' | 'loading' | 'loaded' | 'error'>
  t: (key: string) => string
}>()

const emit = defineEmits<{
  preview: [key: string, value: unknown]
  change: [key: string, value: unknown]
  imagePick: [key: string, result: DesignerResolvedAsset]
  loadFont: [family: string]
}>()

const store = useDesignerStore()
const textFileImportPending = ref(false)
const textFileImportButtonRef = ref<HTMLElement | null>(null)

const label = computed(() => props.t(props.schema.label))

const placeholder = computed(() => {
  const value = props.schema.editorOptions?.placeholder
  if (typeof value !== 'string')
    return undefined
  return value.startsWith('designer.') ? props.t(value) : value
})

const isNumberLike = computed(() => props.schema.type === 'number' || props.schema.type === 'unit')
const stringMinLength = computed(() => normalizeStringLengthLimit(props.schema.min))
const stringMaxLength = computed(() => normalizeStringLengthLimit(props.schema.max))

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

const valueInput = computed(() => normalizePropertyValueInput(props.schema.editorOptions?.valueInput))
const assetValueInput = computed(() => valueInput.value?.kind === 'asset-url' ? valueInput.value : null)
const textFileValueInput = computed(() => valueInput.value?.kind === 'text-file' ? valueInput.value : null)
const supportsTextFileImport = computed(() => props.schema.type === 'code' || props.schema.type === 'textarea')
const canImportTextFile = computed(() => supportsTextFileImport.value && textFileValueInput.value !== null)
const textFileImportTitle = computed(() => props.t(textFileValueInput.value?.pickTitle ?? 'designer.action.importFile'))

/** Resolve the custom editor component if schema.editor is set */
const customEditorComponent = computed(() => {
  const editorKey = props.schema.editor
  if (!editorKey)
    return undefined
  return store.propertyEditorRegistry.get(editorKey)
})
const unknownCustomEditor = computed(() => Boolean(props.schema.editor && !customEditorComponent.value))

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
  else if (props.schema.type === 'string') {
    resolved = constrainStringValue(String(resolved ?? ''))
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

async function importTextFile() {
  const input = textFileValueInput.value
  if (!input || props.disabled || textFileImportPending.value || !store.textFilePickerAvailable)
    return

  textFileImportPending.value = true
  try {
    const result = await store.interactions.pickFileText({
      id: input.id,
      source: input.source,
      title: resolveText(input.title),
      accept: input.accept,
      encoding: input.encoding,
      maxBytes: input.maxBytes,
      payload: {
        propKey: props.schema.key,
        propType: props.schema.type,
        ...input.payload,
      },
    })
    if (!result)
      return

    emit('preview', props.schema.key, result.text)
    emit('change', props.schema.key, result.text)
  }
  catch (error) {
    store.diagnostics.push({
      source: 'designer-interaction',
      severity: 'error',
      message: text('designer.diagnostic.textFilePickerFailed', 'Text file picker failed.'),
      detail: {
        requestId: input.id,
        propKey: props.schema.key,
        error: error instanceof Error ? error.message : String(error),
      },
    })
  }
  finally {
    textFileImportPending.value = false
    await nextTick()
    textFileImportButtonRef.value?.focus()
  }
}

function text(key: string, fallback: string): string {
  const value = props.t(key)
  return value === key ? fallback : value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readRecordString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

function readRecordNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readRecordStringArray(record: Record<string, unknown>, key: string): string[] | undefined {
  const value = record[key]
  if (!Array.isArray(value))
    return undefined
  const strings = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  return strings.length > 0 ? strings : undefined
}

function readRecordObject(record: Record<string, unknown>, key: string): Record<string, unknown> | undefined {
  const value = record[key]
  return isRecord(value) ? value : undefined
}

function normalizePropertyValueInput(value: unknown): PropertyValueInput | null {
  if (!isRecord(value))
    return null

  const kind = value.kind
  if (kind !== 'asset-url' && kind !== 'text-file')
    return null

  const id = readRecordString(value, 'id')
  const source = readRecordString(value, 'source')
  if (!id || !source)
    return null

  const base = {
    id,
    source,
    title: readRecordString(value, 'title'),
    pickTitle: readRecordString(value, 'pickTitle'),
    accept: readRecordStringArray(value, 'accept'),
    payload: readRecordObject(value, 'payload'),
  }

  if (kind === 'asset-url') {
    return {
      kind,
      ...base,
      clearTitle: readRecordString(value, 'clearTitle'),
      previewTitle: readRecordString(value, 'previewTitle'),
      previewLoadingTitle: readRecordString(value, 'previewLoadingTitle'),
      previewFailedTitle: readRecordString(value, 'previewFailedTitle'),
    } satisfies AssetUrlPropertyValueInput
  }

  return {
    kind,
    ...base,
    encoding: readRecordString(value, 'encoding'),
    maxBytes: readRecordNumber(value, 'maxBytes'),
  } satisfies TextFilePropertyValueInput
}

function createAssetPickRequest(input: AssetUrlPropertyValueInput | null, currentUrl: string) {
  const selectedId = store.selection.ids.length === 1 ? store.selection.ids[0] : undefined
  const selectedNode = selectedId ? store.getElementById(selectedId) : undefined
  return {
    id: input?.id ?? 'designer.propSchema.pickAsset',
    source: input?.source ?? 'prop-schema',
    title: resolveText(input?.title) ?? label.value,
    currentUrl,
    accept: input?.accept ?? ['image/*'],
    payload: {
      nodeId: selectedNode?.id,
      nodeType: selectedNode?.type,
      propKey: props.schema.key,
      propType: props.schema.type,
      ...input?.payload,
    },
  }
}

function resolveText(key: string | undefined): string | undefined {
  if (!key)
    return undefined
  const value = props.t(key)
  return value === key ? key : value
}

function normalizeStringLengthLimit(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : undefined
}

function constrainStringValue(value: string): string {
  const max = stringMaxLength.value
  if (max === undefined)
    return value
  const chars = Array.from(value)
  return chars.length > max ? chars.slice(0, max).join('') : value
}
</script>

<template>
  <div class="ei-prop-editor" :data-value-state="mixed ? 'mixed' : undefined">
    <span v-if="mixed" class="ei-prop-editor__value-state">{{ t('designer.property.mixed') }}</span>
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

    <div v-else-if="unknownCustomEditor" class="ei-prop-editor__diagnostic" role="status">
      {{ label }}: PROPERTY_EDITOR_NOT_FOUND ({{ schema.editor }})
    </div>

    <!-- string / image -->
    <template v-else>
      <ImageSourceEditor
        v-if="schema.type === 'image'"
        :label="label"
        :model-value="(value as string) ?? ''"
        :placeholder="placeholder"
        :disabled="disabled"
        :pick-request="createAssetPickRequest(assetValueInput, (value as string) ?? '')"
        :pick-title-key="assetValueInput?.pickTitle"
        :clear-title-key="assetValueInput?.clearTitle"
        :preview-title-key="assetValueInput?.previewTitle"
        :preview-loading-title-key="assetValueInput?.previewLoadingTitle"
        :preview-failed-title-key="assetValueInput?.previewFailedTitle"
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
        :min-length="stringMinLength"
        :max-length="stringMaxLength"
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
      <template v-else-if="schema.type === 'textarea'">
        <div v-if="canImportTextFile" class="ei-prop-editor__header">
          <label class="ei-prop-editor__label">{{ label }}</label>
          <button
            ref="textFileImportButtonRef"
            class="ei-prop-editor__icon-button"
            type="button"
            :title="textFileImportTitle"
            :aria-label="textFileImportTitle"
            :disabled="disabled || textFileImportPending || !store.textFilePickerAvailable"
            @pointerdown.stop
            @click.stop="importTextFile"
          >
            <EiIcon :icon="textFileImportPending ? IconLoader : IconImport" :size="15" />
          </button>
        </div>
        <EiTextarea
          :label="canImportTextFile ? undefined : label"
          :model-value="(value as string) ?? ''"
          :disabled="disabled"
          :placeholder="placeholder"
          :rows="(schema.editorOptions?.rows as number) ?? 3"
          @update:model-value="onPreview"
          @commit="onCommit"
        />
      </template>

      <!-- code -->
      <template v-else-if="schema.type === 'code'">
        <div v-if="canImportTextFile" class="ei-prop-editor__header">
          <label class="ei-prop-editor__label">{{ label }}</label>
          <button
            ref="textFileImportButtonRef"
            class="ei-prop-editor__icon-button"
            type="button"
            :title="textFileImportTitle"
            :aria-label="textFileImportTitle"
            :disabled="disabled || textFileImportPending || !store.textFilePickerAvailable"
            @pointerdown.stop
            @click.stop="importTextFile"
          >
            <EiIcon :icon="textFileImportPending ? IconLoader : IconImport" :size="15" />
          </button>
        </div>
        <EiCodeEditor
          :label="canImportTextFile ? undefined : label"
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
      </template>

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

  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-width: 0;
    margin-bottom: 2px;
  }

  &__label {
    min-width: 0;
    color: var(--ei-text-secondary, #666);
    font-size: 12px;
  }

  &__icon-button {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--ei-border-color, #d0d0d0);
    border-radius: 4px;
    background: var(--ei-button-bg, #fff);
    color: var(--ei-text-secondary, #666);
    cursor: pointer;
  }

  &__icon-button:hover:not(:disabled) {
    border-color: var(--ei-primary, #1890ff);
    color: var(--ei-primary, #1890ff);
  }

  &__icon-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
