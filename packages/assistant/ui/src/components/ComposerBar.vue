<script setup lang="ts">
import type { AssistantSourceInput } from '@easyink/assistant-capabilities'
import type { AssistantTranslate } from '../i18n'
import { IconClose, IconDatabase, IconFileText, IconLoader, IconSend, IconWifi } from '@easyink/icons'
import { computed, ref } from 'vue'
import { translateAssistant } from '../i18n'
import { inferSourceFromText } from '../projection'

const props = defineProps<{
  running?: boolean
  placeholder?: string
  t?: AssistantTranslate
}>()

const emit = defineEmits<{
  submit: [payload: { prompt: string, source?: AssistantSourceInput }]
  cancel: []
}>()

const text = ref('')
const source = ref<AssistantSourceInput>()
const textarea = ref<HTMLTextAreaElement>()
const sourceLabel = computed(() => {
  if (!source.value)
    return ''
  if (source.value.kind === 'json')
    return tr('designer.assistant.source.json')
  if (source.value.kind === 'curl')
    return tr('designer.assistant.source.curl')
  if (source.value.kind === 'http')
    return tr('designer.assistant.source.http')
  return tr('designer.assistant.source.file')
})

function tr(key: string): string {
  return translateAssistant(key, props.t)
}

function submit() {
  const prompt = text.value.trim()
  if (!prompt || props.running)
    return
  emit('submit', { prompt, source: source.value })
  text.value = ''
  source.value = undefined
}

function onPaste(event: ClipboardEvent) {
  const pasted = event.clipboardData?.getData('text') ?? ''
  const inferred = inferSourceFromText(pasted)
  if (!inferred)
    return
  source.value = inferred
  event.preventDefault()
}

function reparseSource() {
  if (!source.value)
    return
  const raw = source.value.kind === 'http' ? source.value.url : source.value.content
  const reparsed = raw ? inferSourceFromText(raw) : undefined
  if (reparsed)
    source.value = reparsed
}

function focusForReplace() {
  textarea.value?.focus()
}

async function attachSourceFromClipboard() {
  if (props.running)
    return
  const clipboardText = await readClipboardText()
  const inferred = clipboardText ? inferSourceFromText(clipboardText) : undefined
  if (inferred) {
    source.value = inferred
    return
  }
  focusForReplace()
}

async function readClipboardText(): Promise<string | undefined> {
  try {
    return await navigator.clipboard?.readText()
  }
  catch {
    return undefined
  }
}

const sourceIcon = computed(() => {
  if (!source.value)
    return IconFileText
  if (source.value.kind === 'http' || source.value.kind === 'curl')
    return IconWifi
  if (source.value.kind === 'json')
    return IconDatabase
  return IconFileText
})
</script>

<template>
  <footer class="assistant-composer">
    <div class="assistant-composer__bar">
      <div v-if="source" class="assistant-composer__attachment">
        <component :is="sourceIcon" :size="15" stroke-width="1.8" />
        <span>{{ sourceLabel }}</span>
        <button type="button" :disabled="running" :title="tr('designer.assistant.action.reparseSource')" :aria-label="tr('designer.assistant.action.reparseSource')" @click="reparseSource">
          <IconLoader :size="13" stroke-width="1.9" />
        </button>
        <button type="button" :disabled="running" :title="tr('designer.assistant.action.removeSource')" :aria-label="tr('designer.assistant.action.removeSource')" @click="source = undefined">
          <IconClose :size="13" stroke-width="2" />
        </button>
      </div>
      <textarea
        ref="textarea"
        v-model="text"
        :placeholder="placeholder ?? tr('designer.assistant.placeholder.prompt')"
        :disabled="running"
        rows="2"
        @paste="onPaste"
        @keydown.enter.exact.prevent="submit"
      />
      <div class="assistant-composer__tools">
        <slot name="tools" />
        <button
          type="button"
          class="assistant-composer__icon-btn"
          :disabled="running"
          :title="tr('designer.assistant.action.attachSourceHint')"
          :aria-label="tr('designer.assistant.action.attachSourceHint')"
          @click="attachSourceFromClipboard"
        >
          <IconDatabase :size="16" stroke-width="1.8" />
        </button>
        <button
          v-if="running"
          type="button"
          class="assistant-composer__send assistant-composer__send--stop"
          :title="tr('designer.assistant.action.stop')"
          :aria-label="tr('designer.assistant.action.stop')"
          @click="$emit('cancel')"
        >
          <span />
        </button>
        <button
          v-else
          type="button"
          class="assistant-composer__send"
          :disabled="!text.trim()"
          :title="tr('designer.assistant.action.send')"
          :aria-label="tr('designer.assistant.action.send')"
          @click="submit"
        >
          <IconSend :size="16" stroke-width="2" />
        </button>
      </div>
    </div>
  </footer>
</template>
