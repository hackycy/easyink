<script setup lang="ts">
import type { EditorSurfacePlan } from '@easyink/core'
import { getEditorSurfacePageLeft, projectDocumentPointToEditorSurface } from '@easyink/core'
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const props = defineProps<{
  surfacePlan: EditorSurfacePlan
}>()

const store = useDesignerStore()

const unit = computed(() => store.schema.unit)

const verticalLines = computed(() =>
  store.snapActiveLines.filter(l => l.orientation === 'vertical').map((line, index) => {
    const page = props.surfacePlan.pages[0]
    const left = page ? getEditorSurfacePageLeft(props.surfacePlan, page) : 0
    const from = projectDocumentPointToEditorSurface(props.surfacePlan, { x: 0, y: line.from })
    const to = projectDocumentPointToEditorSurface(props.surfacePlan, { x: 0, y: line.to })
    return {
      ...line,
      key: `v-${index}-${line.source}`,
      surfacePosition: left + line.position,
      surfaceFrom: Math.min(from.y, to.y),
      surfaceTo: Math.max(from.y, to.y),
    }
  }),
)

const horizontalLines = computed(() =>
  store.snapActiveLines.filter(l => l.orientation === 'horizontal').map((line, index) => {
    const start = projectDocumentPointToEditorSurface(props.surfacePlan, { x: line.from, y: line.position })
    const end = projectDocumentPointToEditorSurface(props.surfacePlan, { x: line.to, y: line.position })
    return {
      ...line,
      key: `h-${index}-${line.source}`,
      surfacePosition: start.y,
      surfaceFrom: Math.min(start.x, end.x),
      surfaceTo: Math.max(start.x, end.x),
    }
  }),
)
</script>

<template>
  <div class="ei-snap-overlay">
    <div
      v-for="line in verticalLines"
      :key="line.key"
      class="ei-snap-overlay__line ei-snap-overlay__line--vertical"
      :class="`ei-snap-overlay__line--${line.source}`"
      :style="{
        left: `${line.surfacePosition}${unit}`,
        top: `${line.surfaceFrom}${unit}`,
        height: `${Math.max(0, line.surfaceTo - line.surfaceFrom)}${unit}`,
      }"
    />
    <div
      v-for="line in horizontalLines"
      :key="line.key"
      class="ei-snap-overlay__line ei-snap-overlay__line--horizontal"
      :class="`ei-snap-overlay__line--${line.source}`"
      :style="{
        top: `${line.surfacePosition}${unit}`,
        left: `${line.surfaceFrom}${unit}`,
        width: `${Math.max(0, line.surfaceTo - line.surfaceFrom)}${unit}`,
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

    &--page {
      // page edges: distinguish with a stronger, dedicated colour
      border-color: var(--ei-snap-page-color, #00bfa5);
      opacity: 0.9;
    }

    &--element {
      opacity: 1;
    }
  }
}
</style>
