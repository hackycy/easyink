<script setup lang="ts">
import type { DesignerContext } from '@easyink/plugin-api/designer'
import type { ContextComponent } from '@easyink/plugin-api/ui'
import type { ContributionOwner } from '@easyink/plugin-runtime'
import { computed, onErrorCaptured, ref } from 'vue'
import { useDesignerStore } from '../composables'

const props = defineProps<{ declaration: ContextComponent<DesignerContext>, owner: ContributionOwner }>()
const store = useDesignerStore()
const context = store.getExtensionContext(props.owner)
const failed = ref(false)
function fail(cause: unknown) {
  failed.value = true
  if (context.signal.aborted)
    return
  context.reportDiagnostic({ code: 'extension-ui', message: `Extension UI failed: ${props.owner.pluginId}`, cause })
}
const businessProps = computed(() => {
  try {
    return { ...props.declaration.props, ...props.declaration.getProps?.(context) }
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
  <component :is="declaration.component" v-else v-bind="businessProps" :context="context" />
</template>
