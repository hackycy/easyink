<script setup lang="ts">
import type { SelectionDecorationDef } from '@easyink/core'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

type SelectionDecorationLayer = NonNullable<SelectionDecorationDef['layer']>

const store = useDesignerStore()
const decorationLayerOrder: SelectionDecorationLayer[] = ['below-content', 'above-content', 'above-handles']

const session = computed(() => store.editingSession.activeSession)

const node = computed(() => {
  const id = session.value?.nodeId
  if (!id)
    return null
  return store.getElementById(id) ?? null
})

const activeDecorations = computed<SelectionDecorationDef[]>(() => {
  if (!session.value || !node.value)
    return []

  const ext = store.getDesignerExtension(node.value.type)
  if (!ext?.decorations)
    return []

  const sel = session.value.selectionStore.selection
  if (!sel)
    return []

  return ext.decorations.filter(d =>
    d.selectionTypes.includes(sel.type),
  )
})

const decorationsByLayer = computed(() => decorationLayerOrder.map((layer) => {
  const decorations = activeDecorations.value.filter(dec => (dec.layer ?? 'above-content') === layer)
  return { layer, decorations }
}))

const decorationRects = computed(() => {
  if (!session.value || !node.value)
    return []

  const sel = session.value.selectionStore.selection
  if (!sel)
    return []

  const ext = store.getDesignerExtension(node.value.type)
  if (!ext?.geometry)
    return []

  return ext.geometry.resolveLocation(sel, node.value)
})

const unit = computed(() => store.schema.unit)
</script>

<template>
  <template v-if="session && node">
    <div class="ei-selection-overlay">
      <div
        v-for="bucket in decorationsByLayer"
        :key="bucket.layer"
        class="ei-selection-overlay__layer"
        :class="`ei-selection-overlay__layer--${bucket.layer}`"
      >
        <component
          :is="dec.component"
          v-for="(dec, i) in bucket.decorations"
          :key="`${bucket.layer}_${i}`"
          :rects="decorationRects"
          :selection="session.selectionStore.selection"
          :node="node"
          :session="session"
          :unit="unit"
        />
      </div>
    </div>
  </template>
</template>

<style scoped lang="scss">
.ei-selection-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ei-selection-overlay__layer {
  position: absolute;
  inset: 0;
  pointer-events: none;

  &--below-content {
    z-index: 999;
  }

  &--above-content {
    z-index: 4000;
  }

  &--above-handles {
    z-index: 1000001;
  }
}
</style>
