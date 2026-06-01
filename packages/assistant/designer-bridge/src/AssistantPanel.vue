<script setup lang="ts">
import type { AssistantMaterialManifest, AssistantPatchOperation, AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantConversationStatus, AssistantStore } from '@easyink/assistant-store'
import type { AssistantApiClient } from '@easyink/assistant-ui'
import { AssistantWorkbench } from '@easyink/assistant-ui'
import '@easyink/assistant-ui/index.css'

type AssistantTranslate = (key: string) => string

const props = defineProps<{
  open: boolean
  endpoint?: string
  apiClient?: AssistantApiClient
  currentSchema?: unknown
  materialManifest?: AssistantMaterialManifest
  store?: AssistantStore
  conversationId?: string
  t?: AssistantTranslate
}>()

defineEmits<{
  'update:open': [value: boolean]
  'requestClose': []
  'apply': [result: AssistantResult]
  'applyPatch': [operations: AssistantPatchOperation[]]
  'applySelectedPatch': [operations: AssistantPatchOperation[]]
  'applyDataSource': [dataSource: NonNullable<AssistantResult['dataSource']>]
  'rollback': []
  'statusChange': [status: AssistantConversationStatus]
}>()

function tr(key: string): string {
  const translated = props.t?.(key)
  if (translated && translated !== key)
    return translated
  if (key === 'designer.assistant.action.close')
    return '关闭'
  if (key === 'designer.assistant.dialog.label')
    return 'EasyInk Assistant'
  return key
}
</script>

<template>
  <Teleport to="body">
    <Transition name="easyink-assistant-drawer">
      <div v-if="open" class="easyink-assistant-drawer" role="dialog" aria-modal="true" :aria-label="tr('designer.assistant.dialog.label')">
        <div class="easyink-assistant-drawer__scrim" @click="$emit('requestClose')" />
        <aside class="easyink-assistant-drawer__panel">
          <button
            type="button"
            class="easyink-assistant-drawer__close"
            :aria-label="tr('designer.assistant.action.close')"
            @click="$emit('requestClose')"
          >
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
          <AssistantWorkbench
            class="easyink-assistant-drawer__workbench"
            :endpoint="endpoint"
            :api-client="apiClient"
            :current-schema="currentSchema"
            :material-manifest="materialManifest"
            :store="store"
            :conversation-id="conversationId"
            :t="t"
            @apply="$emit('apply', $event)"
            @apply-patch="$emit('applyPatch', $event)"
            @apply-selected-patch="$emit('applySelectedPatch', $event)"
            @apply-data-source="$emit('applyDataSource', $event)"
            @rollback="$emit('rollback')"
            @status-change="$emit('statusChange', $event)"
          />
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.easyink-assistant-drawer {
  position: fixed;
  inset: 0;
  z-index: 1000;

  &__scrim {
    position: absolute;
    inset: 0;
    background: rgb(15 23 42 / 28%);
    backdrop-filter: blur(1px);
  }

  &__panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(480px, 100vw);
    background: var(--ei-panel-bg, #fff);
    box-shadow: -24px 0 60px rgb(15 23 42 / 18%);
    display: flex;
    flex-direction: column;
  }

  &__close {
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--ei-text-secondary, #667085);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;

    &:hover {
      background: var(--ei-hover-bg, #f6f8fb);
      color: var(--ei-text, #1f2937);
    }
  }

  &__workbench {
    flex: 1 1 auto;
    min-height: 0;
  }
}

.easyink-assistant-drawer-enter-active,
.easyink-assistant-drawer-leave-active {
  transition: opacity 0.2s ease;

  .easyink-assistant-drawer__panel {
    transition: transform 0.24s cubic-bezier(0.32, 0.72, 0, 1);
  }
}

.easyink-assistant-drawer-enter-from,
.easyink-assistant-drawer-leave-to {
  opacity: 0;

  .easyink-assistant-drawer__panel {
    transform: translateX(100%);
  }
}
</style>
