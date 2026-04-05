<script setup lang="ts">
import { computed } from 'vue'
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

const pageRatio = computed(() => {
  const { width, height } = store.schema.page
  return width / height
})

const minimapWidth = 180
const minimapHeight = computed(() => minimapWidth / pageRatio.value)
</script>

<template>
  <div class="ei-minimap-panel">
    <div
      class="ei-minimap-panel__canvas"
      :style="{ width: `${minimapWidth}px`, height: `${minimapHeight}px` }"
    >
      <div
        v-for="el in store.getElements()"
        :key="el.id"
        class="ei-minimap-panel__element"
        :style="{
          left: `${(el.x / store.schema.page.width) * 100}%`,
          top: `${(el.y / store.schema.page.height) * 100}%`,
          width: `${(el.width / store.schema.page.width) * 100}%`,
          height: `${(el.height / store.schema.page.height) * 100}%`,
        }"
      />
    </div>
  </div>
</template>

<style scoped>
.ei-minimap-panel {
  padding: 8px;
  display: flex;
  justify-content: center;
}

.ei-minimap-panel__canvas {
  background: #fff;
  border: 1px solid var(--ei-border-color, #d0d0d0);
  position: relative;
  overflow: hidden;
}

.ei-minimap-panel__element {
  position: absolute;
  background: var(--ei-primary, #1890ff);
  opacity: 0.3;
  border-radius: 1px;
}
</style>
