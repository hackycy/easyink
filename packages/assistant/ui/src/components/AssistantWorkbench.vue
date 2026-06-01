<script setup lang="ts">
import type { AssistantMaterialManifest, AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantApiClient } from '../api'
import type { AssistantTranslate } from '../i18n'
import ConversationPanel from './ConversationPanel.vue'

defineProps<{
  endpoint?: string
  apiClient?: AssistantApiClient
  currentSchema?: unknown
  materialManifest?: AssistantMaterialManifest
  t?: AssistantTranslate
}>()

defineEmits<{
  apply: [result: AssistantResult]
  applyPatch: [operations: AssistantPatchOperation[]]
  applySelectedPatch: [operations: AssistantPatchOperation[]]
  applyDataSource: [dataSource: NonNullable<AssistantResult['dataSource']>]
  rollback: []
}>()
</script>

<template>
  <ConversationPanel
    :endpoint="endpoint"
    :api-client="apiClient"
    :current-schema="currentSchema"
    :material-manifest="materialManifest"
    :t="t"
    @apply="$emit('apply', $event)"
    @apply-patch="$emit('applyPatch', $event)"
    @apply-selected-patch="$emit('applySelectedPatch', $event)"
    @apply-data-source="$emit('applyDataSource', $event)"
    @rollback="$emit('rollback')"
  />
</template>
