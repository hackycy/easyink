<script setup lang="ts">
import type { AssistantSourceInput } from '@easyink/assistant-capabilities'
import { computed, ref } from 'vue'
import { inferSourceFromText } from '../projection'

const props = defineProps<{
  running?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  submit: [payload: { prompt: string, source?: AssistantSourceInput }]
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
</script>

<template>
  <footer class="assistant-composer">
    <div v-if="source" class="assistant-composer__attachment">
      <span>{{ sourceLabel }}</span>
      <div>
        <button type="button" :disabled="running" @click="focusForReplace">
          替换
        </button>
        <button type="button" :disabled="running" @click="reparseSource">
          重新解析
        </button>
        <button type="button" :disabled="running" @click="source = undefined">
          删除
        </button>
      </div>
    </div>
    <div class="assistant-composer__bar">
      <textarea
        ref="textarea"
        v-model="text"
        :placeholder="placeholder ?? '帮我生成一张 80mm 小票'"
        :disabled="running"
        rows="2"
        @paste="onPaste"
        @keydown.enter.exact.prevent="submit"
      />
      <button type="button" :disabled="running || !text.trim()" @click="submit">
        发送
      </button>
    </div>
  </footer>
</template>
