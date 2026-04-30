<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

const unit = computed(() => store.schema.unit)

const verticalLines = computed(() =>
  store.snapActiveLines.filter(l => l.orientation === 'vertical'),
)

const horizontalLines = computed(() =>
  store.snapActiveLines.filter(l => l.orientation === 'horizontal'),
)
</script>

<template>
  <div class="ei-snap-overlay">
    <div
      v-for="(line, i) in verticalLines"
      :key="`v-${i}-${line.source}`"
      class="ei-snap-overlay__line ei-snap-overlay__line--vertical"
      :class="`ei-snap-overlay__line--${line.source}`"
      :style="{
        left: `${line.position}${unit}`,
        top: `${line.from}${unit}`,
        height: `${Math.max(0, line.to - line.from)}${unit}`,
      }"
    />
    <div
      v-for="(line, i) in horizontalLines"
      :key="`h-${i}-${line.source}`"
      class="ei-snap-overlay__line ei-snap-overlay__line--horizontal"
      :class="`ei-snap-overlay__line--${line.source}`"
      :style="{
        top: `${line.position}${unit}`,
        left: `${line.from}${unit}`,
        width: `${Math.max(0, line.to - line.from)}${unit}`,
      }"
    />
  </div>
</template>

<style scoped lang="scss">
.ei-snap-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;

  &__line {
    position: absolute;

    &--vertical {
      width: 0;
      border-left: 1px dashed var(--ei-snap-line-color, #ff4081);
    }

    &--horizontal {
      height: 0;
      border-top: 1px dashed var(--ei-snap-line-color, #ff4081);
    }

    &--grid {
      // grid feedback is subtler — a thinner, more transparent line
      opacity: 0.5;
    }

    &--guide {
      opacity: 0.85;
    }

    &--element {
      opacity: 1;
    }
  }
}
</style>
