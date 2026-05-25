<script setup lang="ts">
import type { EditorSurfacePlan } from '@easyink/core'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'
import { resolvePageBreakRulers } from './page-break-ruler'

const props = defineProps<{
  surfacePlan: EditorSurfacePlan
}>()

const store = useDesignerStore()

const rulers = computed(() => {
  const unit = store.schema.unit
  return resolvePageBreakRulers(props.surfacePlan).map(ruler => ({
    key: ruler.key,
    style: {
      left: `${ruler.x}${unit}`,
      top: `${ruler.y}${unit}`,
      width: `${ruler.width}${unit}`,
    },
  }))
})
</script>

<template>
  <div
    v-for="ruler in rulers"
    :key="ruler.key"
    class="ei-page-break-ruler"
    :style="ruler.style"
    aria-hidden="true"
  >
    <span class="ei-page-break-ruler__line" />
    <span class="ei-page-break-ruler__cap ei-page-break-ruler__cap--left" />
    <span class="ei-page-break-ruler__cap ei-page-break-ruler__cap--right" />
    <span class="ei-page-break-ruler__pointer ei-page-break-ruler__pointer--left" />
    <span class="ei-page-break-ruler__pointer ei-page-break-ruler__pointer--right" />
  </div>
</template>

<style scoped lang="scss">
.ei-page-break-ruler {
  --ei-page-break-ruler-color: var(--ei-page-break-color, rgba(24, 144, 255, 0.72));
  --ei-page-break-ruler-soft: rgba(24, 144, 255, 0.12);

  position: absolute;
  height: 0;
  pointer-events: none;
  z-index: 15;
}

.ei-page-break-ruler__line {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 1px;
  transform: translateY(-50%);
  background-image: repeating-linear-gradient(
    to right,
    var(--ei-page-break-ruler-color) 0,
    var(--ei-page-break-ruler-color) 6px,
    transparent 6px,
    transparent 10px
  );
}

.ei-page-break-ruler__cap {
  position: absolute;
  top: 0;
  width: 1px;
  height: 14px;
  transform: translateY(-50%);
  background: var(--ei-page-break-ruler-color);
  box-shadow: 0 0 0 2px var(--ei-page-break-ruler-soft);
}

.ei-page-break-ruler__cap--left {
  left: 0;
}

.ei-page-break-ruler__cap--right {
  right: 0;
}

.ei-page-break-ruler__pointer {
  position: absolute;
  top: 0;
  width: 10px;
  height: 10px;
  transform: translateY(-50%);
  background: var(--ei-page-break-ruler-color);
}

.ei-page-break-ruler__pointer--left {
  left: -10px;
  clip-path: polygon(0 0, 100% 50%, 0 100%);
}

.ei-page-break-ruler__pointer--right {
  right: -10px;
  clip-path: polygon(100% 0, 0 50%, 100% 100%);
}
</style>
