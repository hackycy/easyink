<script setup lang="ts">
import { EiButton, EiTextarea } from '@easyink/ui'

defineProps<{
  prompt: string
  running?: boolean
}>()

defineEmits<{
  'update:prompt': [value: string]
  'submit': []
}>()
</script>

<template>
  <section class="assistant-section">
    <div class="assistant-section__head">
      <h3>任务</h3>
      <EiButton
        variant="primary"
        size="sm"
        :disabled="running || !prompt.trim()"
        @click="$emit('submit')"
      >
        生成
      </EiButton>
    </div>
    <EiTextarea
      :model-value="prompt"
      placeholder="例如：生成一张 80mm 商超购物小票"
      :rows="4"
      :disabled="running"
      @update:model-value="$emit('update:prompt', $event)"
    />
  </section>
</template>
