<script setup lang="ts">
import type { MaterialConditionDefinition } from '@easyink/core'
import type { MaterialNode, RenderCondition } from '@easyink/schema'
import { IconDelete, IconEdit } from '@easyink/icons'
import { EiButton, EiIcon, EiSwitch } from '@easyink/ui'
import { computed, ref } from 'vue'
import { useDesignerStore } from '../composables'
import ConditionDialog from './ConditionDialog.vue'

const props = defineProps<{
  element: MaterialNode
  capability: MaterialConditionDefinition
  t: (key: string) => string
}>()

const emit = defineEmits<{
  update: [condition: RenderCondition | undefined]
}>()

const store = useDesignerStore()
const dialogOpen = ref(false)
const condition = computed(() => props.element.renderCondition)
const sources = computed(() => store.dataSourceRegistry.getSources())
const groupCount = computed(() => condition.value?.groups.length ?? 0)
const rowCount = computed(() => condition.value?.groups.reduce((total, group) => total + group.conditions.length, 0) ?? 0)
const behaviorSummary = computed(() => {
  const current = condition.value
  if (!current)
    return ''
  if (current.groups.length === 0)
    return current.whenMatched === 'show' ? props.t('designer.condition.alwaysShow') : props.t('designer.condition.alwaysHide')
  const matched = current.whenMatched === 'show' ? props.t('designer.condition.show') : props.t('designer.condition.hide')
  const hidden = (current.whenHidden ?? 'remove') === 'remove' ? props.t('designer.condition.hiddenRemove') : props.t('designer.condition.hiddenReserve')
  return `${props.t('designer.condition.anyGroupMatched')} ${matched} · ${hidden}`
})
const ruleSummary = computed(() => props.t('designer.condition.groupRowSummary')
  .replace('{groups}', String(groupCount.value))
  .replace('{rows}', String(rowCount.value)))

function setEnabled(enabled: boolean) {
  if (condition.value)
    emit('update', { ...condition.value, enabled })
}

function save(next: RenderCondition) {
  emit('update', next)
}
</script>

<template>
  <div class="condition-editor">
    <div v-if="!condition" class="condition-editor__empty">
      <p>{{ t('designer.condition.emptyDescription') }}</p>
      <EiButton size="sm" variant="primary" @click="dialogOpen = true">
        <EiIcon :icon="IconEdit" :size="13" />
        {{ t('designer.condition.configure') }}
      </EiButton>
    </div>
    <template v-else>
      <div class="condition-editor__header">
        <div class="condition-editor__heading">
          <span>{{ t('designer.condition.enabled') }}</span>
          <small>{{ condition.enabled === false ? t('designer.condition.disabledHint') : t('designer.condition.enabledHint') }}</small>
        </div>
        <EiSwitch :model-value="condition.enabled !== false" @update:model-value="setEnabled" />
      </div>
      <div class="condition-editor__summary">
        <strong>{{ behaviorSummary }}</strong>
        <span>{{ ruleSummary }}</span>
      </div>
      <div class="condition-editor__actions">
        <EiButton size="sm" @click="dialogOpen = true">
          <EiIcon :icon="IconEdit" :size="13" />{{ t('designer.condition.edit') }}
        </EiButton>
        <EiButton variant="ghost" size="sm" class="condition-editor__remove" @click="$emit('update', undefined)">
          <EiIcon :icon="IconDelete" :size="13" />{{ t('designer.condition.removeConfig') }}
        </EiButton>
      </div>
    </template>

    <ConditionDialog v-model:open="dialogOpen" :condition="condition" :capability="capability" :sources="sources" :t="t" @confirm="save" />
  </div>
</template>

<style scoped lang="scss">
.condition-editor { display: flex; flex-direction: column; gap: 10px; }
.condition-editor__empty { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.condition-editor__empty p { margin: 0; color: var(--ei-text-secondary, #666); font-size: 12px; line-height: 1.5; }
.condition-editor__header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.condition-editor__heading { display: flex; min-width: 0; flex-direction: column; gap: 2px; font-size: 12px; }
.condition-editor__heading small { color: var(--ei-text-secondary, #999); font-size: 10px; }
.condition-editor__summary { display: flex; flex-direction: column; gap: 3px; padding: 8px; border-radius: 4px; background: var(--ei-hover-bg, #f5f5f5); }
.condition-editor__summary strong { font-size: 11px; font-weight: 500; line-height: 1.4; }
.condition-editor__summary span { color: var(--ei-text-secondary, #777); font-size: 10px; }
.condition-editor__actions { display: flex; gap: 6px; }
.condition-editor__remove { color: var(--ei-danger, #d4380d); }
</style>
