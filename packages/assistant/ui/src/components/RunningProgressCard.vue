<script setup lang="ts">
import type { AssistantTranslate } from '../i18n'
import type { ChecklistItem } from '../projection'
import { IconLoader, IconSparkles } from '@easyink/icons'
import { translateAssistant } from '../i18n'
import ChecklistCard from './ChecklistCard.vue'

const props = defineProps<{
  activeItem?: ChecklistItem
  checklist: ChecklistItem[]
  latestThinkingLine?: string
  mood: string
  percent: number
  signals: string[]
  showChecklist: boolean
  t?: AssistantTranslate
}>()

function tr(key: string): string {
  return translateAssistant(key, props.t)
}
</script>

<template>
  <article class="assistant-live-card">
    <div class="assistant-live-card__aura" aria-hidden="true" />
    <header class="assistant-live-card__head">
      <span class="assistant-live-card__orb" aria-hidden="true">
        <IconSparkles :size="17" stroke-width="1.8" />
      </span>
      <div>
        <strong>{{ activeItem?.title ?? tr('designer.assistant.progress.generating') }}</strong>
        <p>{{ latestThinkingLine ?? mood }}</p>
      </div>
      <IconLoader class="assistant-live-card__loader" :size="17" stroke-width="2" aria-hidden="true" />
    </header>
    <div class="assistant-live-card__meter" aria-hidden="true">
      <span :style="{ width: `${percent}%` }" />
    </div>
    <ChecklistCard v-if="showChecklist" :items="checklist" :t="t" />
    <ul v-if="signals.length" class="assistant-live-card__signals">
      <li v-for="signal in signals" :key="signal">
        {{ signal }}
      </li>
    </ul>
  </article>
</template>

<style scoped lang="scss">
.assistant-live-card {
  position: relative;
  align-self: stretch;
  overflow: hidden;
  padding: 20px;
  border-radius: 18px;
  background:
    radial-gradient(circle at 8% 8%, color-mix(in srgb, var(--assistant-accent) 18%, transparent), transparent 34%),
    radial-gradient(circle at 96% 12%, rgb(22 163 74 / 9%), transparent 28%),
    var(--assistant-bg);
  box-shadow:
    var(--assistant-shadow),
    inset 0 0 0 1px color-mix(in srgb, var(--assistant-accent) 10%, transparent);
}

.assistant-live-card__aura {
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, transparent, rgb(255 255 255 / 72%), transparent);
  opacity: 0.42;
  transform: translateX(-100%);
  animation: assistant-aura-drift 2.8s ease-in-out infinite;
}

.assistant-live-card__head,
.assistant-live-card__meter,
.assistant-live-card :deep(.assistant-checklist),
.assistant-live-card__signals {
  position: relative;
  z-index: 1;
}

.assistant-live-card__head {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 12px;
}

.assistant-live-card__orb {
  display: inline-flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: var(--assistant-accent);
  color: #fff;
  box-shadow: 0 10px 24px color-mix(in srgb, var(--assistant-accent) 22%, transparent);
}

.assistant-live-card__head strong {
  display: block;
  font-size: 14px;
  font-weight: 600;
}

.assistant-live-card__head p {
  margin: 3px 0 0;
  color: var(--assistant-muted);
  line-height: 1.55;
}

.assistant-live-card__loader {
  color: var(--assistant-accent);
  animation: assistant-spin 1.1s linear infinite;
}

.assistant-live-card__meter {
  position: relative;
  height: 6px;
  overflow: hidden;
  margin: 18px 0 8px;
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgb(255 255 255 / 0%), rgb(255 255 255 / 58%), rgb(255 255 255 / 0%)) 0 0 / 44px 100%,
    color-mix(in srgb, var(--assistant-border) 60%, transparent);
  animation: assistant-meter-track 1.25s linear infinite;
}

.assistant-live-card__meter span {
  position: relative;
  display: block;
  height: 100%;
  min-width: 26px;
  border-radius: inherit;
  background:
    linear-gradient(90deg, var(--assistant-accent), var(--assistant-accent-hover), color-mix(in srgb, #16a34a 38%, var(--assistant-accent))),
    var(--assistant-accent);
  box-shadow:
    0 0 14px color-mix(in srgb, var(--assistant-accent) 32%, transparent),
    inset 0 0 0 1px rgb(255 255 255 / 22%);
  transition: width 0.38s ease;
  animation: assistant-meter-breathe 1.05s ease-in-out infinite;
}

.assistant-live-card__meter span::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 76%), transparent);
  content: '';
  transform: translateX(-100%);
  animation: assistant-meter-shine 1.15s ease-in-out infinite;
}

.assistant-live-card__signals {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 14px 0 0;
  padding: 0;
  color: var(--assistant-muted);
  font-size: 12px;
  list-style: none;
}

.assistant-live-card__signals li {
  display: flex;
  gap: 7px;
  align-items: center;
}

.assistant-live-card__signals li::before {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--assistant-accent);
  content: '';
}

@keyframes assistant-spin {
  to { transform: rotate(360deg); }
}

@keyframes assistant-aura-drift {
  0% { transform: translateX(-100%); }
  45%, 100% { transform: translateX(100%); }
}

@keyframes assistant-meter-track {
  from { background-position: -44px 0, 0 0; }
  to { background-position: 44px 0, 0 0; }
}

@keyframes assistant-meter-breathe {
  0%, 100% { filter: brightness(1); }
  50% { filter: brightness(1.2); }
}

@keyframes assistant-meter-shine {
  0% { opacity: 0; transform: translateX(-100%); }
  28% { opacity: 1; }
  100% { opacity: 0; transform: translateX(100%); }
}
</style>
