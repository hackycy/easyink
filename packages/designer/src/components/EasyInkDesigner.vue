<script setup lang="ts">
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type { LocaleMessages, PreferenceProvider } from '../types'
import { defineAsyncComponent, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { provideDesignerStore } from '../composables'
import { useWorkbenchPersistence } from '../composables/use-workbench-persistence'
import { registerBuiltinMaterials } from '../materials/registry'
import { DesignerStore } from '../store/designer-store'
import { TemplateHistoryManager } from '../store/template-history'
import CanvasWorkspace from './CanvasWorkspace.vue'
import StatusBar from './StatusBar.vue'
import TopBarB from './TopBarB.vue'

const props = withDefaults(defineProps<{
  schema: DocumentSchema
  dataSources?: DataSourceDescriptor[]
  preferenceProvider?: PreferenceProvider
  locale?: LocaleMessages
  enableMCP?: boolean
}>(), {
  enableMCP: false,
})

const emit = defineEmits<{
  'update:schema': [schema: DocumentSchema]
}>()

// Async component for MCP Panel, loaded from @easyink/mcp on demand
const MCPPanel = defineAsyncComponent(
  () => import('@easyink/mcp').then(m => m.MCPPanel),
)

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

// Template History Manager
const templateHistory = shallowRef(new TemplateHistoryManager())

// MCP Panel state
const showMCPPanel = ref(false)

watch(() => props.schema, (newSchema) => {
  if (newSchema !== store.schema) {
    store.setSchema(newSchema)
  }
})

watch(() => props.locale, (newLocale) => {
  if (newLocale)
    store.setLocale(newLocale)
})

onBeforeUnmount(() => {
  store.destroy()
})

// MCP Panel event handlers
function handleSchemaApply(schema: DocumentSchema, versionId: string) {
  // Save to template history
  templateHistory.value.saveVersion(schema, {
    source: 'mcp',
    prompt: 'MCP generated template',
    metadata: { versionId },
  })

  // Persist MCP history to schema.extensions.mcp
  const enriched: DocumentSchema = {
    ...schema,
    extensions: {
      ...schema.extensions,
      mcp: {
        ...schema.extensions?.mcp,
        currentVersionId: versionId,
        templateHistory: templateHistory.value.exportVersions(),
      },
    },
  }

  // Emit schema update
  emit('update:schema', enriched)

  // Also update store directly
  store.setSchema(enriched)
}

function handleDatasourceRegister(dataSource: DataSourceDescriptor, namespace: string) {
  // Register via Provider Factory pattern
  const factory = {
    id: dataSource.id,
    namespace,
    resolve: async () => dataSource,
  }
  store.dataSourceRegistry.registerProviderFactory(factory)

  // Persist to schema.extensions.mcp
  const currentSchema = store.schema
  const existingDS = currentSchema.extensions?.mcp?.dataSources ?? []

  store.setSchema({
    ...currentSchema,
    extensions: {
      ...currentSchema.extensions,
      mcp: {
        ...currentSchema.extensions?.mcp,
        dataSources: [...existingDS, {
          id: dataSource.id,
          name: dataSource.name,
          tag: dataSource.tag,
          fields: dataSource.fields,
          meta: dataSource.meta,
        }],
        providerFactories: [
          ...(currentSchema.extensions?.mcp?.providerFactories ?? []),
          { id: dataSource.id, namespace },
        ],
      },
    },
  })
}

function handleMCPError(error: { message: string, canRetry: boolean }) {
  console.error('MCP generation error:', error.message)
}

function toggleMCPPanel() {
  showMCPPanel.value = !showMCPPanel.value
}
</script>

<template>
  <div class="ei-designer">
    <slot name="topbar" />
    <TopBarB @toggle-mcp-panel="toggleMCPPanel" />
    <CanvasWorkspace />
    <StatusBar />

    <!-- MCP Panel (conditionally rendered when enabled) -->
    <div
      v-if="enableMCP && showMCPPanel"
      class="ei-designer__mcp-overlay"
    >
      <Suspense>
        <MCPPanel
          :open="showMCPPanel"
          :current-schema="store.schema"
          @update:open="showMCPPanel = $event"
          @schema-apply="handleSchemaApply"
          @datasource-register="handleDatasourceRegister"
          @error="handleMCPError"
        />
        <template #fallback>
          <div class="ei-designer__mcp-loading">
            Loading MCP Panel...
          </div>
        </template>
      </Suspense>
    </div>
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

.ei-designer__mcp-overlay {
  position: fixed;
  inset: 0;
  z-index: 999;
  pointer-events: none;
}

.ei-designer__mcp-overlay > * {
  pointer-events: auto;
}

.ei-designer__mcp-loading {
  position: fixed;
  top: 0;
  right: 0;
  width: 400px;
  height: 100vh;
  background: var(--ei-bg, #fff);
  border-left: 1px solid var(--ei-border, #e5e7eb);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ei-text-secondary, #6b7280);
  font-size: 14px;
}
</style>
