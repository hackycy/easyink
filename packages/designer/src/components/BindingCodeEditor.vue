<script setup lang="ts">
import type { BindingCodeExample } from './binding-format-templates'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { drawSelection, EditorView, keymap, lineNumbers, placeholder } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

const containerRef = ref<HTMLElement | null>(null)
let view: EditorView | null = null

const examples = computed<BindingCodeExample[]>(() => {
  if (props.examples?.length)
    return props.examples
  return DEFAULT_BINDING_CODE_EXAMPLE_SOURCES.map((code, i) => ({
    label: props.t ? props.t(DEFAULT_BINDING_CODE_EXAMPLE_KEYS[i]) : DEFAULT_BINDING_CODE_EXAMPLE_LABELS[i],
    code,
  }))
})

function applyExample(code: string) {
  if (!view)
    return
  const current = view.state.doc.toString()
  if (current === code)
    return
  view.dispatch({
    changes: { from: 0, to: current.length, insert: code },
  })
}
const lightHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#0000ff', fontWeight: '600' },
  { tag: tags.operatorKeyword, color: '#0000ff' },
  { tag: tags.string, color: '#a31515' },
  { tag: tags.number, color: '#098658' },
  { tag: tags.bool, color: '#0000ff' },
  { tag: tags.null, color: '#0000ff' },
  { tag: tags.comment, color: '#6a9955', fontStyle: 'italic' },
  { tag: tags.function(tags.variableName), color: '#795e26' },
  { tag: tags.definition(tags.variableName), color: '#001080' },
  { tag: tags.variableName, color: '#001080' },
  { tag: tags.propertyName, color: '#001080' },
  { tag: tags.typeName, color: '#267f99' },
  { tag: tags.regexp, color: '#811f3f' },
])

const lightTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '13px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
    background: 'var(--ei-code-bg, #fbfbfb)',
  },
  '.cm-scroller': {
    overflow: 'auto',
    height: '100%',
    lineHeight: '1.5',
    fontFamily: 'inherit',
  },
  '.cm-content': {
    padding: '8px 0',
    caretColor: 'var(--ei-text, #333)',
    color: 'var(--ei-text, #333)',
  },
  '.cm-line': {
    padding: '0 12px',
  },
  '.cm-cursor': {
    borderLeftColor: 'var(--ei-text, #333)',
  },
  '&.cm-focused': {
    outline: '2px solid var(--ei-primary, #4a90e2)',
    outlineOffset: '-1px',
  },
  '.cm-gutters': {
    background: 'var(--ei-code-bg, #fbfbfb)',
    borderRight: '1px solid var(--ei-border-color, #e0e0e0)',
    color: '#aaa',
    minWidth: '30px',
    position: 'sticky',
    left: '0',
    zIndex: '1',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 8px 0 4px',
    minWidth: '20px',
    textAlign: 'right',
  },
  '.cm-selectionBackground': {
    background: '#add6ff',
  },
  '&.cm-focused .cm-selectionBackground': {
    background: '#add6ff',
  },
  '.cm-placeholder': {
    color: 'var(--ei-text-secondary, #999)',
  },
}, { dark: false })

function createExtensions() {
  return [
    lineNumbers(),
    history(),
    drawSelection(),
    indentOnInput(),
    javascript(),
    syntaxHighlighting(lightHighlight),
    placeholder(props.placeholder || ''),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
    lightTheme,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString())
      }
    }),
  ]
}

onMounted(() => {
  if (!containerRef.value)
    return
  const state = EditorState.create({
    doc: props.modelValue || '',
    extensions: createExtensions(),
  })
  view = new EditorView({
    state,
    parent: containerRef.value,
  })
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
})

watch(() => props.modelValue, (newValue) => {
  if (!view)
    return
  const current = view.state.doc.toString()
  if ((newValue ?? '') !== current) {
    view.dispatch({
      changes: { from: 0, to: current.length, insert: newValue || '' },
    })
  }
})
</script>

<template>
  <div class="ei-bce">
    <div ref="containerRef" class="ei-bce__editor" />
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
