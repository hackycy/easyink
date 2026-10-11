import fs from 'node:fs'

const file = 'packages/designer/src/components/EasyInkDesigner.vue'
const original = fs.readFileSync(file, 'utf8')
let workbench = original
workbench = workbench.replace("import type { Contribution } from '../contributions'\n", '')
workbench = workbench.replace(', StoreSetup', '')
workbench = workbench.replace("import { onBeforeUnmount, onMounted, provide, reactive, ref, shallowRef, watch } from 'vue'", "import { onBeforeUnmount, onMounted, ref, watch } from 'vue'")
workbench = workbench.replace("import { ContributionRegistry } from '../contributions/contribution-registry'\n", '')
workbench = workbench.replace("import { CONTRIBUTION_REGISTRY_KEY } from '../contributions/injection'\n", '')
workbench = workbench.replace("import { registerMaterialBundle } from '../materials/registry'\n", '')
workbench = workbench.replace("import { DesignerStore } from '../store/designer-store'", "import type { DesignerStore } from '../store/designer-store'\nimport DesignerExtensionOverlays from './DesignerExtensionOverlays.vue'")
workbench = workbench.replace('  setupStore?: StoreSetup\n  contributions?: Contribution[]\n', '  store: DesignerStore\n')
const start = workbench.indexOf('const store = reactive(')
const end = workbench.indexOf('// Wire workbench persistence', start)
workbench = workbench.slice(0, start) + "const store = props.store\nif (store.schema !== props.schema)\n  emit('update:schema', store.schema)\nprovideDesignerStore(store)\n\n" + workbench.slice(end)
const registryStart = workbench.indexOf('// Contribution registry')
const registryEnd = workbench.indexOf('watch(() => props.schema', registryStart)
workbench = workbench.slice(0, registryStart) + workbench.slice(registryEnd)
const bundleStart = workbench.indexOf('function registerRuntimeMaterialBundles(')
const bundleEnd = workbench.indexOf('watch(() => props.interactionProvider', bundleStart)
workbench = workbench.slice(0, bundleStart) + workbench.slice(bundleEnd)
workbench = workbench.replace('  contributionRegistry.value.dispose()\n  store.destroy()\n', '')
const overlayStart = workbench.indexOf('    <!-- Overlay root')
const overlayEnd = workbench.indexOf('  </div>\n</template>', overlayStart)
workbench = workbench.slice(0, overlayStart) + '    <DesignerExtensionOverlays />\n' + workbench.slice(overlayEnd)
fs.writeFileSync('packages/designer/src/components/DesignerWorkbench.vue', workbench)
fs.writeFileSync(file, `<script setup lang="ts">
import type { DesignerCreateOptions, DesignerStore } from '../store/designer-store'
import type { EasyInkDesignerProps } from '../types'
import type { DocumentSchema } from '@easyink/schema'
import type { DisposeResult } from '@easyink/plugin-runtime'
import { builtinLocales } from '@easyink/locales'
import { onBeforeUnmount, shallowRef } from 'vue'
import { DesignerStore as Store } from '../store/designer-store'
import DesignerWorkbench from './DesignerWorkbench.vue'

const props = defineProps<EasyInkDesignerProps>()
const emit = defineEmits<{
  'update:schema': [schema: DocumentSchema]
  'ready': []
  'error': [cause: unknown]
  'disposed': [result: DisposeResult]
}>()
const store = shallowRef<DesignerStore>()
const failure = shallowRef<unknown>()
let active = true
function localeCode() {
  return props.localeCode ?? Object.entries(builtinLocales).find(([, messages]) => messages === props.locale)?.[0]
}
const options: DesignerCreateOptions = {
  schema: props.schema,
  materials: props.materials,
  extensions: props.extensions,
  locale: { code: localeCode(), messages: props.locale },
  dataSources: props.dataSources,
  fontProvider: props.fontProvider,
  preferenceProvider: props.preferenceProvider,
  interactionProvider: props.interactionProvider,
  runtimeConfig: props.runtimeConfig,
}
void Store.create(options).then(async (created) => {
  if (!active) {
    await created.destroy()
    return
  }
  store.value = created
  emit('ready')
}).catch((cause) => {
  if (active) {
    failure.value = cause
    emit('error', cause)
  }
})
onBeforeUnmount(() => {
  active = false
  if (store.value)
    void store.value.destroy().then(result => emit('disposed', result))
})
</script>

<template>
  <DesignerWorkbench v-if="store" v-bind="props" :store="store" @update:schema="emit('update:schema', $event)">
    <template #topbar><slot name="topbar" /></template>
  </DesignerWorkbench>
  <div v-else class="ei-designer" :aria-busy="!failure">
    <slot v-if="failure" name="error" :error="failure">Designer failed to initialize.</slot>
    <slot v-else name="loading" />
  </div>
</template>
`)
