<script setup lang="ts">
import type { AssistantTranslate } from '../i18n'
import { translateAssistant } from '../i18n'

const props = defineProps<{ t?: AssistantTranslate }>()

function tr(key: string): string {
  return translateAssistant(key, props.t)
}
</script>

<template>
  <header class="assistant-conversation-header">
    <div class="assistant-conversation-header__brand">
      <span class="assistant-conversation-header__avatar" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18">
          <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z" fill="currentColor" />
          <circle cx="18" cy="17" r="2.2" fill="currentColor" opacity="0.7" />
        </svg>
      </span>
      <div>
        <h2>{{ tr('designer.assistant.title') }}</h2>
        <p>{{ tr('designer.assistant.description') }}</p>
      </div>
    </div>
  </header>
</template>
