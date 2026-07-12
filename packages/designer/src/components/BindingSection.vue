<script setup lang="ts">
import type { BindingFormatEditorDefinition } from '@easyink/core'
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { BindingRef, MaterialNode } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import { EiButton } from '@easyink/ui'
import { computed } from 'vue'
import BindingFormatEditor from './BindingFormatEditor.vue'

const props = defineProps<{
  element: MaterialNode
  t: (key: string) => string
  /** External binding override (from overlay). When provided, overrides element.bindings.value. */
  externalBinding?: BindingRef | BindingRef[] | null
  /** Whether external binding is explicitly set (to distinguish undefined from not-provided) */
  hasExternalBinding?: boolean
  getDataSource?: (sourceId: string) => DataSourceDescriptor | undefined
  formatEditor: BindingFormatEditorDefinition | false
}>()

const emit = defineEmits<{
  clearBinding: [nodeId: string]
  clearExternalBinding: [bindIndex?: number]
  updateBindingFormat: [format: BindingDisplayFormat | undefined, bindIndex?: number]
}>()

const bindings = computed<BindingRef[]>(() => {
  // When overlay provides binding context, use it
  if (props.hasExternalBinding) {
    if (props.externalBinding === null || props.externalBinding === undefined)
      return []
    return Array.isArray(props.externalBinding) ? props.externalBinding : [props.externalBinding]
  }
  // Default: element-level binding
  const b = props.element.bindings.value
  if (!b)
    return []
  if (!Array.isArray(b) && 'kind' in b && b.kind === 'data-contract')
    return []
  return (Array.isArray(b) ? b : [b]).filter(isBindingRef)
})

const isExternal = computed(() => props.hasExternalBinding && props.externalBinding !== null)

function handleClear() {
  if (isExternal.value) {
    emit('clearExternalBinding')
  }
  else {
    emit('clearBinding', props.element.id)
  }
}

function bindIndex(ref: BindingRef, index: number): number {
  return ref.bindIndex ?? index
}

function isBindingRef(binding: unknown): binding is BindingRef {
  return typeof binding === 'object'
    && binding !== null
    && 'sourceId' in binding
    && 'fieldPath' in binding
}
</script>

<template>
  <div class="ei-binding-section">
    <div class="ei-binding-section__header">
      <span class="ei-binding-section__title">{{ t('designer.property.dataBinding') }}</span>
    </div>
    <template v-if="bindings.length > 0">
      <div
        v-for="(binding, idx) in bindings"
        :key="idx"
        class="ei-binding-section__item"
      >
        <div class="ei-binding-section__row">
          <span class="ei-binding-section__k">{{ t('designer.dataSource.source') }}</span>
          <span class="ei-binding-section__v">{{ binding.sourceName || binding.sourceId }}</span>
        </div>
        <div class="ei-binding-section__row">
          <span class="ei-binding-section__k">{{ t('designer.dataSource.field') }}</span>
          <div class="ei-binding-section__field">
            <span class="ei-binding-section__v">{{ binding.fieldLabel || binding.fieldPath }}</span>
            <span
              v-if="binding.fieldLabel"
              class="ei-binding-section__path"
              :title="binding.fieldPath"
            >{{ binding.fieldPath }}</span>
          </div>
        </div>
        <BindingFormatEditor
          v-if="formatEditor"
          :binding="binding"
          :bind-index="bindIndex(binding, idx)"
          :t="t"
          :get-data-source="getDataSource"
          :format-editor="formatEditor"
          @update-binding-format="emit('updateBindingFormat', $event, bindIndex(binding, idx))"
        />
      </div>
      <div class="ei-binding-section__footer">
        <EiButton size="sm" @click="handleClear">
          {{ t('designer.dataSource.unbind') }}
        </EiButton>
      </div>
    </template>
    <div v-else class="ei-binding-section__empty">
      {{ t('designer.dataSource.dragHint') }}
    </div>
  </div>
</template>

<style scoped lang="scss">
/* ── Properties-panel binding item ── */
.ei-binding-section {
  width: 100%;

  &__header {
    margin-bottom: 6px;
  }

  &__title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--ei-text-secondary, #999);
  }

  &__item {
    padding: 6px 0;

    & + & {
      border-top: 1px solid #f0f0f0;
    }
  }

  /* Label-value rows */
  &__row {
    display: flex;
    align-items: flex-start;
    gap: 6px;

    & + & {
      margin-top: 3px;
    }

  }

  /* Row label (来源 / 字段 / 格式) */
  &__k {
    width: 28px;
    flex-shrink: 0;
    font-size: 10px;
    color: var(--ei-text-secondary, #c8c8c8);
    padding-top: 1px;
  }

  /* Row main value */
  &__v {
    font-size: 12px;
    font-weight: 500;
    color: var(--ei-text, #333);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  /* Field label + path stacked */
  &__field {
    display: flex;
    flex-direction: column;
    gap: 1px;
    flex: 1;
    min-width: 0;
  }

  /* Technical field path */
  &__path {
    font-size: 10px;
    color: var(--ei-text-secondary, #c0c0c0);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__footer {
    margin-top: 6px;
  }

  &__empty {
    font-size: 12px;
    color: var(--ei-text-secondary, #999);
    padding: 4px 0;
  }
}
</style>
