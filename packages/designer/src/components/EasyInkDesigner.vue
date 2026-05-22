<script setup lang="ts">
import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema, DocumentSchemaInput } from '@easyink/schema'
import type { Contribution } from '../contributions'
import type { DesignerInteractionProvider, LocaleMessages, PreferenceProvider, StatusBarState, StoreSetup, TemplateAutoSaveOptions } from '../types'
import { builtinDesignerMaterialBundle } from '@easyink/builtin'
import { onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch } from 'vue'
import { provideDesignerStore } from '../composables'
import { useTemplateAutoSave } from '../composables/use-template-autosave'
import { useWorkbenchPersistence } from '../composables/use-workbench-persistence'
import { ContributionRegistry } from '../contributions/contribution-registry'
import { CONTRIBUTION_REGISTRY_KEY } from '../contributions/injection'
import { registerMaterialBundle } from '../materials/registry'
import { DesignerStore } from '../store/designer-store'
import CanvasWorkspace from './CanvasWorkspace.vue'
import DesignerConfirmHost from './DesignerConfirmHost.vue'
import StatusBar from './StatusBar.vue'
import TopBarB from './TopBarB.vue'

const props = defineProps<{
  schema?: DocumentSchemaInput
  dataSources?: DataSourceDescriptor[]
  preferenceProvider?: PreferenceProvider
  autoSave?: TemplateAutoSaveOptions
  locale?: LocaleMessages
  setupStore?: StoreSetup
  contributions?: Contribution[]
  interactionProvider?: DesignerInteractionProvider
}>()

const emit = defineEmits<{
  'update:schema': [schema: DocumentSchema]
}>()

const designerRootRef = ref<HTMLElement | null>(null)
const store = reactive(new DesignerStore(props.schema, props.preferenceProvider, props.interactionProvider)) as DesignerStore
if (store.schema !== props.schema) {
  emit('update:schema', store.schema)
}
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

const templateAutoSave = useTemplateAutoSave(store, () => props.autoSave)

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
    templateAutoSave.markSchemaLoaded()
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

watch(() => props.interactionProvider, (newProvider) => {
  store.interactions.setProvider(newProvider)
})

function getFocusStateFromTarget(target: EventTarget | null): StatusBarState['focus'] {
  if (!(target instanceof Element))
    return 'none'

  if (target.closest('.ei-dialog, .ei-dialog-overlay'))
    return 'dialog'

  const root = designerRootRef.value
  if (!root || !root.contains(target))
    return 'none'

  if (target.closest('.ei-workspace-window, .ei-topbar-b'))
    return 'panel'

  if (target.closest('.ei-canvas-scroll, .ei-canvas-page, .ei-canvas-rulers'))
    return 'canvas'

  return 'none'
}

function syncFocusState(target: EventTarget | null): void {
  store.setFocusState(getFocusStateFromTarget(target))
}

function handleGlobalPointerDown(event: PointerEvent): void {
  syncFocusState(event.target)
}

function handleGlobalFocusIn(event: FocusEvent): void {
  const focusState = getFocusStateFromTarget(event.target)
  if (focusState !== 'none')
    store.setFocusState(focusState)
}

function handleWindowBlur(): void {
  store.setFocusState('none')
}

onMounted(() => {
  window.addEventListener('pointerdown', handleGlobalPointerDown, true)
  window.addEventListener('focusin', handleGlobalFocusIn, true)
  window.addEventListener('blur', handleWindowBlur)
})

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', handleGlobalPointerDown, true)
  window.removeEventListener('focusin', handleGlobalFocusIn, true)
  window.removeEventListener('blur', handleWindowBlur)
  contributionRegistry.value.dispose()
  store.destroy()
})
</script>

<template>
  <div ref="designerRootRef" class="ei-designer">
    <slot name="topbar" />
    <TopBarB />
    <CanvasWorkspace />
    <StatusBar />
    <DesignerConfirmHost />

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
