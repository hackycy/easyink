import type { Extension } from '@codemirror/state'
import type { CodeEditorLanguage } from './code-editor-types'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { html } from '@codemirror/lang-html'
import { javascript } from '@codemirror/lang-javascript'
import { json } from '@codemirror/lang-json'
import { HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { drawSelection, EditorView, keymap, lineNumbers, placeholder, rectangularSelection } from '@codemirror/view'
import { tags } from '@lezer/highlight'

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
  { tag: tags.angleBracket, color: '#800000' },
  { tag: tags.tagName, color: '#800000' },
  { tag: tags.attributeName, color: '#ff0000' },
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
    minHeight: '100%',
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

export function createCodeEditorExtensions(options: {
  language?: CodeEditorLanguage
  placeholder?: string
  readonly?: boolean
  lineNumbers?: boolean
  onChange?: (value: string) => void
} = {}): Extension[] {
  return [
    options.lineNumbers === false ? [] : lineNumbers(),
    history(),
    drawSelection(),
    rectangularSelection(),
    indentOnInput(),
    createLanguageExtension(options.language),
    syntaxHighlighting(lightHighlight),
    placeholder(options.placeholder || ''),
    EditorView.editable.of(options.readonly !== true),
    EditorView.updateListener.of((update) => {
      if (update.docChanged)
        options.onChange?.(update.state.doc.toString())
    }),
    keymap.of([indentWithTab, ...defaultKeymap, ...historyKeymap]),
    lightTheme,
  ]
}

function createLanguageExtension(language: CodeEditorLanguage | undefined): Extension {
  if (language === 'html')
    return html()
  if (language === 'json')
    return json()
  return javascript()
}
