<script setup lang="ts">
defineProps<{ text: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <article class="assistant-card assistant-card--danger">
    <strong>处理失败</strong>
    <p>{{ text }}</p>
    <button type="button" @click="$emit('retry')">
      重试
    </button>
  </article>
</template>
