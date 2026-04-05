<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

const unit = computed(() => store.schema.unit)

const xLines = computed(() =>
  store.workbench.snap.activeLines.filter(l => l.axis === 'x'),
)

const yLines = computed(() =>
  store.workbench.snap.activeLines.filter(l => l.axis === 'y'),
)
</script>

<template>
  <div class="ei-snap-overlay">
    <div
      v-for="(line, i) in xLines"
      :key="`x-${i}`"
      class="ei-snap-overlay__line ei-snap-overlay__line--vertical"
      :style="{ left: `${line.position}${unit}` }"
    />
    <div
      v-for="(line, i) in yLines"
      :key="`y-${i}`"
      class="ei-snap-overlay__line ei-snap-overlay__line--horizontal"
      :style="{ top: `${line.position}${unit}` }"
    />
  </div>
</template>

<style scoped>
.ei-snap-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
}

.ei-snap-overlay__line {
  position: absolute;
}

.ei-snap-overlay__line--vertical {
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px dashed var(--ei-snap-line-color, #ff4081);
}

.ei-snap-overlay__line--horizontal {
  left: 0;
  right: 0;
  height: 0;
  border-top: 1px dashed var(--ei-snap-line-color, #ff4081);
}
</style>
