<script setup lang="ts">
import type { DataFieldNode, DataSourceDescriptor } from '@easyink/datasource'
import type { DatasourceFieldDragData } from '../composables/use-datasource-drop'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'
import { DATASOURCE_DRAG_MIME } from '../composables/use-datasource-drop'

const store = useDesignerStore()

const sources = computed<DataSourceDescriptor[]>(() => {
  return store.dataSourceRegistry.getSources()
})

const hasData = computed(() => sources.value.length > 0)

function onFieldDragStart(e: DragEvent, source: DataSourceDescriptor, field: DataFieldNode) {
  if (!e.dataTransfer)
    return
  const data: DatasourceFieldDragData = {
    sourceId: source.id,
    sourceName: source.name,
    sourceTag: source.tag,
    fieldPath: field.path || field.name,
    fieldKey: field.key,
    fieldLabel: field.title || field.name,
    use: field.use,
  }
  e.dataTransfer.setData(DATASOURCE_DRAG_MIME, JSON.stringify(data))
  e.dataTransfer.effectAllowed = 'link'
}
</script>

<template>
  <div class="ei-datasource-panel">
    <div v-if="hasData" class="ei-datasource-panel__list">
      <div
        v-for="source in sources"
        :key="source.id"
        class="ei-datasource-panel__source"
      >
        <div class="ei-datasource-panel__source-name">
          {{ source.title || source.name }}
        </div>
        <div
          v-for="field in source.fields"
          :key="field.name"
          class="ei-datasource-panel__field"
          draggable="true"
          @dragstart="onFieldDragStart($event, source, field)"
        >
          <span class="ei-datasource-panel__field-name">{{ field.title || field.name }}</span>
          <span v-if="field.use" class="ei-datasource-panel__field-use">{{ field.use }}</span>
        </div>
      </div>
    </div>
    <div v-else class="ei-datasource-panel__empty">
      {{ store.t('designer.dataSource.empty') }}
    </div>
    <div class="ei-datasource-panel__hint">
      {{ store.t('designer.dataSource.dragHint') }}
    </div>
  </div>
</template>

<style scoped>
.ei-datasource-panel {
  font-size: 12px;
  padding: 4px;
}

.ei-datasource-panel__source {
  margin-bottom: 8px;
}

.ei-datasource-panel__source-name {
  font-weight: 500;
  padding: 4px 0;
  color: var(--ei-text, #333);
}

.ei-datasource-panel__field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 3px 8px;
  cursor: grab;
  border-radius: 3px;
}

.ei-datasource-panel__field:hover {
  background: var(--ei-hover-bg, #f0f0f0);
}

.ei-datasource-panel__field-name {
  color: var(--ei-text, #333);
}

.ei-datasource-panel__field-use {
  color: var(--ei-text-secondary, #999);
  font-size: 11px;
}

.ei-datasource-panel__empty {
  color: var(--ei-text-secondary, #999);
  text-align: center;
  padding: 20px;
}

.ei-datasource-panel__hint {
  color: var(--ei-text-secondary, #999);
  font-size: 11px;
  text-align: center;
  padding: 8px;
  border-top: 1px solid var(--ei-border-color, #eee);
  margin-top: 4px;
}
</style>
