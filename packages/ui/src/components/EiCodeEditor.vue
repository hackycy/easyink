<script setup lang="ts">
import type { CodeEditorLanguage } from './code-editor-types'
import { computed, nextTick, ref, watch } from 'vue'
import EiCodeMirrorEditor from './EiCodeMirrorEditor.vue'
import EiDialog from './EiDialog.vue'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    language?: CodeEditorLanguage
    placeholder?: string
    disabled?: boolean
    label?: string
    rows?: number
    dialogTitle?: string
    cancelText?: string
    confirmText?: string
    dialogWidth?: string | number
    editorHeight?: string | number
  }>(),
  {
    language: 'javascript',
    rows: 4,
    dialogWidth: 760,
    editorHeight: 420,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'commit': [value: string]
}>()

const open = ref(false)
const draft = ref('')
const editorRef = ref<InstanceType<typeof EiCodeMirrorEditor> | null>(null)

const previewRows = computed(() => Math.max(1, props.rows))

const editorStyle = computed(() => ({
  height: typeof props.editorHeight === 'number' ? `${props.editorHeight}px` : props.editorHeight,
}))

function startEditing() {
  if (props.disabled)
    return

  draft.value = props.modelValue ?? ''
  open.value = true
  nextTick(() => editorRef.value?.focus())
}

function cancelEditing() {
  draft.value = props.modelValue ?? ''
}

function confirmEditing() {
  const nextValue = draft.value
  emit('update:modelValue', nextValue)
  if (nextValue !== (props.modelValue ?? ''))
    emit('commit', nextValue)
  open.value = false
}

watch(() => props.modelValue, (value) => {
  if (!open.value)
    draft.value = value ?? ''
})
</script>

<template>
  <div class="ei-code-editor">
    <label v-if="label" class="ei-code-editor__label">{{ label }}</label>
    <textarea
      class="ei-code-editor__preview"
      :class="{ 'ei-code-editor__preview--disabled': disabled }"
      :value="modelValue"
      :placeholder="placeholder"
      :rows="previewRows"
      readonly
      :disabled="disabled"
      @click="startEditing"
      @focus="startEditing"
    />

    <EiDialog
      v-model:open="open"
      class="ei-code-editor__dialog"
      :title="dialogTitle ?? label"
      :width="dialogWidth"
      :cancel-text="cancelText"
      :confirm-text="confirmText"
      :close-on-overlay="false"
      @cancel="cancelEditing"
      @close="cancelEditing"
      @confirm="confirmEditing"
    >
      <div class="ei-code-editor__surface" :style="editorStyle">
        <EiCodeMirrorEditor
          ref="editorRef"
          v-model="draft"
          :language="language"
          :placeholder="placeholder"
          autofocus
        />
      </div>
    </EiDialog>
  </div>
</template>

<style scoped lang="scss">
.ei-code-editor {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.ei-code-editor__label {
  font-size: 12px;
  color: var(--ei-text-secondary, #666);
}

.ei-code-editor__preview {
  padding: 4px 8px;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  font-size: 13px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  outline: none;
  background: var(--ei-input-bg, #fff);
  color: var(--ei-text, #333);
  min-width: 0;
  width: 100%;
  box-sizing: border-box;
  resize: none;
  line-height: 1.4;
  cursor: pointer;
}

.ei-code-editor__preview:focus {
  border-color: var(--ei-primary, #1890ff);
}

.ei-code-editor__preview--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.ei-code-editor__surface {
  min-height: 220px;
  overflow: hidden;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  background: var(--ei-code-bg, #fbfbfb);
}
</style>
