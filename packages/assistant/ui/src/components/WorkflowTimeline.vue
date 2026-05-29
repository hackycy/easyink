<script setup lang="ts">
import type { AssistantEventRecord } from '@easyink/assistant-store'

defineProps<{
  events: AssistantEventRecord[]
  activeStep?: string
}>()
</script>

<template>
  <section class="assistant-section assistant-timeline">
    <div class="assistant-section__head">
      <h3>流程</h3>
    </div>
    <ol>
      <li
        v-for="event in events"
        :key="event.id"
        :class="{ active: 'step' in event.event && event.event.step === activeStep }"
      >
        <span>{{ event.event.type }}</span>
      </li>
    </ol>
  </section>
</template>
