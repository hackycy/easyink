<script setup lang="ts">
import type { AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantConversationMessage } from '../projection'
import AssistantMessage from './AssistantMessage.vue'
import AssistantTurn from './AssistantTurn.vue'
import ClarificationCard from './ClarificationCard.vue'
import DiffCard from './DiffCard.vue'
import ErrorCard from './ErrorCard.vue'
import RepairCard from './RepairCard.vue'
import ResultCard from './ResultCard.vue'
import SourceAttachmentCard from './SourceAttachmentCard.vue'
import UserMessage from './UserMessage.vue'
import VersionCard from './VersionCard.vue'

defineProps<{
  messages: AssistantConversationMessage[]
  applying?: boolean
}>()

defineEmits<{
  apply: [result: AssistantResult]
  applyPatch: [operations: AssistantPatchOperation[]]
  applySelectedPatch: [operations: AssistantPatchOperation[]]
  applyDataSource: [dataSource: NonNullable<AssistantResult['dataSource']>]
  answer: [value: string]
  repair: []
  retry: []
  rollback: []
  exportVersions: []
  removeSource: []
}>()
</script>

<template>
  <main class="assistant-message-list">
    <AssistantMessage
      v-if="!messages.length"
      text="你好，我可以帮你生成 EasyInk 模板。试试输入“帮我生成一张 80mm 小票”。"
    />
    <template v-for="message in messages" :key="message.id">
      <UserMessage v-if="message.kind === 'text' && message.role === 'user'" :text="message.text" />
      <AssistantMessage v-else-if="message.kind === 'text'" :text="message.text" />
      <AssistantTurn v-else-if="message.kind === 'turn'" :thinking="message.thinking" :steps="message.steps" :tools="message.tools" />
      <SourceAttachmentCard v-else-if="message.kind === 'source'" :source="message.source" :title="message.title" :detail="message.detail" :fields="message.fields" :warnings="message.warnings" @remove="$emit('removeSource')" />
      <ResultCard v-else-if="message.kind === 'result'" :result="message.result" :applying="applying" @apply="$emit('apply', $event)" @apply-data-source="$emit('applyDataSource', $event)" />
      <DiffCard v-else-if="message.kind === 'diff'" :result="message.result" @apply-patch="$emit('applyPatch', $event)" @apply-selected-patch="$emit('applySelectedPatch', $event)" />
      <ClarificationCard v-else-if="message.kind === 'clarification'" :questions="message.questions" @answer="$emit('answer', $event)" />
      <RepairCard v-else-if="message.kind === 'repair'" :result="message.result" @repair="$emit('repair')" />
      <VersionCard v-else-if="message.kind === 'version'" :versions="message.versions" @rollback="$emit('rollback')" @export="$emit('exportVersions')" />
      <ErrorCard v-else-if="message.kind === 'error'" :text="message.text" @retry="$emit('retry')" />
    </template>
  </main>
</template>
