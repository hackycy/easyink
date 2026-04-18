<script setup lang="ts">
import type { DocumentSchema } from '@easyink/schema'
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { LocaleMessages, PreferenceProvider } from '../types'
import { onBeforeUnmount, reactive, watch } from 'vue'
import { provideDesignerStore } from '../composables'
import { useWorkbenchPersistence } from '../composables/use-workbench-persistence'
import { DesignerStore } from '../store/designer-store'
import { registerBuiltinMaterials } from '../materials/registry'
import TopBarB from './TopBarB.vue'
import CanvasWorkspace from './CanvasWorkspace.vue'
import StatusBar from './StatusBar.vue'

const props = defineProps<{
  schema: DocumentSchema
  dataSources?: DataSourceDescriptor[]
  preferenceProvider?: PreferenceProvider
  locale?: LocaleMessages
}>()

const emit = defineEmits<{
  'update:schema': [schema: DocumentSchema]
}>()

const store = reactive(new DesignerStore(props.schema, props.preferenceProvider)) as DesignerStore
// EditingSessionManager was constructed before the reactive proxy existed;
// re-target it at the proxy so mutations made through tx.run trigger Vue
// reactivity (otherwise patches mutate the raw store and templates stay stale).
store.editingSession.setStore(store)
provideDesignerStore(store)
registerBuiltinMaterials(store)

// Wire workbench persistence (debounced save on state changes + flush on unmount)
if (props.preferenceProvider) {
  useWorkbenchPersistence(store.workbench, props.preferenceProvider)
}

if (props.locale) {
  store.setLocale(props.locale)
}

if (props.dataSources) {
  for (const source of props.dataSources) {
    store.dataSourceRegistry.registerSource(source)
  }
}

watch(() => props.schema, (newSchema) => {
  if (newSchema !== store.schema) {
    store.setSchema(newSchema)
  }
})

watch(() => props.locale, (newLocale) => {
  if (newLocale) store.setLocale(newLocale)
})

onBeforeUnmount(() => {
  store.destroy()
})
</script>

<template>
  <div class="ei-designer">
    <slot name="topbar" />
    <TopBarB />
    <CanvasWorkspace />
    <StatusBar />
  </div>
</template>

<style scoped>
.ei-designer {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--ei-bg, #fff);
  color: var(--ei-text, #333);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
  position: relative;
}
</style>
