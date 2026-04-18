<script setup lang="ts">
import type { SelectionDecorationDef } from '@easyink/core'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

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
    <component
      :is="dec.component"
      v-for="(dec, i) in activeDecorations"
      :key="i"
      :rects="decorationRects"
      :selection="session.selectionStore.selection"
      :node="node"
      :session="session"
      :unit="unit"
    />
  </template>
</template>
