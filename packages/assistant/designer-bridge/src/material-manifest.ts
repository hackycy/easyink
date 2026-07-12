import type { AssistantMaterialManifest, AssistantMaterialProp } from '@easyink/assistant-capabilities'
import type { CompiledMaterialProfile, MaterialCommonFacet, PropertyDescriptor } from '@easyink/core'
import type { JsonValue } from '@easyink/shared'
import { cloneJsonValue, deepFreezeJsonValue } from '@easyink/shared'

export function createAssistantMaterialManifest(profile: CompiledMaterialProfile): AssistantMaterialManifest {
  const projected: AssistantMaterialManifest = {
    version: 1,
    profileId: profile.id,
    engineVersion: profile.engineVersion,
    materials: [...profile.generatableTypes].map((type) => {
      const manifest = profile.getManifest(type)
      if (!manifest)
        throw new Error(`MATERIAL_PROFILE_MANIFEST_MISSING:${type}`)
      const ai = manifest.facets.ai
      if (!ai?.generation.enabled || !ai.generation.modelSchema || !ai.generation.bindingShape)
        throw new Error(`MATERIAL_AI_GENERATION_INCOMPLETE:${type}`)
      return {
        type,
        modelVersion: manifest.modelVersion,
        common: projectCommonFacet(manifest.common),
        generation: clonePortable<AssistantMaterialManifest['materials'][number]['generation']>(ai.generation),
        ...(ai.descriptor === undefined ? {} : { descriptor: clonePortable(ai.descriptor) }),
      }
    }),
  }
  return deepFreezeJsonValue(projected as unknown as JsonValue) as unknown as AssistantMaterialManifest
}

function projectCommonFacet(common: MaterialCommonFacet): AssistantMaterialManifest['materials'][number]['common'] {
  return {
    nameKey: common.nameKey,
    category: common.category,
    defaultNode: {
      width: common.defaultNode.width,
      height: common.defaultNode.height,
      unit: common.defaultNode.unit,
      model: clonePortable(common.defaultNode.model),
      ...(common.defaultNode.bindings === undefined ? {} : { bindings: clonePortable(common.defaultNode.bindings) }),
      ...(common.defaultNode.output === undefined ? {} : { output: clonePortable(common.defaultNode.output) }),
    },
    interaction: clonePortable(common.interaction),
    binding: clonePortable(common.binding),
    layout: clonePortable(common.layout),
    structure: clonePortable(common.structure),
    properties: common.properties.map(projectProperty),
  }
}

function projectProperty(prop: PropertyDescriptor): AssistantMaterialProp {
  return {
    key: prop.key,
    label: prop.label,
    type: prop.type,
    ...(prop.group === undefined ? {} : { group: prop.group }),
    ...(prop.default === undefined ? {} : { default: clonePortable(prop.default) }),
    ...(prop.enum === undefined
      ? {}
      : {
          enum: prop.enum.map(option => ({ label: option.label, value: clonePortable(option.value) })),
        }),
    ...(prop.min === undefined ? {} : { min: prop.min }),
    ...(prop.max === undefined ? {} : { max: prop.max }),
    ...(prop.step === undefined ? {} : { step: prop.step }),
    ...(prop.nullable === undefined ? {} : { nullable: prop.nullable }),
    ...(prop.editor === undefined ? {} : { editor: prop.editor }),
    ...(prop.editorOptions === undefined ? {} : { editorOptions: clonePortable(prop.editorOptions) }),
    ...(prop.accessor === undefined ? {} : { targetPaths: [...prop.accessor.paths] }),
  }
}

function clonePortable<T>(value: unknown): T {
  return cloneJsonValue(value as unknown as JsonValue) as T
}
