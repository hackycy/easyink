<script setup lang="ts">
import type { PropCommitContext, SubPropertySchema } from '@easyink/core'
import type { BindingRef, DataContractBinding, DocumentSchema, MaterialNode, PageSchema } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import type { Component } from 'vue'
import type { PagePropertyContext, PagePropertyDescriptor, PagePropertyGroup } from '../page-properties'
import type { DesignerResolvedAsset, PanelSectionId, PropSchema } from '../types'
import { ClearBindingCommand, getByPath, setByPath, UpdateBindingFormatCommand, UpdateDocumentCommand, UpdateGeometryCommand, UpdateMaterialBindingCommand, UpdateMaterialMetaCommand, UpdateMaterialPropsCommand, UpdatePageCommand } from '@easyink/core'
import { createLayoutBehaviorPropSchemas, groupPropSchemas } from '@easyink/prop-schemas'
import { getBindingRefs } from '@easyink/schema'
import { deepClone } from '@easyink/shared'
import { EiNumberInput, EiPanel, EiSwitch } from '@easyink/ui'
import { computed, shallowRef, watchEffect } from 'vue'
import { useDesignerStore } from '../composables'
import { resolveDataContractFieldFormatEditor, resolveOrdinaryFormatEditor } from '../materials/binding-format-editor'
import { isElementRotatable } from '../materials/capabilities'
import { canEditGeometry, isPropSchemaDisabled as isMaterialPropSchemaDisabled } from '../materials/control-policy'
import { createPagePropertyDescriptors, defaultDocumentPatch, defaultPagePatch, filterVisible, groupDescriptors, readPageProperty, splitPatch } from '../page-properties'
import BindingSection from './BindingSection.vue'
import MaterialDataBindingEditor from './MaterialDataBindingEditor.vue'
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

const selectedElementRotatable = computed(() =>
  isElementRotatable(store, selectedElement.value),
)

const selectedElementLocked = computed(() => selectedElement.value?.locked === true)
const selectedElementHidden = computed(() => selectedElement.value?.hidden === true)
const canEditSelectedElement = computed(() => !selectedElementLocked.value && !selectedElementHidden.value)
const showHiddenSwitch = computed(() => !selectedElementLocked.value)
const showLockedSwitch = computed(() => true)

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
  const schema = subPropertySchema.value.schemas.find(s => s.key === _key)
  if (schema?.type === 'font')
    return
  subPropertySchema.value.write(_key, value, session.tx)
}

async function updateSubProp(key: string, value: unknown) {
  const session = store.editingSession.activeSession
  if (!session || !subPropertySchema.value)
    return
  const schema = subPropertySchema.value.schemas.find(s => s.key === key)
  if (schema?.type === 'font' && typeof value === 'string') {
    const loaded = await store.ensureFontLoaded({ family: value })
    if (!loaded)
      return
  }
  subPropertySchema.value.write(key, value, session.tx)
}

function updateSubImagePropFromPicker(key: string, result: DesignerResolvedAsset) {
  updateSubProp(key, result.url)
}

function loadFont(family: string) {
  if (!family)
    return
  void store.ensureFontLoaded({ family })
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

const selectedMaterialDataContract = computed(() => {
  const el = selectedElement.value
  if (!el)
    return undefined
  const binding = store.getMaterial(el.type)?.binding
  return binding?.kind === 'data-contract' ? binding.contract : undefined
})

const selectedMaterialBinding = computed(() => {
  const el = selectedElement.value
  return el ? store.getMaterial(el.type)?.binding : undefined
})

const selectedBindingFormatEditor = computed(() =>
  resolveOrdinaryFormatEditor(selectedMaterialBinding.value),
)

function resolveSelectedDataContractFieldFormatEditor(fieldId: string) {
  return resolveDataContractFieldFormatEditor(selectedMaterialBinding.value, fieldId)
}

/** Should the BindingSection be hidden entirely? */
const hideBindingSection = computed(() => {
  // Sub-property explicitly hides binding
  if (hasSubBinding.value && subPropertySchema.value?.binding === null)
    return true
  // Material has no bindable capability and no sub-property binding
  if (!hasSubBinding.value && selectedElement.value) {
    if (selectedMaterialDataContract.value)
      return true
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
  rawPage: store.schema.compat?.passthrough,
  selectedElementId: selectedElement.value?.id,
}))

const pagePropertyDescriptors = computed(() =>
  createPagePropertyDescriptors(store.listPaperPresets()),
)

const visiblePageDescriptors = computed(() =>
  filterVisible(pagePropertyDescriptors.value, pagePropertyContext.value),
)

const groupedPageDescriptors = computed(() =>
  groupDescriptors(visiblePageDescriptors.value),
)

// Derive paper preset from current width/height
const currentPaperPreset = computed(() => {
  const { width, height } = store.schema.page
  const match = store.getPaperPresetBySize(width, height)
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
  layout: 'designer.page.groupLayout',
  paper: 'designer.page.groupPaper',
  print: 'designer.page.groupPrint',
  assist: 'designer.page.groupAssist',
  background: 'designer.page.groupBackground',
  advanced: 'designer.page.groupAdvanced',
}

function pageGroupLabel(group: PagePropertyGroup): string {
  return store.t(PAGE_GROUP_LABELS[group])
}

// ─── Page property preview/commit snapshots ─────────────────────

type DocumentPageSnapshot = Partial<Pick<DocumentSchema, 'unit' | 'meta' | 'extensions' | 'compat'>>

const pageSnapshots = new Map<string, { page?: Partial<PageSchema>, document?: DocumentPageSnapshot }>()

type GeometryKey = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'alpha'
type DocumentPageSnapshotKey = keyof DocumentPageSnapshot

function readPageSnapshotValue<K extends keyof PageSchema>(page: PageSchema, key: K): PageSchema[K] {
  return page[key]
}

function readDocumentSnapshotValue<K extends DocumentPageSnapshotKey>(schema: DocumentSchema, key: K): DocumentPageSnapshot[K] {
  return schema[key] as DocumentPageSnapshot[K]
}

function setPageSnapshotValue<K extends keyof PageSchema>(snapshot: Partial<PageSchema>, key: K, value: PageSchema[K]) {
  snapshot[key] = value
}

function setDocumentSnapshotValue<K extends DocumentPageSnapshotKey>(snapshot: DocumentPageSnapshot, key: K, value: DocumentPageSnapshot[K]) {
  snapshot[key] = value
}

function isGeometryKey(key: string): key is GeometryKey {
  return key === 'x' || key === 'y' || key === 'width' || key === 'height' || key === 'rotation' || key === 'alpha'
}

function readGeometryValue(node: MaterialNode, key: GeometryKey): number | undefined {
  switch (key) {
    case 'x': return node.x
    case 'y': return node.y
    case 'width': return node.width
    case 'height': return node.height
    case 'rotation': return node.rotation
    case 'alpha': return node.alpha
  }
}

function previewPageProperty(descriptor: PagePropertyDescriptor, value: unknown) {
  if (descriptor.editor === 'font')
    return

  const ctx = pagePropertyContext.value
  const patch = descriptor.normalize
    ? descriptor.normalize(value, ctx)
    : descriptor.source === 'document'
      ? defaultDocumentPatch(descriptor.path, value)
      : defaultPagePatch(descriptor.path, value)

  const { pageUpdates, documentUpdates } = splitPatch(patch)

  // Snapshot before first preview
  if (!pageSnapshots.has(descriptor.id)) {
    const snapshot: { page?: Partial<PageSchema>, document?: DocumentPageSnapshot } = {}
    if (pageUpdates && Object.keys(pageUpdates).length > 0) {
      snapshot.page = {}
      for (const key of Object.keys(pageUpdates) as Array<keyof PageSchema>) {
        setPageSnapshotValue(snapshot.page, key, deepClone(readPageSnapshotValue(store.schema.page, key)))
      }
    }
    if (documentUpdates && Object.keys(documentUpdates).length > 0) {
      snapshot.document = {}
      for (const key of Object.keys(documentUpdates) as DocumentPageSnapshotKey[]) {
        setDocumentSnapshotValue(snapshot.document, key, deepClone(readDocumentSnapshotValue(store.schema, key)))
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

async function onPagePropertyChange(descriptor: PagePropertyDescriptor, value: unknown) {
  if (descriptor.editor === 'font' && typeof value === 'string') {
    const loaded = await store.ensureFontLoaded({ family: value })
    if (!loaded) {
      rollbackPagePreview(descriptor.id)
      return
    }
  }
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
      snapshot?.page,
    )
    store.commands.execute(cmd)
  }

  if (documentUpdates && Object.keys(documentUpdates).length > 0) {
    const cmd = new UpdateDocumentCommand(
      store.schema,
      documentUpdates,
      snapshot?.document,
    )
    store.commands.execute(cmd)
  }
}

function rollbackPagePreview(descriptorId: string) {
  const snapshot = pageSnapshots.get(descriptorId)
  if (!snapshot)
    return
  pageSnapshots.delete(descriptorId)
  if (snapshot.page) {
    Object.assign(store.schema.page, snapshot.page)
  }
  if (snapshot.document) {
    Object.assign(store.schema, snapshot.document)
  }
}

// ─── Element PropSchema ──────────────────────────────────────────

const materialSchemas = computed<PropSchema[]>(() => {
  if (!selectedElement.value)
    return []
  const def = store.getMaterial(selectedElement.value.type)
  return [
    ...(def?.props ?? []),
    ...createLayoutBehaviorPropSchemas({ page: store.schema.page }),
  ]
})

const visibleSchemas = computed(() => {
  const el = selectedElement.value
  if (!el)
    return []
  const elProps = {
    ...el.props,
    __hasBinding: getBindingRefs(el.binding).length > 0,
    __placementMode: el.placement?.mode ?? ((el.props as Record<string, unknown>).layoutMode === 'fixed' ? 'fixed' : 'flow'),
  }
  return materialSchemas.value.filter(s => !s.visible || s.visible(elProps))
})

const groupedSchemas = computed(() => groupPropSchemas(visibleSchemas.value))

// Font list from FontManager (async)
const fontList = shallowRef<Array<{ family: string, displayName: string, preview?: string }>>([])
const fontManager = store.fontManager
let fontListRequestId = 0
watchEffect(async () => {
  const revision = store.fontRevision
  const requestId = ++fontListRequestId
  if (fontManager) {
    try {
      const fonts = await fontManager.listFonts()
      if (requestId !== fontListRequestId || revision !== store.fontRevision)
        return
      fontList.value = fonts
    }
    catch {
      if (requestId !== fontListRequestId || revision !== store.fontRevision)
        return
      fontList.value = []
    }
  }
})

const fontStatuses = computed<Record<string, ReturnType<typeof store.getFontStatus>>>(() =>
  store.getFontStatuses(fontList.value.map(font => font.family), store.fontRevision),
)

// Group label i18n
const GROUP_LABELS: Record<string, string> = {
  'content': 'designer.property.content',
  'typography': 'designer.property.typography',
  'appearance': 'designer.property.appearance',
  'border': 'designer.property.border',
  'shape': 'designer.property.shape',
  'layout': 'designer.property.layout',
  'pagination': 'designer.property.pagination',
  'repeat': 'designer.property.repeat',
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
  if (schema?.type === 'font')
    return
  // Snapshot before first preview
  if (!propSnapshots.has(key)) {
    propSnapshots.set(key, deepClone(getByPath(el.props, key)))
  }
  // Direct mutation for preview (no command)
  if (key.includes('.'))
    setByPath(el.props, key, value)
  else
    el.props[key] = value
}

async function updateProp(key: string, value: unknown) {
  const el = selectedElement.value
  if (!el)
    return
  const schema = materialSchemas.value.find(s => s.key === key)
  if (schema?.type === 'font' && typeof value === 'string') {
    const loaded = await store.ensureFontLoaded({ family: value })
    if (!loaded) {
      rollbackPropPreview(key)
      return
    }
  }

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

function rollbackPropPreview(key: string) {
  const el = selectedElement.value
  if (!el || !propSnapshots.has(key))
    return
  const oldValue = propSnapshots.get(key)
  propSnapshots.delete(key)
  if (key.includes('.')) {
    setByPath(el.props, key, oldValue)
  }
  else if (oldValue === undefined) {
    delete el.props[key]
  }
  else {
    el.props[key] = oldValue
  }
}

function updateImagePropFromPicker(key: string, result: DesignerResolvedAsset) {
  const el = selectedElement.value
  if (!el)
    return

  const updates: Record<string, unknown> = { [key]: result.url }
  const oldValues: Record<string, unknown> = {}
  const oldValue = propSnapshots.get(key)
  if (oldValue !== undefined)
    oldValues[key] = oldValue
  propSnapshots.delete(key)

  if (key === 'src' && result.alt && isBlankAlt(el.props.alt)) {
    updates.alt = result.alt
    oldValues.alt = el.props.alt
  }

  const cmd = new UpdateMaterialPropsCommand(
    store.schema.elements,
    el.id,
    updates,
    Object.keys(oldValues).length > 0 ? oldValues : undefined,
  )
  store.commands.execute(cmd)
}

function isBlankAlt(value: unknown): boolean {
  return typeof value !== 'string' || value.trim().length === 0
}

// ─── Geometry preview/commit ────────────────────────────────────

const geoSnapshots = new Map<string, number>()

function previewGeometry(key: string, value: number) {
  if (!selectedElement.value || !isGeometryKey(key))
    return
  if (key === 'rotation' && !isElementRotatable(store, selectedElement.value))
    return
  if (!canEditGeometry(store, selectedElement.value, key))
    return
  if (!geoSnapshots.has(key)) {
    geoSnapshots.set(key, readGeometryValue(selectedElement.value, key) ?? 0)
  }
  store.updateElement(selectedElement.value.id, { [key]: value })
}

function commitGeometry(key: string, value: number) {
  const el = selectedElement.value
  if (!el || !isGeometryKey(key))
    return
  if (key === 'rotation' && !isElementRotatable(store, el))
    return
  if (!canEditGeometry(store, el, key))
    return
  const oldValue = geoSnapshots.get(key)
  geoSnapshots.delete(key)
  if (oldValue !== undefined && oldValue === value)
    return
  const updates: Partial<Record<GeometryKey, number>> = { [key]: value }
  const olds: Partial<Record<GeometryKey, number>> | undefined = oldValue !== undefined ? { [key]: oldValue } : undefined
  const cmd = new UpdateGeometryCommand(store.schema.elements, el.id, updates, olds)
  store.commands.execute(cmd)
}

// ─── Element meta (hidden/locked) ──────────────────────────────

function updateElementMeta(key: string, value: unknown) {
  if (!selectedElement.value)
    return
  if (key !== 'hidden' && key !== 'locked')
    return
  const boolValue = value === true
  const cmd = new UpdateMaterialMetaCommand(
    store.schema.elements,
    selectedElement.value.id,
    { [key]: boolValue },
  )
  store.commands.execute(cmd)
}

// ─── Binding ────────────────────────────────────────────────────

function clearBinding(nodeId: string) {
  const cmd = new ClearBindingCommand(store.schema.elements, nodeId)
  store.commands.execute(cmd)
}

function updateBindingFormat(format: BindingDisplayFormat | undefined, bindIndex?: number) {
  if (hasSubBinding.value) {
    const session = store.editingSession.activeSession
    if (!session || !subPropertySchema.value?.updateBindingFormat)
      return
    subPropertySchema.value.updateBindingFormat(session.tx, format, bindIndex)
    return
  }
  if (!selectedElement.value)
    return
  const cmd = new UpdateBindingFormatCommand(store.schema.elements, selectedElement.value.id, format, bindIndex)
  store.commands.execute(cmd)
}

function updateMaterialDataBinding(binding: DataContractBinding | undefined) {
  const el = selectedElement.value
  if (!el)
    return
  const cmd = new UpdateMaterialBindingCommand(store.schema.elements, el.id, binding)
  store.commands.execute(cmd)
}

function getBindingDataSource(sourceId: string) {
  return store.dataSourceRegistry.getSourceSync(sourceId)
}

function readPropValue(schema: PropSchema): unknown {
  const el = selectedElement.value
  if (!el)
    return undefined
  if (schema.read) {
    const v = schema.read(el)
    return v ?? schema.default
  }
  const value = getByPath(el.props, schema.key)
  return value ?? schema.default
}

function isGeometryInputDisabled(key: GeometryKey): boolean {
  const el = selectedElement.value
  return !el || !canEditGeometry(store, el, key)
}

function isPropInputDisabled(schema: PropSchema): boolean {
  const el = selectedElement.value
  if (!el)
    return true
  return isMaterialPropSchemaDisabled(store, el, schema)
}
</script>

<template>
  <div class="ei-properties-panel">
    <!-- Element properties: only when a single element is selected -->
    <template v-if="selectedElement">
      <!-- Geometry -->
      <EiPanel v-if="canEditSelectedElement && isSectionVisible('geometry')" :title="`${store.t('designer.property.position')} / ${store.t('designer.property.size')}`" collapsible flat>
        <div class="ei-properties-panel__grid">
          <EiNumberInput
            label="X"
            :model-value="selectedElement.x"
            :disabled="isGeometryInputDisabled('x')"
            @update:model-value="previewGeometry('x', $event ?? 0)"
            @commit="commitGeometry('x', $event ?? 0)"
          />
          <EiNumberInput
            label="Y"
            :model-value="selectedElement.y"
            :disabled="isGeometryInputDisabled('y')"
            @update:model-value="previewGeometry('y', $event ?? 0)"
            @commit="commitGeometry('y', $event ?? 0)"
          />
          <EiNumberInput
            label="W"
            :model-value="selectedElement.width"
            :min="0"
            :disabled="isGeometryInputDisabled('width')"
            @update:model-value="previewGeometry('width', $event ?? 0)"
            @commit="commitGeometry('width', $event ?? 0)"
          />
          <EiNumberInput
            label="H"
            :model-value="selectedElement.height"
            :min="0"
            :disabled="isGeometryInputDisabled('height')"
            @update:model-value="previewGeometry('height', $event ?? 0)"
            @commit="commitGeometry('height', $event ?? 0)"
          />
          <EiNumberInput
            v-if="selectedElementRotatable"
            :label="store.t('designer.property.rotation')"
            :model-value="selectedElement.rotation ?? 0"
            :disabled="isGeometryInputDisabled('rotation')"
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
            :disabled="isGeometryInputDisabled('alpha')"
            @update:model-value="previewGeometry('alpha', $event ?? 1)"
            @commit="commitGeometry('alpha', $event ?? 1)"
          />
        </div>
      </EiPanel>

      <!-- Material-specific properties (PropSchema-driven) -->
      <template v-if="canEditSelectedElement && isSectionVisible('props')">
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
              :disabled="isPropInputDisabled(schema)"
              :fonts="fontList"
              :font-statuses="fontStatuses"
              :t="store.t.bind(store)"
              @preview="previewProp"
              @change="updateProp"
              @image-pick="updateImagePropFromPicker"
              @load-font="loadFont"
            />
          </div>
        </EiPanel>
      </template>

      <!-- Sub-property layer: auto-derived from editing session selection -->
      <template v-if="canEditSelectedElement && subPropertySchema && isSectionVisible('overlay')">
        <EiPanel
          v-for="[group, schemas] in subGroupedSchemas"
          :key="`sub-${group}`"
          :title="subPropertySchema.title ? `${store.t(subPropertySchema.title)} - ${groupLabel(group)}` : groupLabel(group)"
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
              :font-statuses="fontStatuses"
              :t="store.t.bind(store)"
              @preview="previewSubProp"
              @change="updateSubProp"
              @image-pick="updateSubImagePropFromPicker"
              @load-font="loadFont"
            />
          </div>
        </EiPanel>
      </template>

      <!-- Data binding -->
      <EiPanel v-if="canEditSelectedElement && !hasSubBinding && selectedMaterialDataContract && isSectionVisible('binding')" :title="store.t('designer.property.dataBinding')" collapsible flat>
        <MaterialDataBindingEditor
          :element="selectedElement"
          :contract="selectedMaterialDataContract"
          :t="store.t.bind(store)"
          :get-data-source="getBindingDataSource"
          :resolve-format-editor="resolveSelectedDataContractFieldFormatEditor"
          @update-binding="updateMaterialDataBinding"
          @update-binding-format="updateBindingFormat"
        />
      </EiPanel>

      <EiPanel v-if="canEditSelectedElement && !hideBindingSection && (isSectionVisible('binding') || hasSubBinding)" :title="store.t('designer.property.dataBinding')" collapsible flat>
        <BindingSection
          :element="selectedElement"
          :t="store.t.bind(store)"
          :external-binding="externalBinding"
          :has-external-binding="hasSubBinding"
          :get-data-source="getBindingDataSource"
          :format-editor="selectedBindingFormatEditor"
          @clear-binding="clearBinding"
          @clear-external-binding="handleClearExternalBinding"
          @update-binding-format="updateBindingFormat"
        />
      </EiPanel>

      <!-- Visibility / Lock -->
      <EiPanel v-if="isSectionVisible('visibility')" :title="store.t('designer.property.style')" collapsible flat>
        <div class="ei-properties-panel__fields">
          <EiSwitch
            v-if="showHiddenSwitch"
            :label="store.t('designer.property.hidden')"
            :model-value="selectedElement.hidden ?? false"
            @update:model-value="updateElementMeta('hidden', $event)"
          />
          <EiSwitch
            v-if="showLockedSwitch"
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
            :font-statuses="fontStatuses"
            :t="store.t.bind(store)"
            @preview="previewPageProperty"
            @change="onPagePropertyChange"
            @load-font="loadFont"
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
