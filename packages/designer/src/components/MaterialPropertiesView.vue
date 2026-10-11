<script setup lang="ts">
import type { MaterialPropertiesContext } from '@easyink/plugin-api/designer'
import type { ContextComponent } from '@easyink/plugin-api/ui'
import type { ContributionOwner } from '@easyink/plugin-runtime'
import { computed, onBeforeUnmount, onErrorCaptured, ref } from 'vue'
import { useDesignerStore } from '../composables'

const props = defineProps<{ declaration: ContextComponent<MaterialPropertiesContext>, owner: ContributionOwner, nodeId: string }>()
const store = useDesignerStore()
const root = ref<HTMLElement | null>(null)
const mount = store.mountPropertiesContext(props.owner, props.nodeId, () => root.value)
const failed = ref(false)
onBeforeUnmount(() => {
  void mount.dispose()
})

function fail(cause: unknown) {
  if (failed.value)
    return
  failed.value = true
  if (!mount.context.signal.aborted)
    store.diagnostics.push({ source: 'material-extension', severity: 'error', message: `Material properties failed: ${props.owner.pluginId}`, detail: { cause, nodeId: props.nodeId } })
  void mount.dispose()
}
const businessProps = computed(() => {
  try {
    const { context: _reserved, ...business } = { ...props.declaration.props, ...props.declaration.getProps?.(mount.context) }
    return business
  }
  catch (cause) {
    fail(cause)
    return {}
  }
})
onErrorCaptured((cause) => {
  fail(cause)
  return false
})
</script>

<template>
  <div ref="root" class="ei-material-properties">
    <span v-if="failed" role="status">Extension unavailable.</span>
    <component :is="declaration.component" v-else-if="!failed" v-bind="businessProps" :context="mount.context" />
  </div>
</template>
