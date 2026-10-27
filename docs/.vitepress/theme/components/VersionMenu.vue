<script setup lang="ts">
import type { DocsIndex, VersionConfig } from '../../versioning'
import { useData } from 'vitepress'
import { computed, onMounted, ref } from 'vue'
import { versionLink } from '../../versioning'

const { theme, page } = useData()
const config = computed(() => theme.value.versioning as VersionConfig)
const index = ref<DocsIndex>()
const expanded = ref(false)
const versions = computed(() => index.value?.versions ?? config.value.versions)
const currentLabel = computed(() => versions.value.find(version => version.id === config.value.current)?.label ?? `${config.value.current}.x`)

function destination(id: string) {
  const version = versions.value.find(version => version.id === id)!
  if (!config.value.aggregate || !version.pages)
    return { href: version.base, missing: false }
  return versionLink(version, page.value.relativePath, typeof window === 'undefined' ? '' : window.location.search, typeof window === 'undefined' ? '' : window.location.hash)
}

function follow(event: MouseEvent, id: string) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
    return
  const target = destination(id)
  if (target.missing && config.value.aggregate) {
    try {
      sessionStorage.setItem('easyink-docs-missing-page', id)
    }
    catch { /* Navigation remains available without storage. */ }
  }
  event.preventDefault()
  window.location.assign(target.href)
}

onMounted(async () => {
  try {
    const response = await fetch(`${config.value.root}versions.json`)
    if (!response.ok)
      return
    const data = await response.json() as DocsIndex
    if (Array.isArray(data.versions) && data.versions.every(version => typeof version.id === 'string' && typeof version.base === 'string'))
      index.value = data
  }
  catch { /* The server-rendered homepage links remain usable. */ }
})
</script>

<template>
  <div class="ei-docs-version vp-raw" @keydown.esc="expanded = false">
    <button type="button" :aria-expanded="expanded" @click="expanded = !expanded">
      {{ currentLabel }} <span aria-hidden="true">▾</span>
    </button>
    <div v-if="expanded" class="ei-docs-version-menu" aria-label="文档版本">
      <a
        v-for="version in versions" :key="version.id"
        :href="destination(version.id).href"
        :aria-current="version.id === config.current ? 'true' : undefined"
        @click="follow($event, version.id)"
      >{{ version.label }}</a>
      <a v-if="versions.length === 1" href="https://hackycy.github.io/easyink/docs/">默认系列文档</a>
    </div>
  </div>
</template>

<style scoped>
.ei-docs-version { position: relative; margin-left: 16px; font-size: 14px; }
.ei-docs-version button { padding: 8px; font-weight: 600; }
.ei-docs-version-menu { position: absolute; right: 0; top: 100%; min-width: 140px; padding: 8px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); box-shadow: var(--vp-shadow-2); z-index: 100; }
.ei-docs-version-menu a { display: block; padding: 6px 12px; border-radius: 4px; }
.ei-docs-version-menu a:hover, .ei-docs-version-menu a[aria-current] { color: var(--vp-c-brand-1); background: var(--vp-c-bg-soft); }
@media (max-width: 767px) {
  .ei-docs-version { margin: 0 8px; }
}
</style>
