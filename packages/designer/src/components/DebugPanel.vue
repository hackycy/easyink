<script setup lang="ts">
import type { DocumentSchemaInput } from '@easyink/schema'
import type { Component } from 'vue'
import type { DiagnosticSeverity } from '../store/diagnostics'
import { IconChevronRight, IconCircleAlert, IconCircleDot, IconCopy, IconDelete, IconDown, IconExport, IconImport } from '@easyink/icons'
import { isObject } from '@easyink/shared'
import { EiIcon } from '@easyink/ui'
import { computed, ref } from 'vue'
import { useDesignerStore } from '../composables'
import { collectMaterialDiagnostics } from '../store/material-diagnostics'

const store = useDesignerStore()

const schemaJson = computed(() => {
  return JSON.stringify(store.schema, null, 2)
})

const elementCount = computed(() => store.getElements().length)
const selectedCount = computed(() => store.selection.count)

interface DisplayDiagnostic {
  id: string | number
  source: string
  severity: DiagnosticSeverity
  message: string
  timestamp: number
  detail?: Record<string, unknown>
}

const diagnostics = computed<DisplayDiagnostic[]>(() => {
  const materialEntries = collectMaterialDiagnostics(store.materialDiagnostics, store.materialNodeStates).map(item => ({
    id: `material:${item.code}:${item.path}:${item.nodeId ?? ''}`,
    source: 'material-admission',
    severity: item.severity === 'warning' ? 'warn' as const : item.severity,
    message: item.message,
    timestamp: 0,
    detail: { code: item.code, path: item.path, ...(item.nodeId ? { nodeId: item.nodeId } : {}) },
  }))
  return [...[...store.diagnostics.entries].reverse(), ...materialEntries]
})

const errorCount = computed(() => diagnostics.value.filter(d => d.severity === 'error').length)
const warnCount = computed(() => diagnostics.value.filter(d => d.severity === 'warn').length)

const severityIcon: Record<DiagnosticSeverity, Component> = {
  error: IconCircleAlert,
  warn: IconCircleAlert,
  info: IconCircleDot,
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(ts % 1000).padStart(3, '0')}`
}

function clearDiagnostics() {
  store.diagnostics.clear()
}

const diagOpen = ref(true)
const schemaOpen = ref(false)
const schemaCopied = ref(false)
const schemaImported = ref(false)
const schemaExported = ref(false)
const schemaFileInputRef = ref<HTMLInputElement | null>(null)

function text(key: string, fallback: string): string {
  const value = store.t(key)
  return value === key ? fallback : value
}

function flash(flag: { value: boolean }): void {
  flag.value = true
  setTimeout(() => {
    flag.value = false
  }, 1500)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message
  if (typeof error === 'string')
    return error
  return 'Unknown error'
}

function getSchemaFileName(): string {
  const rawName = store.schema.meta?.name?.trim() || 'easyink-schema'
  const safeName = rawName
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${safeName || 'easyink-schema'}.json`
}

function copySchema() {
  navigator.clipboard.writeText(schemaJson.value).then(() => {
    flash(schemaCopied)
  })
}

function exportSchema() {
  const blob = new Blob([schemaJson.value], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = getSchemaFileName()
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  flash(schemaExported)
}

function openSchemaImport() {
  schemaFileInputRef.value?.click()
}

async function importSchemaFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file)
    return

  try {
    const parsed = JSON.parse(await file.text()) as unknown
    if (!isObject(parsed))
      throw new Error('Schema JSON must be an object.')

    store.setSchema(parsed as DocumentSchemaInput)
    flash(schemaImported)
  }
  catch (error) {
    store.diagnostics.push({
      source: 'debug-panel',
      severity: 'error',
      message: text('designer.debug.importSchemaFailed', 'Failed to import schema JSON.'),
      detail: {
        fileName: file.name,
        reason: getErrorMessage(error),
      },
    })
  }
}
</script>

<template>
  <div class="ei-debug-panel">
    <!-- Stats -->
    <div class="ei-debug-panel__section">
      <div class="ei-debug-panel__section-title">
        Overview
      </div>
      <div class="ei-debug-panel__stats-grid">
        <span class="ei-debug-panel__stat-label">Elements</span>
        <span class="ei-debug-panel__stat-value">{{ elementCount }}</span>
        <span class="ei-debug-panel__stat-label">Selected</span>
        <span class="ei-debug-panel__stat-value">{{ selectedCount }}</span>
        <span class="ei-debug-panel__stat-label">Version</span>
        <span class="ei-debug-panel__stat-value">{{ store.schema.version }}</span>
        <span class="ei-debug-panel__stat-label">Unit</span>
        <span class="ei-debug-panel__stat-value">{{ store.schema.unit }}</span>
        <span class="ei-debug-panel__stat-label">Mode</span>
        <span class="ei-debug-panel__stat-value">{{ store.schema.page.mode }}</span>
      </div>
    </div>

    <!-- Diagnostics -->
    <div class="ei-debug-panel__section">
      <button type="button" class="ei-debug-panel__section-header ei-debug-panel__collapse-btn" @click="diagOpen = !diagOpen">
        <EiIcon :icon="diagOpen ? IconDown : IconChevronRight" :size="12" class="ei-debug-panel__chevron" />
        <span class="ei-debug-panel__section-title">Diagnostics</span>
        <div class="ei-debug-panel__diag-badges">
          <span v-if="errorCount" class="ei-debug-panel__badge ei-debug-panel__badge--error">{{ errorCount }}</span>
          <span v-if="warnCount" class="ei-debug-panel__badge ei-debug-panel__badge--warn">{{ warnCount }}</span>
        </div>
        <button
          v-if="diagnostics.length"
          type="button"
          class="ei-debug-panel__clear-btn"
          title="Clear all diagnostics"
          @click.stop="clearDiagnostics"
        >
          <EiIcon :icon="IconDelete" :size="12" />
        </button>
      </button>

      <template v-if="diagOpen">
        <ul v-if="diagnostics.length" class="ei-debug-panel__diag-list">
          <li
            v-for="d in diagnostics"
            :key="d.id"
            class="ei-debug-panel__diag-item"
            :class="`ei-debug-panel__diag-item--${d.severity}`"
          >
            <div class="ei-debug-panel__diag-row">
              <EiIcon :icon="severityIcon[d.severity]" :size="12" class="ei-debug-panel__diag-icon" />
              <span class="ei-debug-panel__diag-msg">{{ d.message }}</span>
            </div>
            <div class="ei-debug-panel__diag-meta">
              <span class="ei-debug-panel__diag-source">{{ d.source }}</span>
              <span class="ei-debug-panel__diag-time">{{ formatTime(d.timestamp) }}</span>
            </div>
            <pre v-if="d.detail" class="ei-debug-panel__diag-detail">{{ JSON.stringify(d.detail, null, 2) }}</pre>
          </li>
        </ul>
        <div v-else class="ei-debug-panel__diag-empty">
          No diagnostics recorded.
        </div>
      </template>
    </div>

    <!-- Schema -->
    <div class="ei-debug-panel__section">
      <div class="ei-debug-panel__section-header">
        <button type="button" class="ei-debug-panel__collapse-btn" @click="schemaOpen = !schemaOpen">
          <EiIcon :icon="schemaOpen ? IconDown : IconChevronRight" :size="12" class="ei-debug-panel__chevron" />
          <span class="ei-debug-panel__section-title">{{ store.t('designer.debug.schema') }}</span>
        </button>
        <div v-if="schemaOpen" class="ei-debug-panel__schema-actions">
          <button
            type="button"
            class="ei-debug-panel__clear-btn"
            :title="schemaImported ? text('designer.debug.importedSchema', 'Imported') : text('designer.debug.importSchema', 'Import JSON')"
            @click="openSchemaImport"
          >
            <EiIcon :icon="IconImport" :size="12" :class="schemaImported ? 'ei-debug-panel__action--done' : ''" />
          </button>
          <button
            type="button"
            class="ei-debug-panel__clear-btn"
            :title="schemaExported ? text('designer.debug.exportedSchema', 'Exported') : text('designer.debug.exportSchema', 'Export JSON')"
            @click="exportSchema"
          >
            <EiIcon :icon="IconExport" :size="12" :class="schemaExported ? 'ei-debug-panel__action--done' : ''" />
          </button>
          <button
            type="button"
            class="ei-debug-panel__clear-btn"
            :title="schemaCopied ? text('designer.debug.copiedSchema', 'Copied!') : text('designer.debug.copySchema', 'Copy schema')"
            @click="copySchema"
          >
            <EiIcon :icon="IconCopy" :size="12" :class="schemaCopied ? 'ei-debug-panel__copy--done' : ''" />
          </button>
        </div>
        <input
          ref="schemaFileInputRef"
          class="ei-debug-panel__file-input"
          type="file"
          accept="application/json,.json"
          @change="importSchemaFile"
        >
      </div>
      <pre v-if="schemaOpen" class="ei-debug-panel__code">{{ schemaJson }}</pre>
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-debug-panel {
  font-size: 11px;
  padding: 6px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;

  &__section {
    padding: 6px 0;

    & + & {
      border-top: 1px solid var(--ei-border-color, #ebebeb);
    }
  }

  &__section-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  &__collapse-btn {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    min-width: 0;

    &:hover .ei-debug-panel__chevron {
      color: var(--ei-text, #555);
    }
  }

  &__chevron {
    flex-shrink: 0;
    color: var(--ei-text-secondary, #bbb);
    transition: color 0.1s;
  }

  &__section-title {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ei-text-secondary, #aaa);
    flex: 1;
  }

  /* Stats */
  &__stats-grid {
    display: grid;
    grid-template-columns: auto 1fr;
    column-gap: 12px;
    row-gap: 3px;
  }

  &__stat-label {
    color: var(--ei-text-secondary, #999);
    font-size: 11px;
  }

  &__stat-value {
    color: var(--ei-text, #333);
    font-size: 11px;
    font-weight: 500;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
  }

  /* Diagnostics badges */
  &__diag-badges {
    display: flex;
    gap: 4px;
  }

  &__badge {
    font-size: 10px;
    font-weight: 600;
    line-height: 1;
    padding: 1px 5px;
    border-radius: 8px;

    &--error {
      background: #fff1f0;
      color: #d4380d;
    }

    &--warn {
      background: #fffbe6;
      color: #d48806;
    }
  }

  &__clear-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: transparent;
    color: var(--ei-text-secondary, #bbb);
    cursor: pointer;
    margin-left: auto;

    &:hover {
      background: var(--ei-hover-bg, #f0f0f0);
      color: var(--ei-text, #333);
    }
  }

  &__schema-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;

    .ei-debug-panel__clear-btn {
      margin-left: 0;
    }
  }

  &__file-input {
    display: none;
  }

  &__diag-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  &__diag-item {
    border-radius: 4px;
    padding: 6px 8px;

    &--error {
      background: #fff1f0;

      .ei-debug-panel__diag-icon {
        color: #d4380d;
      }
    }

    &--warn {
      background: #fffbe6;

      .ei-debug-panel__diag-icon {
        color: #d48806;
      }
    }

    &--info {
      background: var(--ei-canvas-bg, #f5f5f5);

      .ei-debug-panel__diag-icon {
        color: #1890ff;
      }
    }
  }

  &__diag-row {
    display: flex;
    align-items: flex-start;
    gap: 5px;
    margin-bottom: 3px;
  }

  &__diag-icon {
    flex-shrink: 0;
    margin-top: 1px;
  }

  &__diag-msg {
    font-size: 11px;
    color: var(--ei-text, #333);
    line-height: 1.5;
    word-break: break-word;
  }

  &__diag-meta {
    display: flex;
    justify-content: space-between;
    padding-left: 17px;
    gap: 6px;
  }

  &__diag-source {
    font-size: 10px;
    color: var(--ei-text-secondary, #999);
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-weight: 500;
  }

  &__diag-time {
    font-size: 10px;
    color: var(--ei-text-secondary, #bbb);
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    flex-shrink: 0;
  }

  &__diag-detail {
    margin: 4px 0 0 17px;
    padding: 4px 6px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.04);
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 10px;
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.5;
  }

  &__diag-empty {
    font-size: 11px;
    color: var(--ei-text-secondary, #bbb);
    font-style: italic;
    padding: 2px 0 4px;
  }

  &__copy--done {
    color: #52c41a;
  }

  &__action--done {
    color: #52c41a;
  }

  &__code {
    background: var(--ei-canvas-bg, #f5f5f5);
    padding: 8px;
    border-radius: 4px;
    font-family: ui-monospace, 'SF Mono', Menlo, monospace;
    font-size: 10px;
    white-space: pre-wrap;
    word-break: break-all;
    line-height: 1.5;
    margin: 0;
    user-select: text;
    cursor: text;
  }
}
</style>
