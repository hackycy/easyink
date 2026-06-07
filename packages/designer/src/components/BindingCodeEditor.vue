<script setup lang="ts">
import type { BindingCodeExample } from './binding-format-templates'
import { EiCodeMirrorEditor } from '@easyink/ui'
import { computed, ref } from 'vue'
import {
  DEFAULT_BINDING_CODE_EXAMPLE_KEYS,
  DEFAULT_BINDING_CODE_EXAMPLE_LABELS,
  DEFAULT_BINDING_CODE_EXAMPLE_SOURCES,
} from './binding-format-templates'

const props = defineProps<{
  modelValue?: string
  placeholder?: string
  examples?: BindingCodeExample[]
  t?: (key: string) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorValue = computed({
  get: () => props.modelValue ?? '',
  set: value => emit('update:modelValue', value),
})

const editorRef = ref<InstanceType<typeof EiCodeMirrorEditor> | null>(null)

const examples = computed<BindingCodeExample[]>(() => {
  if (props.examples?.length)
    return props.examples
  return DEFAULT_BINDING_CODE_EXAMPLE_SOURCES.map((code, i) => ({
    label: props.t ? props.t(DEFAULT_BINDING_CODE_EXAMPLE_KEYS[i]) : DEFAULT_BINDING_CODE_EXAMPLE_LABELS[i],
    code,
  }))
})

function applyExample(code: string) {
  if (editorValue.value === code)
    return
  editorValue.value = code
  editorRef.value?.focus()
}
</script>

<template>
  <div class="ei-bce">
    <div class="ei-bce__editor">
      <EiCodeMirrorEditor
        ref="editorRef"
        v-model="editorValue"
        language="javascript"
        :placeholder="placeholder"
      />
    </div>
    <div class="ei-bce__sidebar">
      <div class="ei-bce__sidebar-title">
        {{ props.t ? props.t('designer.bindingFormat.examples.title') : '示例' }}
      </div>
      <button
        v-for="(example, index) in examples"
        :key="index"
        type="button"
        class="ei-bce__example-btn"
        :title="example.hint || example.label"
        @click="applyExample(example.code)"
      >
        {{ example.label }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-bce {
  flex: 1;
  display: flex;
  flex-direction: row;
  overflow: hidden;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  border-radius: 4px;
  background: var(--ei-border-color, #d0d0d0);
  gap: 1px;

  &__editor {
    flex: 1;
    overflow: hidden;
    background: var(--ei-code-bg, #fbfbfb);
    border-radius: 3px 0 0 3px;

    :deep(.cm-editor) {
      height: 100%;
    }
  }

  &__sidebar {
    width: 114px;
    flex-shrink: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    background: var(--ei-code-bg, #fbfbfb);
    border-radius: 0 3px 3px 0;
  }

  &__sidebar-title {
    padding: 10px 12px 4px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.9px;
    text-transform: uppercase;
    color: var(--ei-text-secondary, #bbb);
    user-select: none;
  }

  &__example-btn {
    width: 100%;
    text-align: left;
    padding: 7px 12px;
    border: none;
    border-radius: 0;
    background: transparent;
    font-size: 12px;
    color: var(--ei-text, #444);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &:hover {
      background: color-mix(in srgb, var(--ei-primary, #1890ff) 8%, transparent);
      color: var(--ei-primary, #1890ff);
    }
  }
}
</style>
