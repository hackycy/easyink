<script setup lang="ts">
import type { AssistantMaterialManifest, AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantApiClient } from '@easyink/assistant-ui'
import { AssistantWorkbench } from '@easyink/assistant-ui'
import '@easyink/assistant-ui/index.css'

defineProps<{
  open: boolean
  endpoint?: string
  apiClient?: AssistantApiClient
  currentSchema?: unknown
  materialManifest?: AssistantMaterialManifest
}>()

defineEmits<{
  'update:open': [value: boolean]
  'apply': [result: AssistantResult]
  'applyPatch': [operations: AssistantPatchOperation[]]
  'applySelectedPatch': [operations: AssistantPatchOperation[]]
  'applyDataSource': [dataSource: NonNullable<AssistantResult['dataSource']>]
  'rollback': []
}>()
</script>

<template>
  <div v-if="open" class="easyink-assistant-panel">
    <div class="easyink-assistant-panel__scrim" @click="$emit('update:open', false)" />
    <AssistantWorkbench
      class="easyink-assistant-panel__workbench"
      :endpoint="endpoint"
      :api-client="apiClient"
      :current-schema="currentSchema"
      :material-manifest="materialManifest"
      @apply="$emit('apply', $event)"
      @apply-patch="$emit('applyPatch', $event)"
      @apply-selected-patch="$emit('applySelectedPatch', $event)"
      @apply-data-source="$emit('applyDataSource', $event)"
      @rollback="$emit('rollback')"
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
