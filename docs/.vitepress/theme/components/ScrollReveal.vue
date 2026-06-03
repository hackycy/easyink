<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted } from 'vue'

let observer: IntersectionObserver | null = null

onMounted(async () => {
  await nextTick()

  const targets = Array.from(
    document.querySelectorAll<HTMLElement>('.ei-section'),
  )
  if (!targets.length)
    return

  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('ei-visible')
          observer?.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.07, rootMargin: '0px 0px -36px 0px' },
  )

  for (const el of targets) {
    const rect = el.getBoundingClientRect()
    const inView = rect.top < window.innerHeight && rect.bottom > 0
    el.classList.add('ei-reveal')
    if (inView) {
      el.classList.add('ei-visible')
    }
    else {
      observer.observe(el)
    }
  }
})

onBeforeUnmount(() => {
  observer?.disconnect()
})
</script>

<template>
  <span v-if="false" />
</template>
