<script setup lang="ts">
defineProps<{
  kind: 'none' | 'json' | 'http' | 'curl' | 'file'
  content: string
  running?: boolean
}>()

defineEmits<{
  'update:kind': ['none' | 'json' | 'http' | 'curl' | 'file']
  'update:content': [value: string]
}>()
</script>

<template>
  <section class="assistant-section">
    <div class="assistant-section__head">
      <h3>数据源</h3>
      <div class="assistant-segmented">
        <button
          v-for="item in ['none', 'json', 'http', 'curl', 'file']"
          :key="item"
          :class="{ active: kind === item }"
          :disabled="running"
          type="button"
          @click="$emit('update:kind', item as 'none' | 'json' | 'http' | 'curl' | 'file')"
        >
          {{ item }}
        </button>
      </div>
    </div>
    <textarea
      v-if="kind !== 'none'"
      class="assistant-code-input"
      :value="content"
      :placeholder="kind === 'http' ? 'https://api.example.com/sample.json' : '粘贴 JSON / curl / 文件内容'"
      :disabled="running"
      @input="$emit('update:content', ($event.target as HTMLTextAreaElement).value)"
    />
  </section>
</template>
