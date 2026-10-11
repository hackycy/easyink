<script setup lang="ts">
import type { DesignerContext } from '@easyink/plugin-api/designer'
import type { ContextComponent } from '@easyink/plugin-api/ui'
import { computed, ref } from 'vue'
import { useDesignerStore } from '../composables'
import DesignerExtensionView from './DesignerExtensionView.vue'

const store = useDesignerStore()
const root = ref<HTMLElement>()
const panels = computed(() => store.getContributions('designer.overlay').map(entry => ({
  owner: entry.owner,
  panel: entry.value as ContextComponent<DesignerContext> & { id: string },
})))
</script>

<template>
  <div ref="root" class="ei-designer__overlay-root" />
  <template v-if="root">
    <Teleport v-for="entry in panels" :key="entry.panel.id" :to="root">
      <DesignerExtensionView :declaration="entry.panel" :owner="entry.owner" />
    </Teleport>
  </template>
</template>

<style scoped>
.ei-designer__overlay-root { position: fixed; inset: 0; z-index: 999; pointer-events: none; }
.ei-designer__overlay-root :deep(> *) { pointer-events: auto; }
</style>
