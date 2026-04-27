<script setup lang="ts">
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type { Contribution } from '../contributions'
import type { LocaleMessages, PreferenceProvider, StoreSetup } from '../types'
import { builtinDesignerMaterialBundle } from '@easyink/builtin'
import { onBeforeUnmount, provide, reactive, shallowRef, watch } from 'vue'
import { provideDesignerStore } from '../composables'
import { useWorkbenchPersistence } from '../composables/use-workbench-persistence'
import { ContributionRegistry } from '../contributions/contribution-registry'
import { CONTRIBUTION_REGISTRY_KEY } from '../contributions/injection'
import { registerMaterialBundle } from '../materials/registry'
import { DesignerStore } from '../store/designer-store'
import CanvasWorkspace from './CanvasWorkspace.vue'
import StatusBar from './StatusBar.vue'
import TopBarB from './TopBarB.vue'

const props = defineProps<{
  schema: DocumentSchema
  dataSources?: DataSourceDescriptor[]
  preferenceProvider?: PreferenceProvider
  locale?: LocaleMessages
  setupStore?: StoreSetup
  contributions?: Contribution[]
}>()

const emit = defineEmits<{
  'update:schema': [schema: DocumentSchema]
}>()

const store = reactive(new DesignerStore(props.schema, props.preferenceProvider)) as DesignerStore
// EditingSessionManager was constructed before the reactive proxy existed;
// re-target it at the proxy so mutations made through tx.run trigger Vue
// reactivity (otherwise patches mutate the raw store and templates stay stale).
store.editingSession.setStore(store)
registerMaterialBundle(store, builtinDesignerMaterialBundle)
props.setupStore?.(store)
provideDesignerStore(store)

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

// Contribution registry (panels / toolbar actions / commands)
const contributionRegistry = shallowRef(new ContributionRegistry())
if (props.contributions && props.contributions.length > 0) {
  contributionRegistry.value.activate(props.contributions, store)
}
provide(CONTRIBUTION_REGISTRY_KEY, {
  registry: contributionRegistry.value,
  // Lazy access — only resolved when a toolbar action is clicked, by which
  // point at least one contribution must have been activated.
  get context() {
    return contributionRegistry.value.context
  },
})

watch(() => props.schema, (newSchema) => {
  if (newSchema !== store.schema) {
    store.setSchema(newSchema)
  }
})

// Sync schema replacement back to the parent so `v-model:schema` reflects
// programmatic mutations (e.g. AI generation calling `store.setSchema`).
// In-place mutations of the same object reach the parent automatically
// because props are passed by reference; this watcher only fires when the
// internal _schema is reassigned to a new object identity.
watch(() => store.schema, (newSchema) => {
  if (newSchema !== props.schema) {
    emit('update:schema', newSchema)
  }
})

watch(() => props.locale, (newLocale) => {
  if (newLocale)
    store.setLocale(newLocale)
})

onBeforeUnmount(() => {
  contributionRegistry.value.dispose()
  store.destroy()
})
</script>

<template>
  <div class="ei-designer">
    <slot name="topbar" />
    <TopBarB />
    <CanvasWorkspace />
    <StatusBar />

    <!-- Overlay root for contribution-registered panels (Vue Teleport target). -->
    <div id="ei-overlay-root" class="ei-designer__overlay-root" />

    <!-- Mount registered panels via Teleport. The contribution owns layout.
         `defer` waits for the overlay-root sibling above to be mounted. -->
    <template
      v-for="panel in contributionRegistry.panels"
      :key="panel.id"
    >
      <Teleport defer :to="panel.teleportTarget ?? '#ei-overlay-root'">
        <component
          :is="panel.component"
          v-bind="{ store, ...(panel.props ?? {}) }"
        />
      </Teleport>
    </template>
  </div>
</template>

<style scoped lang="scss">
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

  &__overlay-root {
    position: fixed;
    inset: 0;
    z-index: 999;
    pointer-events: none;

    > * {
      pointer-events: auto;
    }
  }
}
</style>
