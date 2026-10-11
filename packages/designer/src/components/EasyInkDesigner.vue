<script setup lang="ts">
import type { DocumentSchema } from '@easyink/schema'
import type { DesignerCreateOptions, DesignerStore } from '../store/designer-store'
import type { EasyInkDesignerProps } from '../types'
import { builtinLocales } from '@easyink/locales'
import { onBeforeUnmount, shallowRef } from 'vue'
import { DesignerStore as Store } from '../store/designer-store'
import DesignerWorkbench from './DesignerWorkbench.vue'

const props = defineProps<EasyInkDesignerProps>()
const emit = defineEmits<{
  'update:schema': [schema: DocumentSchema]
  'ready': []
  'error': [cause: unknown]
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
  if (props.schema !== options.schema)
    created.setSchema(props.schema)
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
    void store.value.destroy()
})
</script>

<template>
  <DesignerWorkbench v-if="store" v-bind="props" :store="store" @update:schema="emit('update:schema', $event)">
    <template #topbar>
      <slot name="topbar" />
    </template>
  </DesignerWorkbench>
  <div v-else class="ei-designer" :aria-busy="!failure">
    <slot v-if="failure" name="error" :error="failure">
      Designer failed to initialize.
    </slot>
    <slot v-else name="loading" />
  </div>
</template>
