<script setup lang="ts">
import type { DocumentFieldPath, MaterialContextualPropertiesResult, SubPropertySchema } from '@easyink/core'
import type { BindingRef, DataContractBinding, MaterialNode } from '@easyink/schema'
import type { BindingDisplayFormat } from '@easyink/shared'
import type { Component } from 'vue'
import type { PagePropertyContext, PagePropertyDescriptor, PagePropertyGroup } from '../page-properties'
import type { DesignerResolvedAsset, PanelSectionId, PropSchema } from '../types'
import { ClearBindingCommand, resolveMaterialConditionCapability, resolvePropertyAccessor, UpdateBindingFormatCommand, UpdateMaterialBindingCommand, UpdateMaterialEditorStateCommand, UpdateMaterialModelCommand, UpdateRenderConditionCommand } from '@easyink/core'
import { createLayoutBehaviorPropSchemas, groupPropSchemas } from '@easyink/prop-schemas'
import { getBindingRefs } from '@easyink/schema'
import { EiNumberInput, EiPanel, EiSwitch } from '@easyink/ui'
import { computed, onUnmounted, shallowRef, watch, watchEffect } from 'vue'
import { useDesignerStore } from '../composables'
import { PropertyPreviewController } from '../editing/property-preview-controller'
import { resolveDataContractFieldFormatEditor, resolveOrdinaryFormatEditor } from '../materials/binding-format-editor'
import { resolveBindingPanelPort, resolveDataContractBindingPort } from '../materials/binding-port'
import { isElementRotatable } from '../materials/capabilities'
import { canEditGeometry, isPropSchemaDisabled as isMaterialPropSchemaDisabled } from '../materials/control-policy'
import { createPagePropertyDescriptors, defaultDocumentPatch, defaultPagePatch, filterVisible, groupDescriptors, readPageProperty, splitPatch } from '../page-properties'
import BindingSection from './BindingSection.vue'
import ConditionEditor from './ConditionEditor.vue'
import MaterialDataBindingEditor from './MaterialDataBindingEditor.vue'
import PagePropertyEditor from './PagePropertyEditor.vue'
import PropSchemaEditor from './PropSchemaEditor.vue'

const store = useDesignerStore()
const visibleDocumentSequence = shallowRef(0)

const selectedElements = computed(() => {
  void visibleDocumentSequence.value
  const ids = store.selection.ids
  return ids.map(id => store.getElementById(id)).filter(Boolean)
})

const selectedElement = computed(() =>
  selectedElements.value.length === 1 ? selectedElements.value[0] : undefined,
)

const propertyPreview = new PropertyPreviewController(store.documentTransactions)
const contextualProperties = shallowRef<MaterialContextualPropertiesResult | null>(null)
const committedContextSequence = shallowRef(0)
const disposeCommittedContextSubscription = store.documentStore.subscribe((event) => {
  visibleDocumentSequence.value = event.sequence
  if (!['commit', 'undo', 'redo', 'reset'].includes(event.kind))
    return
  propertyPreview.cancelActive()
  committedContextSequence.value = event.sequence
})
let contextualRequestToken = 0
watchEffect((onCleanup) => {
  if (contextualRequestToken > 0)
    propertyPreview.cancelActive()
  const committedSequence = committedContextSequence.value
  const selectedId = store.selection.ids.length === 1 ? store.selection.ids[0] : undefined
  const node = selectedId ? store.documentStore.committedIndex.getNode(selectedId) : undefined
  const session = store.editingSession.activeSession
  const selection = session?.selectionStore.selection
  const token = ++contextualRequestToken
  void committedSequence
  contextualProperties.value = null
  if (!node || !session || !selection)
    return
  let cancelled = false
  onCleanup(() => {
    cancelled = true
    if (token === contextualRequestToken)
      propertyPreview.cancelActive()
  })
  void store.materialFacetHost.contextualProperties(store.materialProfile, node.type, {
    node,
    sessionPath: store.editingSession.path.map(frame => frame.nodeId),
    selection: selection as unknown as import('@easyink/shared').JsonValue,
    lineage: session.selectionStore.lineageId,
  }).then((result) => {
    if (!cancelled && token === contextualRequestToken)
      contextualProperties.value = result
  })
})

onUnmounted(disposeCommittedContextSubscription)

const selectedElementRotatable = computed(() =>
  isElementRotatable(store, selectedElement.value),
)

const selectedElementLocked = computed(() => selectedElement.value?.editorState?.locked === true)
const selectedElementHidden = computed(() => selectedElement.value?.editorState?.hidden === true)
const selectedConditionCapability = computed(() => {
  const element = selectedElement.value
  return element ? resolveMaterialConditionCapability(store.getMaterialManifest(element.type)?.common.condition) : undefined
})
const canEditSelectedElement = computed(() => !selectedElementLocked.value && !selectedElementHidden.value)
const showHiddenSwitch = computed(() => !selectedElementLocked.value)
const showLockedSwitch = computed(() => true)

// ─── Sub-Property Schema (auto-derived from editing session selection) ──

const subPropertySchema = computed<SubPropertySchema | null>(() => null)

// Sub-property schemas grouped by group field
const subGroupedSchemas = computed(() => {
  if (!contextualProperties.value)
    return new Map<string, PropSchema[]>()
  return groupPropSchemas(contextualProperties.value.descriptors as PropSchema[])
})

function readSubValue(schema: PropSchema): unknown {
  const state = contextualProperties.value?.values[schema.key]
  return state?.kind === 'single' ? state.value : undefined
}

function readUnavailableReason(key: string): string | undefined {
  const state = contextualProperties.value?.values[key]
  return state?.kind === 'unavailable' ? state.reason : undefined
}

function previewSubProp(_key: string, value: unknown) {
  const session = store.editingSession.activeSession
  const node = selectedElement.value
  const contextual = contextualProperties.value
  if (!session || !node || !contextual)
    return
  const schema = contextual.descriptors.find(s => s.key === _key)
  if (!schema || contextual.values[_key]?.kind === 'unavailable')
    return
  propertyPreview.previewProperty(`contextual:${contextual.contextKey}:${_key}`, node, schema, value, {
    sessionPath: store.editingSession.path.map(frame => frame.nodeId),
    selectionLineage: session.selectionStore.lineageId,
    label: schema.label,
  })
}

async function updateSubProp(key: string, value: unknown) {
  const session = store.editingSession.activeSession
  const contextual = contextualProperties.value
  if (!session || !contextual)
    return
  const schema = contextual.descriptors.find(s => s.key === key)
  const requestToken = contextualRequestToken
  const nodeId = selectedElement.value?.id
  const lineage = session.selectionStore.lineageId
  if (schema?.type === 'font' && typeof value === 'string') {
    const loaded = await store.ensureFontLoaded({ family: value })
    if (requestToken !== contextualRequestToken || selectedElement.value?.id !== nodeId || store.editingSession.activeSession?.selectionStore.lineageId !== lineage)
      return
    if (!loaded) {
      propertyPreview.cancel(`contextual:${contextual.contextKey}:${key}`)
      return
    }
  }
  previewSubProp(key, value)
  propertyPreview.commit(`contextual:${contextual.contextKey}:${key}`)
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
  const binding = store.getMaterialManifest(el.type)?.common.binding
  return binding?.kind === 'ports' ? binding.dataContract : undefined
})

const selectedMaterialBinding = computed(() => {
  const el = selectedElement.value
  return el ? store.getMaterialManifest(el.type)?.common.binding : undefined
})

const selectedBindingPort = computed(() => resolveBindingPanelPort(selectedMaterialBinding.value))
const selectedDataContractPort = computed(() => resolveDataContractBindingPort(selectedMaterialBinding.value))

const selectedBindingFormatEditor = computed(() =>
  resolveOrdinaryFormatEditor(selectedMaterialBinding.value, selectedBindingPort.value),
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
    const def = store.getMaterialManifest(selectedElement.value.type)
    if (def?.common.binding.kind === 'none')
      return true
    if (!selectedBindingPort.value)
      return true
  }
  return false
})

function handleClearExternalBinding(bindIndex?: number) {
  const session = store.editingSession.activeSession
  if (!session || !subPropertySchema.value?.clearBinding)
    return
  subPropertySchema.value.clearBinding(session.tx, bindIndex == null ? 'value' : String(bindIndex))
}

// ─── Section Filter ─────────────────────────────────────────────────

function isSectionVisible(_sectionId: PanelSectionId): boolean {
  const el = selectedElement.value
  if (!el)
    return true
  return true
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

type GeometryKey = 'x' | 'y' | 'width' | 'height' | 'rotation' | 'alpha'

function isGeometryKey(key: string): key is GeometryKey {
  return key === 'x' || key === 'y' || key === 'width' || key === 'height' || key === 'rotation' || key === 'alpha'
}

function collectFieldPaths(value: unknown, prefix: string): DocumentFieldPath[] {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length > 0)
      return entries.flatMap(([key, child]) => collectFieldPaths(child, `${prefix}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`))
  }
  return prefix ? [prefix as DocumentFieldPath] : []
}

function previewPageProperty(descriptor: PagePropertyDescriptor, value: unknown) {
  const ctx = pagePropertyContext.value
  const patch = descriptor.normalize
    ? descriptor.normalize(value, ctx)
    : descriptor.source === 'document'
      ? defaultDocumentPatch(descriptor.path, value)
      : defaultPagePatch(descriptor.path, value)
  const { pageUpdates, documentUpdates } = splitPatch(patch)
  const fieldPaths = [...new Set([
    ...collectFieldPaths(pageUpdates, '/page'),
    ...collectFieldPaths(documentUpdates, ''),
  ])].sort()
  if (fieldPaths.length === 0)
    return

  propertyPreview.preview(`page:${descriptor.id}`, {
    label: descriptor.label,
    mergeKey: `page:${descriptor.id}`,
    operation: { kind: descriptor.source === 'document' ? 'document.property' : 'page.property', sessionPath: [], targetIds: ['document'], fieldPaths, selectionLineage: null, structural: false },
  }, preview => preview.replace((draft) => {
    if (pageUpdates)
      Object.assign(draft.page, pageUpdates)
    if (documentUpdates)
      Object.assign(draft, documentUpdates)
  }))
}

async function onPagePropertyChange(descriptor: PagePropertyDescriptor, value: unknown) {
  const selectedId = selectedElement.value?.id
  const requestSequence = committedContextSequence.value
  if (descriptor.editor === 'font' && typeof value === 'string') {
    const loaded = await store.ensureFontLoaded({ family: value })
    if (selectedElement.value?.id !== selectedId || committedContextSequence.value !== requestSequence)
      return
    if (!loaded) {
      rollbackPagePreview(descriptor.id)
      return
    }
  }
  previewPageProperty(descriptor, value)
  propertyPreview.commit(`page:${descriptor.id}`)
}

function rollbackPagePreview(descriptorId: string) {
  propertyPreview.cancel(`page:${descriptorId}`)
}

// ─── Element PropSchema ──────────────────────────────────────────

const materialSchemas = computed<PropSchema[]>(() => {
  if (!selectedElement.value)
    return []
  const def = store.getMaterialManifest(selectedElement.value.type)
  return [
    ...(def?.common.properties ?? []),
    ...createLayoutBehaviorPropSchemas({ page: store.schema.page }),
  ]
})

const visibleSchemas = computed(() => {
  const el = selectedElement.value
  if (!el)
    return []
  const elProps = {
    ...el.model,
    __hasBinding: selectedBindingPort.value
      ? getBindingRefs(el.bindings[selectedBindingPort.value]).length > 0
      : false,
    __placementMode: el.output.placement?.mode ?? ((el.model as Record<string, unknown>).layoutMode === 'fixed' ? 'fixed' : 'flow'),
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

watch(() => selectedElement.value?.id, (nodeId, previousNodeId) => {
  if (nodeId !== previousNodeId)
    propertyPreview.cancelActive()
})

watch(() => store.editingSession.activeSession?.nodeId, (nodeId, previousNodeId) => {
  if (nodeId !== previousNodeId)
    propertyPreview.cancelActive()
})

onUnmounted(() => propertyPreview.cancelActive())

function previewProp(key: string, value: unknown) {
  const el = selectedElement.value
  if (!el)
    return
  const schema = materialSchemas.value.find(s => s.key === key)
  if (!schema)
    return
  const session = store.editingSession.activeSession
  propertyPreview.previewProperty(key, el, schema, value, {
    sessionPath: store.editingSession.path.map(frame => frame.nodeId),
    selectionLineage: session?.selectionStore.lineageId ?? store.selection.lineageId,
    label: schema.label,
  })
}

async function updateProp(key: string, value: unknown) {
  const el = selectedElement.value
  if (!el)
    return
  const schema = materialSchemas.value.find(s => s.key === key)
  const sessionPath = store.editingSession.path.map(frame => frame.nodeId).join('\u0000')
  const lineage = store.editingSession.activeSession?.selectionStore.lineageId ?? store.selection.lineageId
  if (schema?.type === 'font' && typeof value === 'string') {
    const loaded = await store.ensureFontLoaded({ family: value })
    if (selectedElement.value?.id !== el.id || store.editingSession.path.map(frame => frame.nodeId).join('\u0000') !== sessionPath || (store.editingSession.activeSession?.selectionStore.lineageId ?? store.selection.lineageId) !== lineage)
      return
    if (!loaded) {
      rollbackPropPreview(key)
      return
    }
  }

  if (!schema)
    return
  previewProp(key, value)
  propertyPreview.commit(key)
}

function rollbackPropPreview(key: string) {
  propertyPreview.cancel(key)
}

function updateImagePropFromPicker(key: string, result: DesignerResolvedAsset) {
  const el = selectedElement.value
  if (!el)
    return

  const updates: Record<string, unknown> = { [key]: result.url }
  propertyPreview.cancelActive()
  const oldValues: Record<string, unknown> = {}

  if (key === 'src' && result.alt && isBlankAlt(el.model.alt)) {
    updates.alt = result.alt
    oldValues.alt = el.model.alt
  }

  const cmd = new UpdateMaterialModelCommand(
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

function previewGeometry(key: string, value: number) {
  if (!selectedElement.value || !isGeometryKey(key))
    return
  if (key === 'rotation' && !isElementRotatable(store, selectedElement.value))
    return
  if (!canEditGeometry(store, selectedElement.value, key))
    return
  const el = selectedElement.value
  propertyPreview.preview(`geometry:${key}`, {
    label: key,
    mergeKey: `geometry:${el.id}:${key}`,
    operation: { kind: 'geometry.property', sessionPath: [], targetIds: [`node:${el.id}`], fieldPaths: [`/${key}`], selectionLineage: null, structural: false },
  }, (preview) => {
    if (!preview.replaceNode)
      throw new Error('Preview transaction does not support node-scoped replacement')
    preview.replaceNode(el.id, [`/${key}`], (draft) => {
      (draft as unknown as Record<GeometryKey, number>)[key] = value
    })
  })
}

function commitGeometry(key: string, _value: number) {
  const el = selectedElement.value
  if (!el || !isGeometryKey(key))
    return
  if (key === 'rotation' && !isElementRotatable(store, el))
    return
  if (!canEditGeometry(store, el, key))
    return
  propertyPreview.commit(`geometry:${key}`)
}

// ─── Element meta (hidden/locked) ──────────────────────────────

function updateElementMeta(key: string, value: unknown) {
  if (!selectedElement.value)
    return
  if (key !== 'hidden' && key !== 'locked')
    return
  const boolValue = value === true
  const cmd = new UpdateMaterialEditorStateCommand(
    store.schema.elements,
    selectedElement.value.id,
    { [key]: boolValue },
  )
  store.commands.execute(cmd)
}

function updateRenderCondition(condition: MaterialNode['output']['renderCondition'], mergeKey?: string) {
  const element = selectedElement.value
  if (!element)
    return
  store.commands.execute(new UpdateRenderConditionCommand(
    store.schema.elements,
    element.id,
    condition,
    mergeKey ? `condition:${element.id}:${mergeKey}` : undefined,
  ))
}

// ─── Binding ────────────────────────────────────────────────────

function clearBinding(nodeId: string, port: string) {
  const cmd = new ClearBindingCommand(store.schema.elements, nodeId, port)
  store.commands.execute(cmd)
}

function updateBindingFormat(format: BindingDisplayFormat | undefined, port: string | undefined, bindIndex?: number) {
  if (hasSubBinding.value) {
    const session = store.editingSession.activeSession
    if (!session || !subPropertySchema.value?.updateBindingFormat)
      return
    subPropertySchema.value.updateBindingFormat(session.tx, format, bindIndex == null ? 'value' : String(bindIndex))
    return
  }
  if (!selectedElement.value || !port)
    return
  const cmd = new UpdateBindingFormatCommand(store.schema.elements, selectedElement.value.id, format, bindIndex, port)
  store.commands.execute(cmd)
}

function updateMaterialDataBinding(binding: DataContractBinding | undefined) {
  const el = selectedElement.value
  if (!el)
    return
  const port = selectedDataContractPort.value
  if (!port)
    return
  const cmd = new UpdateMaterialBindingCommand(store.schema.elements, el.id, binding, port)
  store.commands.execute(cmd)
}

function getBindingDataSource(sourceId: string) {
  return store.dataSourceRegistry.getSourceSync(sourceId)
}

function readPropValue(schema: PropSchema): unknown {
  const el = selectedElement.value
  if (!el)
    return undefined
  const value = resolvePropertyAccessor(schema).read(el)
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
      <template v-if="canEditSelectedElement && contextualProperties && isSectionVisible('overlay')">
        <EiPanel
          v-for="[group, schemas] in subGroupedSchemas"
          :key="`sub-${group}`"
          :title="`${store.t(contextualProperties.contextKey)} - ${groupLabel(group)}`"
          collapsible
          flat
        >
          <div class="ei-properties-panel__fields">
            <PropSchemaEditor
              v-for="schema in schemas"
              :key="schema.key"
              :schema="schema"
              :value="readSubValue(schema)"
              :disabled="contextualProperties.values[schema.key]?.kind === 'unavailable'"
              :mixed="contextualProperties.values[schema.key]?.kind === 'mixed'"
              :unavailable-reason="readUnavailableReason(schema.key)"
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
      <EiPanel v-if="canEditSelectedElement && !hasSubBinding && selectedMaterialDataContract && selectedDataContractPort && isSectionVisible('binding')" :title="store.t('designer.property.dataBinding')" collapsible flat>
        <MaterialDataBindingEditor
          :element="selectedElement"
          :port="selectedDataContractPort"
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
          :port="selectedBindingPort"
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

      <EiPanel v-if="canEditSelectedElement && selectedConditionCapability && isSectionVisible('condition')" :title="store.t('designer.property.conditionalRendering')" collapsible flat>
        <ConditionEditor
          :element="selectedElement"
          :capability="selectedConditionCapability"
          :t="store.t.bind(store)"
          @update="updateRenderCondition"
        />
      </EiPanel>

      <!-- Visibility / Lock -->
      <EiPanel v-if="isSectionVisible('visibility')" :title="store.t('designer.property.style')" collapsible flat>
        <div class="ei-properties-panel__fields">
          <EiSwitch
            v-if="showHiddenSwitch"
            :label="store.t('designer.property.hidden')"
            :model-value="selectedElement.editorState?.hidden ?? false"
            @update:model-value="updateElementMeta('hidden', $event)"
          />
          <EiSwitch
            v-if="showLockedSwitch"
            :label="store.t('designer.property.locked')"
            :model-value="selectedElement.editorState?.locked ?? false"
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
