<script setup lang="ts">
import type { CodeEditorLanguage } from './code-editor-types'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { createCodeEditorExtensions } from './code-editor-utils'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    language?: CodeEditorLanguage
    placeholder?: string
    readonly?: boolean
    lineNumbers?: boolean
    autofocus?: boolean
  }>(),
  {
    language: 'javascript',
    lineNumbers: true,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const containerRef = ref<HTMLElement | null>(null)
const editorKey = computed(() => `${props.language}:${props.placeholder ?? ''}:${props.readonly === true}:${props.lineNumbers !== false}`)

let view: EditorView | null = null

function createView() {
  if (!containerRef.value)
    return

  view?.destroy()
  const state = EditorState.create({
    doc: props.modelValue || '',
    extensions: createCodeEditorExtensions({
      language: props.language,
      placeholder: props.placeholder,
      readonly: props.readonly,
      lineNumbers: props.lineNumbers,
      onChange(value) {
        emit('update:modelValue', value)
      },
    }),
  })
  view = new EditorView({
    state,
    parent: containerRef.value,
  })

  if (props.autofocus) {
    nextTick(() => view?.focus())
  }
}

function replaceDocument(value: string) {
  if (!view)
    return
  const current = view.state.doc.toString()
  if (value === current)
    return
  view.dispatch({
    changes: { from: 0, to: current.length, insert: value },
  })
}

defineExpose({
  focus() {
    view?.focus()
  },
})

onMounted(createView)

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

watch(editorKey, () => {
  createView()
})

watch(() => props.modelValue, (newValue) => {
  replaceDocument(newValue ?? '')
})
</script>

<template>
  <div ref="containerRef" class="ei-code-mirror-editor" />
</template>

<style scoped lang="scss">
.ei-code-mirror-editor {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--ei-code-bg, #fbfbfb);

  :deep(.cm-editor) {
    height: 100%;
  }
}
</style>
