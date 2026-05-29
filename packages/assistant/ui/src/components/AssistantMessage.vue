<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <article class="assistant-message assistant-message--assistant">
    <p>{{ text }}</p>
  </article>
</template>
