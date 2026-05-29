<script setup lang="ts">
defineProps<{ status?: string }>()
</script>

<template>
  <header class="assistant-conversation-header">
    <div>
      <h2>EasyInk Assistant</h2>
      <p>描述你要的票据、标签或表单，确认后再应用到设计器。</p>
    </div>
    <span v-if="status">{{ status }}</span>
  </header>
</template>
