<script setup lang="ts">
defineProps<{
  title: string
  detail?: string
  status: 'running' | 'done'
}>()
</script>

<template>
  <article class="assistant-card assistant-progress">
    <span class="assistant-progress__dot" :class="`assistant-progress__dot--${status}`" />
    <div>
      <strong>{{ title }}</strong>
      <p v-if="detail">
        {{ detail }}
      </p>
    </div>
  </article>
</template>
