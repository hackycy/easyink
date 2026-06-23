<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * EiPopover: lightweight anchor-positioned popover.
 *
 * Renders the trigger via the default slot and the floating panel via
 * the `content` slot. Positioning is `position: fixed` relative to the
 * trigger's bounding rect; click-outside (capturing phase) closes it.
 *
 * The panel is mounted inside the component (not teleported) — sufficient
 * for toolbar usage where the parent has no overflow:hidden traps.
 */

const props = withDefaults(
  defineProps<{
    open: boolean
    placement?: 'bottom-start' | 'bottom-end'
    offset?: number
  }>(),
  {
    placement: 'bottom-start',
    offset: 4,
  },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const triggerRef = ref<HTMLElement | null>(null)
const panelRef = ref<HTMLElement | null>(null)
const pos = ref({ top: 0, left: 0, availableHeight: 320 })

async function compute() {
  const el = triggerRef.value
  if (!el)
    return
  const r = el.getBoundingClientRect()
  pos.value = {
    ...pos.value,
    top: r.bottom + props.offset,
    left: props.placement === 'bottom-end'
      ? r.right - (panelRef.value?.offsetWidth ?? 0)
      : r.left,
  }
  await nextTick()
  if (!props.open || !triggerRef.value || !panelRef.value)
    return

  const rect = triggerRef.value.getBoundingClientRect()
  const panel = panelRef.value
  const margin = 8
  const gap = props.offset
  const panelHeight = panel.offsetHeight
  const panelWidth = panel.offsetWidth
  const spaceBelow = window.innerHeight - rect.bottom - margin
  const spaceAbove = rect.top - margin
  const shouldFlip = spaceBelow < panelHeight && spaceAbove > spaceBelow
  const availableHeight = Math.max(96, (shouldFlip ? spaceAbove : spaceBelow) - gap)
  const renderedHeight = Math.min(panelHeight, availableHeight)

  let top = shouldFlip ? rect.top - renderedHeight - gap : rect.bottom + gap
  top = Math.max(margin, Math.min(top, window.innerHeight - renderedHeight - margin))

  let left = props.placement === 'bottom-end'
    ? rect.right - panelWidth
    : rect.left
  left = Math.max(margin, Math.min(left, window.innerWidth - panelWidth - margin))

  pos.value = { top, left, availableHeight }
}

function onDocPointerDown(ev: PointerEvent) {
  if (!props.open)
    return
  const target = ev.target as Node | null
  if (!target)
    return
  if (panelRef.value && panelRef.value.contains(target))
    return
  if (triggerRef.value && triggerRef.value.contains(target))
    return
  emit('update:open', false)
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      requestAnimationFrame(() => {
        void compute()
      })
      window.addEventListener('pointerdown', onDocPointerDown, true)
      window.addEventListener('resize', compute)
      window.addEventListener('scroll', compute, true)
    }
    else {
      window.removeEventListener('pointerdown', onDocPointerDown, true)
      window.removeEventListener('resize', compute)
      window.removeEventListener('scroll', compute, true)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('pointerdown', onDocPointerDown, true)
  window.removeEventListener('resize', compute)
  window.removeEventListener('scroll', compute, true)
})

const panelStyle = computed(() => ({
  'position': 'fixed' as const,
  'top': `${pos.value.top}px`,
  'left': `${pos.value.left}px`,
  'zIndex': 9999,
  '--ei-popover-available-height': `${pos.value.availableHeight}px`,
}))
</script>

<template>
  <div ref="triggerRef" class="ei-popover-trigger">
    <slot />
    <div v-if="props.open" ref="panelRef" class="ei-popover-panel" :style="panelStyle">
      <slot name="content" />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ei-popover-trigger {
  display: inline-flex;
  align-items: center;
}

.ei-popover-panel {
  background: var(--ei-bg-elevated, #fff);
  border: 1px solid var(--ei-border-color, #d9d9d9);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  padding: 8px;
  min-width: 180px;
  max-height: var(--ei-popover-available-height, calc(100vh - 16px));
  overflow: auto;
}
</style>
