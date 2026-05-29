<script setup lang="ts">
defineProps<{ text: string }>()
</script>

<template>
  <article class="assistant-message assistant-message--user">
    <p>{{ text }}</p>
  </article>
</template>
