<script setup lang="ts">
import type { AssistantSourceInput } from '@easyink/assistant-capabilities'
import { IconClose, IconDatabase, IconFileText, IconLoader, IconSend, IconWifi } from '@easyink/icons'
import { computed, ref } from 'vue'
import { inferSourceFromText } from '../projection'

const props = defineProps<{
  running?: boolean
  placeholder?: string
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
    return 'JSON 数据源'
  if (source.value.kind === 'curl')
    return 'curl 接口'
  if (source.value.kind === 'http')
    return 'HTTP 接口'
  return '文件数据源'
})

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
        <button type="button" :disabled="running" title="重新解析数据源" aria-label="重新解析数据源" @click="reparseSource">
          <IconLoader :size="13" stroke-width="1.9" />
        </button>
        <button type="button" :disabled="running" title="删除数据源" aria-label="删除数据源" @click="source = undefined">
          <IconClose :size="13" stroke-width="2" />
        </button>
      </div>
      <textarea
        ref="textarea"
        v-model="text"
        :placeholder="placeholder ?? '帮我生成一张 80mm 小票'"
        :disabled="running"
        rows="2"
        @paste="onPaste"
        @keydown.enter.exact.prevent="submit"
      />
      <div class="assistant-composer__tools">
        <button
          type="button"
          class="assistant-composer__icon-btn"
          :disabled="running"
          title="粘贴 JSON、URL 或 curl 可自动识别数据源"
          aria-label="粘贴 JSON、URL 或 curl 可自动识别数据源"
          @click="focusForReplace"
        >
          <IconDatabase :size="16" stroke-width="1.8" />
        </button>
        <button
          v-if="running"
          type="button"
          class="assistant-composer__send assistant-composer__send--stop"
          title="停止生成"
          aria-label="停止生成"
          @click="$emit('cancel')"
        >
          <span />
        </button>
        <button
          v-else
          type="button"
          class="assistant-composer__send"
          :disabled="!text.trim()"
          title="发送"
          aria-label="发送"
          @click="submit"
        >
          <IconSend :size="16" stroke-width="2" />
        </button>
      </div>
    </div>
  </footer>
</template>
