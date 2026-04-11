<script setup lang="ts">
import type { Component } from 'vue'
import type { PanelSectionId, PropSchema } from '../types'
import type { PagePropertyContext, PagePropertyDescriptor, PagePropertyGroup } from '../page-properties'
import { ClearBindingCommand, getByPath, UpdateDocumentCommand, UpdateMaterialPropsCommand, UpdatePageCommand, UpdateTableVisibilityCommand } from '@easyink/core'
import { PAPER_PRESETS } from '@easyink/shared'
import { isTableNode } from '@easyink/schema'
import { EiInput, EiPanel, EiSwitch } from '@easyink/ui'
import { computed, shallowRef, watch, watchEffect } from 'vue'
import { useDesignerStore } from '../composables'
import { getPropSchemas, groupPropSchemas } from '../materials/prop-schemas'
import { defaultDocumentPatch, defaultPagePatch, filterVisible, groupDescriptors, PAGE_PROPERTY_DESCRIPTORS, readPageProperty, splitPatch } from '../page-properties'
import BindingSection from './BindingSection.vue'
import PagePropertyEditor from './PagePropertyEditor.vue'
import PropSchemaEditor from './PropSchemaEditor.vue'

const store = useDesignerStore()

const selectedElements = computed(() => {
  const ids = store.selection.ids
  return ids.map(id => store.getElementById(id)).filter(Boolean)
})

const selectedElement = computed(() =>
  selectedElements.value.length === 1 ? selectedElements.value[0] : undefined,
)

// ─── Property Panel Overlay ────────────────────────────────────

const overlay = computed(() => store.propertyOverlay)

// Auto-clear overlay when deep editing state changes
watch(
  () => ({
    nodeId: store.deepEditing.nodeId,
    phase: store.deepEditing.currentPhase,
  }),
  (newState, oldState) => {
    if (!newState.nodeId || newState.nodeId !== oldState?.nodeId
      || newState.phase !== oldState?.phase) {
      store.setPropertyOverlay(null)
    }
  },
  { flush: 'sync' },
)

// Overlay schemas grouped by group field
const overlayGroupedSchemas = computed(() => {
  if (!overlay.value)
    return new Map<string, PropSchema[]>()
  return groupPropSchemas(overlay.value.schemas as PropSchema[])
})

function readOverlayValue(schema: PropSchema): unknown {
  return overlay.value?.readValue(schema.key)
}

function readOverlayInheritedValue(schema: PropSchema): unknown {
  return overlay.value?.readInheritedValue?.(schema.key)
}

function updateOverlayProp(key: string, value: unknown) {
  overlay.value?.writeValue(key, value)
}

function clearOverlayOverride(key: string) {
  overlay.value?.clearOverride?.(key)
}

const overlayCustomEditors = computed<Record<string, Component> | undefined>(() => {
  return overlay.value?.editors as Record<string, Component> | undefined
})

// ─── BindingSection context ─────────────────────────────────────

/** Whether the overlay explicitly defines a binding context */
const hasOverlayBinding = computed(() =>
  overlay.value !== null && overlay.value !== undefined && 'binding' in overlay.value,
)

/** Should the BindingSection be hidden entirely? */
const hideBindingSection = computed(() => {
  // Overlay explicitly hides binding
  if (hasOverlayBinding.value && overlay.value?.binding === null)
    return true
  // Material has no bindable capability and no overlay binding
  if (!hasOverlayBinding.value && selectedElement.value) {
    const def = store.getMaterial(selectedElement.value.type)
    if (def?.capabilities.bindable === false)
      return true
  }
  return false
})

function handleClearExternalBinding(bindIndex?: number) {
  overlay.value?.clearBinding?.(bindIndex)
}

// ─── Section Filter ─────────────────────────────────────────────────

function isSectionVisible(sectionId: PanelSectionId): boolean {
  const el = selectedElement.value
  if (!el)
    return true
  const def = store.getMaterial(el.type)
  if (!def?.sectionFilter)
    return true
  return def.sectionFilter(sectionId, {
    node: el,
    deepEditing: store.deepEditing,
  })
}

// ─── Page property descriptor system ─────────────────────────────

const pagePropertyContext = computed<PagePropertyContext>(() => ({
  document: store.schema,
  rawPage: store.schema.compat?.passthrough as Record<string, unknown> | undefined,
  selectedElementId: selectedElement.value?.id,
}))

const visiblePageDescriptors = computed(() =>
  filterVisible(PAGE_PROPERTY_DESCRIPTORS, pagePropertyContext.value),
)

const groupedPageDescriptors = computed(() =>
  groupDescriptors(visiblePageDescriptors.value),
)

// Derive paper preset from current width/height
const currentPaperPreset = computed(() => {
  const { width, height } = store.schema.page
  const match = PAPER_PRESETS.find(p => p.width === width && p.height === height)
  return match ? match.name : 'custom'
})

function readPagePropValue(descriptor: PagePropertyDescriptor): unknown {
  // Special: paperPreset is derived from width/height
  if (descriptor.id === 'paperPreset') {
    return currentPaperPreset.value
  }
  return readPageProperty(descriptor, pagePropertyContext.value)
}

const PAGE_GROUP_LABELS: Record<PagePropertyGroup, string> = {
  document: 'designer.page.groupDocument',
  paper: 'designer.page.groupPaper',
  print: 'designer.page.groupPrint',
  assist: 'designer.page.groupAssist',
  background: 'designer.page.groupBackground',
}

function pageGroupLabel(group: PagePropertyGroup): string {
  return store.t(PAGE_GROUP_LABELS[group])
}

function onPagePropertyChange(descriptor: PagePropertyDescriptor, value: unknown) {
  const ctx = pagePropertyContext.value
  const patch = descriptor.normalize
    ? descriptor.normalize(value, ctx)
    : descriptor.source === 'document'
      ? defaultDocumentPatch(descriptor.path, value)
      : defaultPagePatch(descriptor.path, value)

  const { pageUpdates, documentUpdates } = splitPatch(patch)

  if (pageUpdates && Object.keys(pageUpdates).length > 0) {
    const cmd = new UpdatePageCommand(store.schema.page, pageUpdates)
    store.commands.execute(cmd)
  }

  if (documentUpdates && Object.keys(documentUpdates).length > 0) {
    const cmd = new UpdateDocumentCommand(store.schema, documentUpdates)
    store.commands.execute(cmd)
  }
}

// ─── Element PropSchema ──────────────────────────────────────────

const materialSchemas = computed<PropSchema[]>(() => {
  if (!selectedElement.value)
    return []
  const def = store.getMaterial(selectedElement.value.type)
  if (def && def.props.length > 0)
    return def.props
  return getPropSchemas(selectedElement.value.type)
})

const visibleSchemas = computed(() => {
  const el = selectedElement.value
  if (!el)
    return []
  const elProps = el.props as Record<string, unknown>
  return materialSchemas.value.filter(s => !s.visible || s.visible(elProps))
})

const groupedSchemas = computed(() => groupPropSchemas(visibleSchemas.value))

// Font list from FontManager (async)
const fontList = shallowRef<Array<{ family: string, displayName: string }>>([])
const fontManager = (store as unknown as Record<string, unknown>).fontManager
watchEffect(async () => {
  if (fontManager && typeof (fontManager as { listFonts?: () => Promise<unknown> }).listFonts === 'function') {
    try {
      const fonts = await (fontManager as { listFonts: () => Promise<Array<{ family: string, displayName: string }>> }).listFonts()
      fontList.value = fonts
    }
    catch {
      fontList.value = []
    }
  }
})

// Group label i18n
const GROUP_LABELS: Record<string, string> = {
  content: 'designer.property.content',
  typography: 'designer.property.typography',
  appearance: 'designer.property.appearance',
  border: 'designer.property.border',
  layout: 'designer.property.layout',
  general: 'designer.property.style',
  'table-border': 'designer.property.border',
  'table-layout': 'designer.property.layout',
  'table-typography': 'designer.property.typography',
  'table-appearance': 'designer.property.appearance',
  'cell-typography': 'designer.property.typography',
  'cell-border': 'designer.property.border',
  'cell-layout': 'designer.property.layout',
}

function groupLabel(group: string): string {
  const key = GROUP_LABELS[group]
  return key ? store.t(key) : group
}

// ─── Command-wrapped updates ────────────────────────────────────

function updateGeometry(key: string, value: number) {
  if (!selectedElement.value)
    return
  store.updateElement(selectedElement.value.id, { [key]: value })
}

function updateElementMeta(key: string, value: unknown) {
  if (!selectedElement.value)
    return
  store.updateElement(selectedElement.value.id, { [key]: value })
}

function updateProp(key: string, value: unknown) {
  const el = selectedElement.value
  if (!el)
    return
  if (key.startsWith('table:')) {
    const field = key.slice(6) as 'showHeader' | 'showFooter'
    if (isTableNode(el)) {
      const cmd = new UpdateTableVisibilityCommand(el, field, value as boolean)
      store.commands.execute(cmd)
    }
    return
  }
  const cmd = new UpdateMaterialPropsCommand(
    store.schema.elements,
    el.id,
    { [key]: value },
  )
  store.commands.execute(cmd)
}

function clearBinding(nodeId: string) {
  const cmd = new ClearBindingCommand(store.schema.elements, nodeId)
  store.commands.execute(cmd)
}

function readPropValue(schema: PropSchema): unknown {
  const el = selectedElement.value
  if (!el)
    return undefined
  if (schema.key.startsWith('table:')) {
    const field = schema.key.slice(6)
    const table = (el as unknown as Record<string, unknown>).table as Record<string, unknown> | undefined
    return table ? table[field] ?? true : true
  }
  return getByPath(el.props as Record<string, unknown>, schema.key)
}
</script>

<template>
  <div class="ei-properties-panel">
    <!-- Element properties: only when a single element is selected -->
    <template v-if="selectedElement">
      <!-- Geometry -->
      <EiPanel v-if="isSectionVisible('geometry')" :title="`${store.t('designer.property.position')} / ${store.t('designer.property.size')}`" collapsible flat>
        <div class="ei-properties-panel__grid">
          <EiInput
            label="X"
            type="number"
            :model-value="selectedElement.x"
            @update:model-value="updateGeometry('x', Number($event))"
          />
          <EiInput
            label="Y"
            type="number"
            :model-value="selectedElement.y"
            @update:model-value="updateGeometry('y', Number($event))"
          />
          <EiInput
            :label="'W'"
            type="number"
            :model-value="selectedElement.width"
            @update:model-value="updateGeometry('width', Number($event))"
          />
          <EiInput
            :label="'H'"
            type="number"
            :model-value="selectedElement.height"
            @update:model-value="updateGeometry('height', Number($event))"
          />
          <EiInput
            :label="store.t('designer.property.rotation')"
            type="number"
            :model-value="selectedElement.rotation ?? 0"
            @update:model-value="updateGeometry('rotation', Number($event))"
          />
          <EiInput
            :label="store.t('designer.property.opacity')"
            type="number"
            :model-value="selectedElement.alpha ?? 1"
            @update:model-value="updateGeometry('alpha', Number($event))"
          />
        </div>
      </EiPanel>

      <!-- Material-specific properties (PropSchema-driven) -->
      <template v-if="isSectionVisible('props')">
      <EiPanel
        v-for="[group, schemas] in groupedSchemas"
        :key="group"
        :title="groupLabel(group)"
        collapsible
        flat
      >
        <div class="ei-properties-panel__fields">
          <PropSchemaEditor
            v-for="schema in schemas"
            :key="schema.key"
            :schema="schema"
            :value="readPropValue(schema)"
            :disabled="schema.disabled ? schema.disabled(selectedElement.props as Record<string, unknown>) : false"
            :fonts="fontList"
            :t="store.t.bind(store)"
            @change="updateProp"
          />
        </div>
      </EiPanel>
      </template>

      <!-- Overlay layer: deep editing context properties -->
      <template v-if="overlay && isSectionVisible('overlay')">
        <EiPanel
          v-for="[group, schemas] in overlayGroupedSchemas"
          :key="`overlay-${group}`"
          :title="overlay.title ? `${overlay.title} - ${groupLabel(group)}` : groupLabel(group)"
          collapsible
          flat
        >
          <div class="ei-properties-panel__fields">
            <PropSchemaEditor
              v-for="schema in schemas"
              :key="schema.key"
              :schema="schema"
              :value="readOverlayValue(schema)"
              :inherited-value="readOverlayInheritedValue(schema)"
              :can-clear-override="!!overlay.clearOverride"
              :custom-editors="overlayCustomEditors"
              :fonts="fontList"
              :t="store.t.bind(store)"
              @change="updateOverlayProp"
              @clear-override="clearOverlayOverride"
            />
          </div>
        </EiPanel>
      </template>

      <!-- Data binding -->
      <EiPanel v-if="!hideBindingSection && isSectionVisible('binding')" :title="store.t('designer.property.dataBinding')" collapsible flat>
        <BindingSection
          :element="selectedElement"
          :t="store.t.bind(store)"
          :external-binding="hasOverlayBinding ? overlay!.binding : undefined"
          :has-external-binding="hasOverlayBinding"
          @clear-binding="clearBinding"
          @clear-external-binding="handleClearExternalBinding"
        />
      </EiPanel>

      <!-- Visibility / Lock -->
      <EiPanel v-if="isSectionVisible('visibility')" :title="store.t('designer.property.style')" collapsible flat>
        <div class="ei-properties-panel__fields">
          <EiSwitch
            :label="store.t('designer.property.hidden')"
            :model-value="selectedElement.hidden ?? false"
            @update:model-value="updateElementMeta('hidden', $event)"
          />
          <EiSwitch
            :label="store.t('designer.property.locked')"
            :model-value="selectedElement.locked ?? false"
            @update:model-value="updateElementMeta('locked', $event)"
          />
        </div>
      </EiPanel>
    </template>

    <!-- Page properties: only when no element is selected -->
    <template v-else>
      <EiPanel
        v-for="[group, descriptors] in groupedPageDescriptors"
        :key="group"
        :title="pageGroupLabel(group)"
        collapsible
        flat
      >
        <div class="ei-properties-panel__fields">
          <PagePropertyEditor
            v-for="descriptor in descriptors"
            :key="descriptor.id"
            :descriptor="descriptor"
            :value="readPagePropValue(descriptor)"
            :fonts="fontList"
            :t="store.t.bind(store)"
            @change="onPagePropertyChange"
          />
        </div>
      </EiPanel>
    </template>
  </div>
</template>

<style scoped>
.ei-properties-panel {
  width: 100%;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  padding: 0 4px;
  gap: 4px;
}

.ei-properties-panel__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.ei-properties-panel__fields {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ei-properties-panel__cell-label {
  font-size: 12px;
  color: var(--ei-text-secondary, #666);
}
</style>
