<script setup lang="ts">
import type { PropCommitContext, SubPropertySchema } from '@easyink/core'
import type { BindingRef } from '@easyink/schema'
import type { Component } from 'vue'
import type { PagePropertyContext, PagePropertyDescriptor, PagePropertyGroup } from '../page-properties'
import type { PanelSectionId, PropSchema } from '../types'
import { ClearBindingCommand, getByPath, setByPath, UpdateDocumentCommand, UpdateGeometryCommand, UpdateMaterialPropsCommand, UpdatePageCommand } from '@easyink/core'
import { deepClone, PAPER_PRESETS } from '@easyink/shared'
import { EiNumberInput, EiPanel, EiSwitch } from '@easyink/ui'
import { computed, shallowRef, watchEffect } from 'vue'
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

// ─── Sub-Property Schema (auto-derived from editing session selection) ──

const subPropertySchema = computed<SubPropertySchema | null>(() => {
  const session = store.editingSession.activeSession
  if (!session)
    return null

  const sel = session.selectionStore.selection
  if (!sel)
    return null

  const node = store.getElementById(sel.nodeId)
  if (!node)
    return null

  const ext = store.getDesignerExtension(node.type)
  if (!ext?.selectionTypes)
    return null

  const selType = ext.selectionTypes.find(t => t.id === sel.type)
  if (!selType?.getPropertySchema)
    return null

  return selType.getPropertySchema(sel, node)
})

// Sub-property schemas grouped by group field
const subGroupedSchemas = computed(() => {
  if (!subPropertySchema.value)
    return new Map<string, PropSchema[]>()
  return groupPropSchemas(subPropertySchema.value.schemas as PropSchema[])
})

function readSubValue(schema: PropSchema): unknown {
  return subPropertySchema.value?.read(schema.key)
}

function previewSubProp(_key: string, value: unknown) {
  const session = store.editingSession.activeSession
  if (!session || !subPropertySchema.value)
    return
  subPropertySchema.value.write(_key, value, session.tx)
}

function updateSubProp(key: string, value: unknown) {
  const session = store.editingSession.activeSession
  if (!session || !subPropertySchema.value)
    return
  subPropertySchema.value.write(key, value, session.tx)
}

const subCustomEditors = computed<Record<string, Component> | undefined>(() => {
  return subPropertySchema.value?.editors as Record<string, Component> | undefined
})

// ─── BindingSection context ─────────────────────────────────────

/** Whether the sub-property explicitly defines a binding context */
const hasSubBinding = computed(() =>
  subPropertySchema.value !== null && 'binding' in (subPropertySchema.value ?? {}),
)

const externalBinding = computed<BindingRef | BindingRef[] | null | undefined>(() => {
  if (!hasSubBinding.value)
    return undefined
  return subPropertySchema.value?.binding as BindingRef | BindingRef[] | null | undefined
})

/** Should the BindingSection be hidden entirely? */
const hideBindingSection = computed(() => {
  // Sub-property explicitly hides binding
  if (hasSubBinding.value && subPropertySchema.value?.binding === null)
    return true
  // Material has no bindable capability and no sub-property binding
  if (!hasSubBinding.value && selectedElement.value) {
    const def = store.getMaterial(selectedElement.value.type)
    if (def?.capabilities.bindable === false)
      return true
  }
  return false
})

function handleClearExternalBinding(bindIndex?: number) {
  const session = store.editingSession.activeSession
  if (!session || !subPropertySchema.value?.clearBinding)
    return
  subPropertySchema.value.clearBinding(session.tx, bindIndex)
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
    isEditing: store.editingSession.activeNodeId === el.id,
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

// ─── Page property preview/commit snapshots ─────────────────────

const pageSnapshots = new Map<string, { page?: Record<string, unknown>, document?: Record<string, unknown> }>()

function previewPageProperty(descriptor: PagePropertyDescriptor, value: unknown) {
  const ctx = pagePropertyContext.value
  const patch = descriptor.normalize
    ? descriptor.normalize(value, ctx)
    : descriptor.source === 'document'
      ? defaultDocumentPatch(descriptor.path, value)
      : defaultPagePatch(descriptor.path, value)

  const { pageUpdates, documentUpdates } = splitPatch(patch)

  // Snapshot before first preview
  if (!pageSnapshots.has(descriptor.id)) {
    const snapshot: { page?: Record<string, unknown>, document?: Record<string, unknown> } = {}
    if (pageUpdates && Object.keys(pageUpdates).length > 0) {
      snapshot.page = {}
      for (const key of Object.keys(pageUpdates)) {
        (snapshot.page as Record<string, unknown>)[key] = deepClone((store.schema.page as unknown as Record<string, unknown>)[key])
      }
    }
    if (documentUpdates && Object.keys(documentUpdates).length > 0) {
      snapshot.document = {}
      for (const key of Object.keys(documentUpdates)) {
        (snapshot.document as Record<string, unknown>)[key] = deepClone((store.schema as unknown as Record<string, unknown>)[key])
      }
    }
    pageSnapshots.set(descriptor.id, snapshot)
  }

  // Direct mutation for preview
  if (pageUpdates && Object.keys(pageUpdates).length > 0) {
    Object.assign(store.schema.page, pageUpdates)
  }
  if (documentUpdates && Object.keys(documentUpdates).length > 0) {
    Object.assign(store.schema, documentUpdates)
  }
}

function onPagePropertyChange(descriptor: PagePropertyDescriptor, value: unknown) {
  const ctx = pagePropertyContext.value
  const patch = descriptor.normalize
    ? descriptor.normalize(value, ctx)
    : descriptor.source === 'document'
      ? defaultDocumentPatch(descriptor.path, value)
      : defaultPagePatch(descriptor.path, value)

  const { pageUpdates, documentUpdates } = splitPatch(patch)
  const snapshot = pageSnapshots.get(descriptor.id)
  pageSnapshots.delete(descriptor.id)

  if (pageUpdates && Object.keys(pageUpdates).length > 0) {
    const cmd = new UpdatePageCommand(
      store.schema.page,
      pageUpdates,
      snapshot?.page as Record<string, unknown> | undefined,
    )
    store.commands.execute(cmd)
  }

  if (documentUpdates && Object.keys(documentUpdates).length > 0) {
    const cmd = new UpdateDocumentCommand(
      store.schema,
      documentUpdates,
      snapshot?.document as Record<string, unknown> | undefined,
    )
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
  'content': 'designer.property.content',
  'typography': 'designer.property.typography',
  'appearance': 'designer.property.appearance',
  'border': 'designer.property.border',
  'layout': 'designer.property.layout',
  'pagination': 'designer.property.pagination',
  'general': 'designer.property.style',
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

// ─── Material prop preview/commit ──────────────────────────────

const propSnapshots = new Map<string, unknown>()

function previewProp(key: string, value: unknown) {
  const el = selectedElement.value
  if (!el)
    return
  // Schemas with a custom commit own the entire write path; skip the default
  // props-bag preview to avoid writing into the wrong location (e.g. table fields).
  const schema = materialSchemas.value.find(s => s.key === key)
  if (schema?.commit)
    return
  // Snapshot before first preview
  if (!propSnapshots.has(key)) {
    propSnapshots.set(key, deepClone(getByPath(el.props as Record<string, unknown>, key)))
  }
  // Direct mutation for preview (no command)
  if (key.includes('.'))
    setByPath(el.props as Record<string, unknown>, key, value)
  else
    (el.props as Record<string, unknown>)[key] = value
}

function updateProp(key: string, value: unknown) {
  const el = selectedElement.value
  if (!el)
    return
  const schema = materialSchemas.value.find(s => s.key === key)

  // PropSchema can override the default props-bag commit path (e.g. table.showHeader
  // lives on `node.table` and needs UpdateTableVisibilityCommand + session cleanup).
  if (schema?.commit) {
    const ctx: PropCommitContext = {
      flushPendingEdits: () => {
        const active = document.activeElement as HTMLElement | null
        if (active && typeof active.blur === 'function')
          active.blur()
      },
      activeEditingSession: store.editingSession.activeSession,
      exitEditingSession: () => store.editingSession.exit(),
    }
    const cmd = schema.commit(el, value, ctx)
    if (cmd)
      store.commands.execute(cmd)
    propSnapshots.delete(key)
    return
  }

  const oldValue = propSnapshots.get(key)
  propSnapshots.delete(key)
  const cmd = new UpdateMaterialPropsCommand(
    store.schema.elements,
    el.id,
    { [key]: value },
    oldValue !== undefined ? { [key]: oldValue } : undefined,
  )
  store.commands.execute(cmd)
}

// ─── Geometry preview/commit ────────────────────────────────────

const geoSnapshots = new Map<string, number>()

function previewGeometry(key: string, value: number) {
  if (!selectedElement.value)
    return
  if (!geoSnapshots.has(key)) {
    geoSnapshots.set(key, (selectedElement.value as unknown as Record<string, number>)[key])
  }
  store.updateElement(selectedElement.value.id, { [key]: value })
}

function commitGeometry(key: string, value: number) {
  const el = selectedElement.value
  if (!el)
    return
  const oldValue = geoSnapshots.get(key)
  geoSnapshots.delete(key)
  if (oldValue !== undefined && oldValue === value)
    return
  const updates = { [key]: value } as Record<string, number>
  const olds = oldValue !== undefined ? { [key]: oldValue } as Record<string, number> : undefined
  const cmd = new UpdateGeometryCommand(store.schema.elements, el.id, updates, olds)
  store.commands.execute(cmd)
}

// ─── Element meta (hidden/locked) ──────────────────────────────

function updateElementMeta(key: string, value: unknown) {
  if (!selectedElement.value)
    return
  store.updateElement(selectedElement.value.id, { [key]: value })
}

// ─── Binding ────────────────────────────────────────────────────

function clearBinding(nodeId: string) {
  const cmd = new ClearBindingCommand(store.schema.elements, nodeId)
  store.commands.execute(cmd)
}

function readPropValue(schema: PropSchema): unknown {
  const el = selectedElement.value
  if (!el)
    return undefined
  if (schema.read) {
    const v = schema.read(el)
    return v ?? schema.default
  }
  const value = getByPath(el.props as Record<string, unknown>, schema.key)
  return value ?? schema.default
}
</script>

<template>
  <div class="ei-properties-panel">
    <!-- Element properties: only when a single element is selected -->
    <template v-if="selectedElement">
      <!-- Geometry -->
      <EiPanel v-if="isSectionVisible('geometry')" :title="`${store.t('designer.property.position')} / ${store.t('designer.property.size')}`" collapsible flat>
        <div class="ei-properties-panel__grid">
          <EiNumberInput
            label="X"
            :model-value="selectedElement.x"
            @update:model-value="previewGeometry('x', $event ?? 0)"
            @commit="commitGeometry('x', $event ?? 0)"
          />
          <EiNumberInput
            label="Y"
            :model-value="selectedElement.y"
            @update:model-value="previewGeometry('y', $event ?? 0)"
            @commit="commitGeometry('y', $event ?? 0)"
          />
          <EiNumberInput
            label="W"
            :model-value="selectedElement.width"
            :min="0"
            @update:model-value="previewGeometry('width', $event ?? 0)"
            @commit="commitGeometry('width', $event ?? 0)"
          />
          <EiNumberInput
            label="H"
            :model-value="selectedElement.height"
            :min="0"
            @update:model-value="previewGeometry('height', $event ?? 0)"
            @commit="commitGeometry('height', $event ?? 0)"
          />
          <EiNumberInput
            :label="store.t('designer.property.rotation')"
            :model-value="selectedElement.rotation ?? 0"
            @update:model-value="previewGeometry('rotation', $event ?? 0)"
            @commit="commitGeometry('rotation', $event ?? 0)"
          />
          <EiNumberInput
            :label="store.t('designer.property.opacity')"
            :model-value="selectedElement.alpha ?? 1"
            :min="0"
            :max="1"
            :step="0.1"
            :precision="2"
            @update:model-value="previewGeometry('alpha', $event ?? 1)"
            @commit="commitGeometry('alpha', $event ?? 1)"
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
              @preview="previewProp"
              @change="updateProp"
            />
          </div>
        </EiPanel>
      </template>

      <!-- Sub-property layer: auto-derived from editing session selection -->
      <template v-if="subPropertySchema && isSectionVisible('overlay')">
        <EiPanel
          v-for="[group, schemas] in subGroupedSchemas"
          :key="`sub-${group}`"
          :title="subPropertySchema.title ? `${subPropertySchema.title} - ${groupLabel(group)}` : groupLabel(group)"
          collapsible
          flat
        >
          <div class="ei-properties-panel__fields">
            <PropSchemaEditor
              v-for="schema in schemas"
              :key="schema.key"
              :schema="schema"
              :value="readSubValue(schema)"
              :custom-editors="subCustomEditors"
              :fonts="fontList"
              :t="store.t.bind(store)"
              @preview="previewSubProp"
              @change="updateSubProp"
            />
          </div>
        </EiPanel>
      </template>

      <!-- Data binding -->
      <EiPanel v-if="!hideBindingSection && (isSectionVisible('binding') || hasSubBinding)" :title="store.t('designer.property.dataBinding')" collapsible flat>
        <BindingSection
          :element="selectedElement"
          :t="store.t.bind(store)"
          :external-binding="externalBinding"
          :has-external-binding="hasSubBinding"
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
            @preview="previewPageProperty"
            @change="onPagePropertyChange"
          />
        </div>
      </EiPanel>
    </template>
  </div>
</template>

<style scoped lang="scss">
.ei-properties-panel {
  width: 100%;
  font-size: 13px;
  display: flex;
  flex-direction: column;
  padding: 0 4px;
  gap: 4px;

  &__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  &__fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  &__cell-label {
    font-size: 12px;
    color: var(--ei-text-secondary, #666);
  }
}
</style>
