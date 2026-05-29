<script setup lang="ts">
import type { AssistantResult } from '@easyink/assistant-capabilities'
import { AssistantWorkbench } from '@easyink/assistant-ui'
import '@easyink/assistant-ui/index.css'

defineProps<{
  open: boolean
  endpoint?: string
}>()

defineEmits<{
  'update:open': [value: boolean]
  'apply': [result: AssistantResult]
}>()
</script>

<template>
  <div v-if="open" class="easyink-assistant-panel">
    <div class="easyink-assistant-panel__scrim" @click="$emit('update:open', false)" />
    <AssistantWorkbench
      class="easyink-assistant-panel__workbench"
      :endpoint="endpoint"
      @apply="$emit('apply', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
.easyink-assistant-panel {
  position: fixed;
  inset: 0;
  z-index: 1000;
  pointer-events: none;

  &__scrim {
    position: absolute;
    inset: 0;
    background: rgb(15 23 42 / 12%);
    pointer-events: auto;
  }

  &__workbench {
    position: absolute;
    top: 52px;
    right: 18px;
    pointer-events: auto;
  }
}
</style>
