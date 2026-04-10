<script setup lang="ts">
import type { BindingRef, MaterialNode } from '@easyink/schema'
import { EiButton } from '@easyink/ui'
import { computed } from 'vue'

const props = defineProps<{
  element: MaterialNode
  t: (key: string) => string
  /** External binding override (from overlay). When provided, overrides element.binding. */
  externalBinding?: BindingRef | BindingRef[] | null
  /** Whether external binding is explicitly set (to distinguish undefined from not-provided) */
  hasExternalBinding?: boolean
}>()

const emit = defineEmits<{
  clearBinding: [nodeId: string]
  clearExternalBinding: [bindIndex?: number]
}>()

const bindings = computed<BindingRef[]>(() => {
  // When overlay provides binding context, use it
  if (props.hasExternalBinding) {
    if (props.externalBinding === null || props.externalBinding === undefined)
      return []
    return Array.isArray(props.externalBinding) ? props.externalBinding : [props.externalBinding]
  }
  // Default: element-level binding
  const b = props.element.binding
  if (!b)
    return []
  return Array.isArray(b) ? b : [b]
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
</script>

<template>
  <div class="ei-binding-section">
    <div class="ei-binding-section__header">
      <span class="ei-binding-section__title">{{ t('designer.property.dataBinding') }}</span>
    </div>
    <template v-if="bindings.length > 0">
      <div
        v-for="(ref, idx) in bindings"
        :key="idx"
        class="ei-binding-section__item"
      >
        <div class="ei-binding-section__row">
          <span class="ei-binding-section__label">{{ t('designer.dataSource.source') }}</span>
          <span class="ei-binding-section__value">{{ ref.sourceName || ref.sourceId }}</span>
        </div>
        <div class="ei-binding-section__row">
          <span class="ei-binding-section__label">{{ t('designer.dataSource.field') }}</span>
          <span class="ei-binding-section__value">{{ ref.fieldLabel || ref.fieldPath }}</span>
        </div>
        <div v-if="ref.usage" class="ei-binding-section__row">
          <span class="ei-binding-section__label">{{ t('designer.dataSource.usage') }}</span>
          <span class="ei-binding-section__value">{{ typeof ref.usage === 'string' ? ref.usage : ref.usage.id }}</span>
        </div>
      </div>
      <div class="ei-binding-section__actions">
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

<style scoped>
.ei-binding-section {
  width: 100%;
}

.ei-binding-section__header {
  margin-bottom: 6px;
}

.ei-binding-section__title {
  font-weight: 500;
  font-size: 12px;
  color: var(--ei-text-secondary, #666);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.ei-binding-section__item {
  padding: 6px;
  background: var(--ei-panel-header-bg, #fafafa);
  border: 1px solid var(--ei-border-color, #eee);
  border-radius: 4px;
  margin-bottom: 4px;
}

.ei-binding-section__row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 1.6;
}

.ei-binding-section__label {
  color: var(--ei-text-secondary, #999);
  flex-shrink: 0;
  min-width: 32px;
}

.ei-binding-section__value {
  color: var(--ei-text, #333);
  word-break: break-all;
}

.ei-binding-section__actions {
  margin-top: 4px;
}

.ei-binding-section__empty {
  font-size: 12px;
  color: var(--ei-text-secondary, #999);
  padding: 4px 0;
}
</style>
