<script setup lang="ts">
import type { DesignerContext } from '@easyink/plugin-api/designer'
import type { ContextComponent } from '@easyink/plugin-api/ui'
import type { ContributionOwner } from '@easyink/plugin-runtime'
import { computed, onBeforeUnmount, onErrorCaptured, ref } from 'vue'
import { useDesignerStore } from '../composables'

const props = defineProps<{ declaration: ContextComponent<DesignerContext>, owner: ContributionOwner }>()
const store = useDesignerStore()
const mount = store.mountUIContext(props.owner)
const context = mount.context
onBeforeUnmount(() => {
  void mount.dispose()
})
const failed = ref(false)
function fail(cause: unknown) {
  failed.value = true
  if (context.signal.aborted)
    return
  context.reportDiagnostic({ code: 'extension-ui', message: `Extension UI failed: ${props.owner.pluginId}`, cause })
  void mount.dispose()
}
const businessProps = computed(() => {
  try {
    const { context: _reserved, ...business } = { ...props.declaration.props, ...props.declaration.getProps?.(context) }
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
  <span v-if="failed" role="status">Extension unavailable.</span>
  <component :is="declaration.component" v-else-if="!failed" v-bind="businessProps" :context="context" />
</template>
