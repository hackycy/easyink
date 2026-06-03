<script setup lang="ts">
import { useRoute } from 'vitepress'
import { onBeforeUnmount, onMounted } from 'vue'

const route = useRoute()

let bgEl: HTMLDivElement | null = null

onMounted(() => {
  if (route.data.relativePath !== 'index.md')
    return

  const home = document.querySelector<HTMLElement>('.VPHome')
  if (!home)
    return

  bgEl = document.createElement('div')
  bgEl.className = 'ei-print-atmosphere'
  bgEl.setAttribute('aria-hidden', 'true')
  bgEl.innerHTML = `
    <span class="ei-atmosphere-sheet ei-atmosphere-sheet--one"></span>
    <span class="ei-atmosphere-sheet ei-atmosphere-sheet--two"></span>
    <span class="ei-atmosphere-tick ei-atmosphere-tick--one"></span>
    <span class="ei-atmosphere-tick ei-atmosphere-tick--two"></span>
  `

  home.insertBefore(bgEl, home.firstChild)
})

onBeforeUnmount(() => {
  bgEl?.remove()
})
</script>

<template>
  <span v-if="false" />
</template>
