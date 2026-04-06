<script setup lang="ts">
import { useDesignerStore } from '../composables'

const store = useDesignerStore()

function toggleMaterials() {
  const win = store.workbench.windows.find(w => w.kind === 'materials')
  if (win) win.visible = !win.visible
}

function openTemplateLibrary() {
  store.workbench.templateLibrary.phase = 'opening'
}
</script>

<template>
  <div class="ei-topbar-a">
    <div class="ei-topbar-a__logo">
      EasyInk
    </div>

    <button class="ei-topbar-a__action" @click="toggleMaterials">
      {{ store.t('designer.panel.materials') }}
    </button>

    <div class="ei-topbar-a__actions">
      <button class="ei-topbar-a__action" @click="openTemplateLibrary">
        {{ store.t('designer.templateLibrary.title') }}
      </button>
      <button class="ei-topbar-a__action" @click="store.workbench.preview.visible = true">
        {{ store.t('designer.toolbar.preview') }}
      </button>
      <button class="ei-topbar-a__action">
        {{ store.t('designer.toolbar.save') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.ei-topbar-a {
  display: flex;
  align-items: center;
  height: 40px;
  padding: 0 12px;
  border-bottom: 1px solid var(--ei-border-color, #e0e0e0);
  background: var(--ei-topbar-bg, #fff);
  gap: 8px;
}

.ei-topbar-a__logo {
  font-weight: 700;
  font-size: 16px;
  color: var(--ei-primary, #1890ff);
  margin-right: 12px;
  user-select: none;
}

.ei-topbar-a__action {
  padding: 4px 10px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  cursor: pointer;
  font-size: 13px;
  color: var(--ei-text, #333);
  white-space: nowrap;
}

.ei-topbar-a__action:hover {
  background: var(--ei-hover-bg, #f0f0f0);
}

.ei-topbar-a__actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}
</style>
