<script setup lang="ts">
import type { DocumentSchema } from '@easyink/schema'
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { LocaleMessages, SampleLibraryProvider, ViewerAdapter, PreferenceProvider } from '../types'
import { onBeforeUnmount, reactive, watch } from 'vue'
import { provideDesignerStore } from '../composables'
import { DesignerStore } from '../store/designer-store'
import { registerBuiltinMaterials } from '../materials/registry'
import TopBarA from './TopBarA.vue'
import TopBarB from './TopBarB.vue'
import CanvasWorkspace from './CanvasWorkspace.vue'
import StatusBar from './StatusBar.vue'
import TemplateLibraryOverlay from './TemplateLibraryOverlay.vue'

const props = defineProps<{
  schema: DocumentSchema
  dataSources?: DataSourceDescriptor[]
  sampleLibrary?: SampleLibraryProvider
  viewerAdapter?: ViewerAdapter
  preferenceProvider?: PreferenceProvider
  locale?: LocaleMessages
}>()

const emit = defineEmits<{
  'update:schema': [schema: DocumentSchema]
}>()

const store = reactive(new DesignerStore(props.schema)) as DesignerStore
provideDesignerStore(store)
registerBuiltinMaterials(store)

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
    <TopBarA />
    <TopBarB />
    <CanvasWorkspace />
    <StatusBar />
    <TemplateLibraryOverlay v-if="store.workbench.templateLibrary.phase !== 'closed'" />
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
