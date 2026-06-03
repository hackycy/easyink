<script setup lang="ts">
import type {
  AssistantPlugin,
  AssistantPluginContextItem,
  AssistantPluginSelectionEntry,
} from '@easyink/assistant-plugins'
import type { AssistantTranslate } from '../i18n'
import { IconCheck, IconLoader } from '@easyink/icons'
import { computed, ref } from 'vue'
import { translateAssistant } from '../i18n'

const props = defineProps<{
  plugins: AssistantPlugin[]
  entries: AssistantPluginSelectionEntry[]
  prompt?: string
  currentSchema?: unknown
  materialManifest?: unknown
  t?: AssistantTranslate
}>()

const emit = defineEmits<{
  toggle: [pluginId: string, enabled: boolean]
  updateEntry: [entry: AssistantPluginSelectionEntry]
}>()

const runningAction = ref<string>()
const hasPlugins = computed(() => props.plugins.length > 0)
const enabledCount = computed(() => props.entries.filter(entry => entry.enabled).length)

function tr(key: string): string {
  return translateAssistant(key, props.t)
}

function entryFor(pluginId: string): AssistantPluginSelectionEntry {
  return props.entries.find(entry => entry.pluginId === pluginId) ?? { pluginId, enabled: false }
}

function contextCount(entry: AssistantPluginSelectionEntry): number {
  return (entry.contributions?.length ?? 0) + (entry.contextItems?.length ?? 0)
}

function contextLabel(item: AssistantPluginContextItem): string {
  return item.title ?? item.url ?? item.content ?? item.id
}

async function invokePlugin(plugin: AssistantPlugin, actionId: string): Promise<void> {
  if (!plugin.invoke)
    return
  const key = `${plugin.manifest.id}:${actionId}`
  runningAction.value = key
  try {
    const entry = entryFor(plugin.manifest.id)
    const result = await plugin.invoke({
      pluginId: plugin.manifest.id,
      actionId,
      prompt: props.prompt,
      currentSchema: props.currentSchema,
      materialManifest: props.materialManifest,
      state: entry.state,
    })
    emit('updateEntry', {
      pluginId: plugin.manifest.id,
      enabled: true,
      state: result.state ?? entry.state,
      contributions: [
        ...(entry.contributions ?? []),
        ...(result.contributions ?? []),
      ],
      contextItems: [
        ...(entry.contextItems ?? []),
        ...(result.contextItems ?? []),
      ],
      warnings: [
        ...(entry.warnings ?? []),
        ...(result.warnings ?? []),
      ],
    })
  }
  finally {
    runningAction.value = undefined
  }
}
</script>

<template>
  <main class="assistant-plugin-panel" :aria-label="tr('designer.assistant.plugins.title')">
    <header class="assistant-plugin-panel__head">
      <div>
        <strong>{{ tr('designer.assistant.plugins.title') }}</strong>
        <span>{{ enabledCount }}/{{ plugins.length }}</span>
      </div>
    </header>

    <p v-if="!hasPlugins" class="assistant-plugin-panel__empty">
      {{ tr('designer.assistant.plugins.empty') }}
    </p>

    <div v-else class="assistant-plugin-list">
      <article v-for="plugin in plugins" :key="plugin.manifest.id" class="assistant-plugin-card">
        <div class="assistant-plugin-card__main">
          <div class="assistant-plugin-card__body">
            <div class="assistant-plugin-card__title-row">
              <strong>{{ plugin.manifest.name }}</strong>
              <span v-if="plugin.manifest.category">{{ plugin.manifest.category }}</span>
            </div>
            <p v-if="plugin.manifest.description">
              {{ plugin.manifest.description }}
            </p>
            <div v-if="contextCount(entryFor(plugin.manifest.id)) > 0" class="assistant-plugin-card__context">
              <span>
                <IconCheck :size="13" stroke-width="2" />
                {{ tr('designer.assistant.plugins.contextReady') }} {{ contextCount(entryFor(plugin.manifest.id)) }}
              </span>
              <ul v-if="entryFor(plugin.manifest.id).contextItems?.length">
                <li v-for="item in entryFor(plugin.manifest.id).contextItems" :key="item.id">
                  {{ contextLabel(item) }}
                </li>
              </ul>
            </div>
            <p v-if="entryFor(plugin.manifest.id).warnings?.length" class="assistant-plugin-card__warning">
              {{ entryFor(plugin.manifest.id).warnings?.[0] }}
            </p>
          </div>
          <label class="assistant-plugin-switch">
            <input
              type="checkbox"
              :checked="entryFor(plugin.manifest.id).enabled"
              @change="emit('toggle', plugin.manifest.id, ($event.target as HTMLInputElement).checked)"
            >
            <span />
          </label>
        </div>
        <div v-if="plugin.manifest.actions?.length" class="assistant-plugin-card__actions">
          <button
            v-for="action in plugin.manifest.actions"
            :key="action.id"
            type="button"
            class="assistant-plugin-card__action"
            :disabled="runningAction === `${plugin.manifest.id}:${action.id}` || !plugin.invoke"
            @click="invokePlugin(plugin, action.id)"
          >
            <IconLoader v-if="runningAction === `${plugin.manifest.id}:${action.id}`" :size="13" stroke-width="1.9" />
            <span>{{ action.label }}</span>
          </button>
        </div>
      </article>
    </div>
  </main>
</template>

<style scoped lang="scss">
.assistant-plugin-panel {
  display: flex;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  padding: 22px 24px 18px;
  background: var(--assistant-bg);
}

.assistant-plugin-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
  color: var(--assistant-muted);
  font-size: 12px;

  > div {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 8px;
  }

  strong {
    color: var(--assistant-text);
    font-size: 14px;
    font-weight: 600;
  }

  span {
    display: inline-flex;
    min-width: 22px;
    height: 22px;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    background: var(--assistant-surface);
    color: var(--assistant-muted);
    font-size: 11px;
    font-weight: 600;
    padding: 0 8px;
  }
}

.assistant-plugin-panel__empty {
  margin: 0;
  padding: 16px 2px;
  color: var(--assistant-muted);
  font-size: 12px;
  line-height: 1.6;
}

.assistant-plugin-list {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 10px;
  overflow: auto;
}

.assistant-plugin-card {
  border: 1px solid var(--assistant-border);
  border-radius: 8px;
  background: var(--assistant-bg);
  padding: 12px;
}

.assistant-plugin-card__main {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px;
  gap: 10px;
  align-items: flex-start;
}

.assistant-plugin-card__body {
  min-width: 0;
}

.assistant-plugin-card__title-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;

  strong {
    overflow: hidden;
    color: var(--assistant-text);
    font-size: 13px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--assistant-surface);
    color: var(--assistant-muted);
    font-size: 11px;
    padding: 2px 7px;
  }
}

.assistant-plugin-card p {
  margin: 5px 0 0;
  color: var(--assistant-muted);
  font-size: 12px;
  line-height: 1.55;
}

.assistant-plugin-card__context {
  display: grid;
  gap: 4px;
  margin-top: 8px;
  color: var(--assistant-muted);
  font-size: 12px;

  span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    color: var(--assistant-success);
    font-weight: 600;
  }

  ul {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    max-width: 100%;
    overflow: hidden;
    border-radius: 6px;
    background: var(--assistant-surface);
    color: var(--assistant-muted);
    padding: 2px 6px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.assistant-plugin-card__warning {
  color: var(--assistant-danger) !important;
}

.assistant-plugin-switch {
  position: relative;
  display: inline-flex;
  width: 38px;
  height: 22px;
  cursor: pointer;

  input {
    position: absolute;
    opacity: 0;
  }

  span {
    position: absolute;
    inset: 0;
    border-radius: 999px;
    background: color-mix(in srgb, var(--assistant-muted) 22%, var(--assistant-surface));
    transition: background 0.15s;

    &::after {
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 999px;
      background: #fff;
      box-shadow: 0 1px 4px rgb(15 23 42 / 22%);
      content: '';
      transition: transform 0.15s;
    }
  }

  input:checked + span {
    background: var(--assistant-accent);

    &::after {
      transform: translateX(16px);
    }
  }
}

.assistant-plugin-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.assistant-plugin-card__action {
  display: inline-flex;
  height: 28px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: none;
  border-radius: 7px;
  background: var(--assistant-surface);
  color: var(--assistant-text);
  cursor: pointer;
  font-size: 12px;
  padding: 0 10px;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  &:hover:not(:disabled) {
    background: var(--assistant-primary-soft);
    color: var(--assistant-accent);
  }
}
</style>
