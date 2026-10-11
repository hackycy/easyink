import type { AssistantMaterialBindingDefinition, AssistantMaterialManifest, AssistantMaterialProp } from '@easyink/assistant-capabilities'
import type { DeepReadonly } from '@easyink/plugin-api'
import type { DesignerContext, PropSchema } from '@easyink/plugin-api/designer'
import type { DesignerMaterial } from '@easyink/plugin-api/ui'

export function createAssistantMaterialManifest(context: DesignerContext): AssistantMaterialManifest {
  return {
    materials: context.getMaterials().map((entry) => {
      const material = entry as DeepReadonly<DesignerMaterial>
      return {
        type: material.model.type,
        name: material.ui?.palette?.[0]?.label ?? material.model.type,
        capabilities: { ...material.model.capabilities, pageAware: material.model.pageAware },
        binding: sanitizeBindingDefinition(material.model.binding),
        props: material.properties?.map(prop => sanitizePropSchema(prop)) ?? [],
        ai: material.ai ? JSON.parse(JSON.stringify(material.ai)) : undefined,
      }
    }),
  }
}

function sanitizeBindingDefinition(binding: unknown): AssistantMaterialBindingDefinition {
  return toSerializable(binding) as AssistantMaterialBindingDefinition
}

function sanitizePropSchema(prop: DeepReadonly<PropSchema>): AssistantMaterialProp {
  return compactObject({
    key: prop.key,
    label: prop.label,
    type: prop.type,
    group: prop.group,
    default: toSerializable(prop.default),
    enum: prop.enum?.map(option => compactObject({
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
