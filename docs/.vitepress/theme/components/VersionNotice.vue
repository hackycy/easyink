<script setup lang="ts">
import { useData } from 'vitepress'
import { onMounted, ref } from 'vue'

const { theme } = useData()
const visible = ref(false)
onMounted(() => {
  try {
    visible.value = sessionStorage.getItem('easyink-docs-missing-page') === theme.value.versioning.current
    sessionStorage.removeItem('easyink-docs-missing-page')
  }
  catch { /* Storage is optional. */ }
})
</script>

<template>
  <div v-if="visible" role="status" class="ei-docs-notice">
    该系列没有对应页面，已进入该系列首页。
    <button type="button" aria-label="关闭提示" @click="visible = false">
      关闭
    </button>
  </div>
</template>

<style scoped>
.ei-docs-notice { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); width: max-content; max-width: calc(100% - 32px); padding: 12px 18px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); box-shadow: var(--vp-shadow-2); z-index: 100; font-size: 14px; }
.ei-docs-notice button { margin-left: 12px; color: var(--vp-c-brand-1); }
</style>
