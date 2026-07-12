import type { AssistantMaterialBindingDefinition, AssistantMaterialManifest, AssistantMaterialProp } from '@easyink/assistant-capabilities'
import type { DesignerStore, PropertyDescriptor } from '@easyink/designer'

const MATERIAL_BINDING_KEY = 'binding'
const MATERIAL_PROPS_KEY = 'props'

export function createAssistantMaterialManifest(store: DesignerStore): AssistantMaterialManifest {
  return {
    materials: store.listMaterials().map(material => ({
      type: material.type,
      name: material.name,
      capabilities: material.capabilities,
      binding: sanitizeBindingDefinition(material[MATERIAL_BINDING_KEY]),
      props: material[MATERIAL_PROPS_KEY].map(prop => sanitizePropSchema(prop)),
      ai: material.aiDescriptor,
    })),
  }
}

function sanitizeBindingDefinition(binding: unknown): AssistantMaterialBindingDefinition {
  return toSerializable(binding) as AssistantMaterialBindingDefinition
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
