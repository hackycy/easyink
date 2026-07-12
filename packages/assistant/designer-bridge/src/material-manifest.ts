import type { AssistantMaterialBindingDefinition, AssistantMaterialDataContract, AssistantMaterialManifest, AssistantMaterialProp } from '@easyink/assistant-capabilities'
import type { DesignerStore, PropertyDescriptor } from '@easyink/designer'

type DesignerMaterialManifest = ReturnType<DesignerStore['listEditableMaterialManifests']>[number]
type DesignerMaterialBinding = DesignerMaterialManifest['common']['binding']

export function createAssistantMaterialManifest(store: DesignerStore): AssistantMaterialManifest {
  return {
    materials: store.listEditableMaterialManifests().map(material => ({
      type: material.type,
      name: store.t(material.common.nameKey),
      capabilities: mapCapabilities(material),
      binding: mapBindingDefinition(material.common.binding),
      props: material.common.properties.map(prop => sanitizePropSchema(prop)),
      ai: toSerializable(material.facets.ai?.descriptor) as AssistantMaterialManifest['materials'][number]['ai'],
    })),
  }
}

function mapCapabilities(material: DesignerMaterialManifest): AssistantMaterialManifest['materials'][number]['capabilities'] {
  const { interaction, binding, structure } = material.common
  return compactObject({
    bindable: binding.kind !== 'none',
    rotatable: interaction.rotatable,
    resizable: interaction.resizable,
    supportsChildren: structure.slots.length > 0,
    supportsAnimation: interaction.supportsAnimation,
    supportsUnionDrop: interaction.supportsUnionDrop,
    multiBinding: binding.kind === 'ports' && binding.ports.length > 1,
    keepAspectRatio: interaction.keepAspectRatio,
  })
}

function mapBindingDefinition(binding: DesignerMaterialBinding): AssistantMaterialBindingDefinition {
  if (binding.kind === 'none')
    return { kind: 'none' }

  if (binding.dataContract) {
    const editor = binding.ports.find(port => port.formatEditor !== false)?.formatEditor ?? false
    return {
      kind: 'data-contract',
      contract: toSerializable(binding.dataContract) as AssistantMaterialDataContract,
      formatEditor: cloneFormatEditor(editor),
    } as AssistantMaterialBindingDefinition
  }

  const displayPorts = binding.ports.filter(port => port.role === 'display' && port.key.kind === 'exact')
  if (displayPorts.length !== 1)
    return { kind: 'custom' }
  const port = displayPorts[0]!
  const modelPath = port.modelPath?.match(/^\/model\/([^/]+)$/)?.[1]
  if (!modelPath)
    return { kind: 'custom' }
  return {
    kind: 'ordinary',
    primaryProp: modelPath.replaceAll('~1', '/').replaceAll('~0', '~'),
    formatEditor: cloneFormatEditor(port.formatEditor),
  }
}

function cloneFormatEditor(editor: false | { tabs: readonly ['preset'], presetTypes?: readonly string[] }) {
  return editor === false
    ? false
    : { tabs: [...editor.tabs], defaultTab: 'preset', presetTypes: editor.presetTypes ? [...editor.presetTypes] : undefined }
}

function sanitizePropSchema(prop: PropertyDescriptor): AssistantMaterialProp {
  return compactObject({
    key: prop.key,
    label: prop.label,
    type: prop.type,
    group: prop.group,
    default: toSerializable(prop.default),
    enum: prop.enum?.map((option: { label: string, value: unknown }) => compactObject({
      label: option.label,
      value: toSerializable(option.value),
    })),
    min: prop.min,
    max: prop.max,
    step: prop.step,
    nullable: prop.nullable,
    editor: prop.editor,
    editorOptions: toSerializableRecord(prop.editorOptions),
  }) as AssistantMaterialProp
}

function toSerializableRecord(value: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const serializable = toSerializable(value)
  return serializable && typeof serializable === 'object' && !Array.isArray(serializable)
    ? serializable as Record<string, unknown>
    : undefined
}

function toSerializable(value: unknown): unknown {
  if (value === undefined || typeof value === 'function' || typeof value === 'symbol')
    return undefined
  if (value === null || typeof value !== 'object')
    return value
  if (Array.isArray(value))
    return value.map(item => toSerializable(item)).filter(item => item !== undefined)

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, entry]) => [key, toSerializable(entry)] as const)
      .filter(([, entry]) => entry !== undefined),
  )
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as Partial<T>
}
