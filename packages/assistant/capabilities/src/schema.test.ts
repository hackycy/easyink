import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type { AssistantMaterialManifest } from './types'
import { deepClone } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import { collectDeterministicErrors, createAssistantPreview, repairAssistantSchema, validateAssistantSchema } from './index'
import { AssistantMaterialManifestSchema } from './types'

const schema: DocumentSchema = {
  version: '1.0.0',
  unit: 'mm',
  page: { mode: 'fixed', width: 210, height: 297 },
  guides: { x: [], y: [] },
  elements: [{
    id: 'txt-title',
    type: 'text',
    x: 10,
    y: 10,
    width: 100,
    height: 8,
    modelVersion: 1,
    model: { content: '标题', fontSize: 12 },
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }],
}

const dataSource: DataSourceDescriptor = {
  id: 'document',
  name: 'document',
  fields: [{
    name: 'title',
    path: 'title',
  }],
}

function materialManifest(type: string): AssistantMaterialManifest {
  return {
    version: 1,
    profileId: 'test',
    engineVersion: '0.0.30',
    materials: [{
      type,
      modelVersion: 1,
      common: {
        nameKey: `materials.${type}.name`,
        category: 'test',
        defaultNode: { width: 10, height: 10, unit: 'mm', model: {} },
        interaction: { rotatable: true, resizable: true },
        binding: { kind: 'none' },
        layout: { intrinsicSize: 'none', fragmentation: 'none', pageRepeat: 'none', overflow: 'clip' },
        structure: { slots: [] },
        properties: [],
      },
      generation: { enabled: true, modelSchema: {}, bindingShape: {}, examples: [{}] },
    }],
  }
}

describe('assistant capabilities', () => {
  it('validates schema candidates and creates previews', () => {
    const report = validateAssistantSchema(schema)
    const preview = createAssistantPreview(schema, dataSource, [])

    expect(report.valid).toBe(true)
    expect(preview.elementCount).toBe(1)
    expect(preview.dataFieldCount).toBe(1)
  })

  it('repairs auto-fixable schema issues before returning to Designer', () => {
    const broken = { ...schema, version: '', elements: undefined } as never

    const repair = repairAssistantSchema(broken)

    expect(repair.repairs.map(item => item.path)).toContain('version')
    expect(repair.validation.valid).toBe(true)
    expect(repair.schema.elements).toEqual([])
  })

  it('accepts schema elements registered in the active material manifest', () => {
    const report = validateAssistantSchema(schema, { materialManifest: materialManifest('text') })

    expect(report.valid).toBe(true)
  })

  it('keeps repair validation scoped to the active material manifest', () => {
    const repair = repairAssistantSchema(schema, { materialManifest: materialManifest('image') })

    expect(repair.validation.valid).toBe(false)
    expect(repair.validation.errors).toContainEqual(expect.objectContaining({
      code: 'UNREGISTERED_MATERIAL_TYPE',
    }))
  })

  it('strictly validates versioned portable manifests at every declared object boundary', () => {
    expect(AssistantMaterialManifestSchema.safeParse(materialManifest('text')).success).toBe(true)
    expect(AssistantMaterialManifestSchema.safeParse({ ...materialManifest('text'), extra: true }).success).toBe(false)
    const nested = materialManifest('text')
    ;(nested.materials[0]!.common.interaction as Record<string, unknown>).extra = true
    expect(AssistantMaterialManifestSchema.safeParse(nested).success).toBe(false)
  })

  it('uses shared JSON Schema semantics and escaped deterministic diagnostic paths', () => {
    const manifest = materialManifest('text')
    manifest.materials[0]!.generation.modelSchema = {
      type: 'object',
      required: ['mode', 'rows'],
      properties: {
        mode: { enum: ['a', 'b'] },
        rows: { type: 'array', items: { oneOf: [{ type: 'number' }, { const: 'auto' }] } },
      },
      additionalProperties: false,
    }
    manifest.materials[0]!.generation.bindingShape = { type: 'object', properties: {}, additionalProperties: false }
    const candidate = {
      ...schema,
      elements: [{
        ...schema.elements[0]!,
        model: { mode: 'bad', rows: [false] },
        bindings: { 'a/b': { sourceId: 'data', fieldPath: 'value' } },
      }],
    }

    const report = validateAssistantSchema(candidate, { materialManifest: manifest })

    expect(report.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'MODEL_SCHEMA_ENUM', path: 'elements.txt-title.model/mode' }),
      expect.objectContaining({ code: 'MODEL_SCHEMA_ONE_OF', path: 'elements.txt-title.model/rows/0' }),
      expect.objectContaining({ code: 'BINDING_SCHEMA_ADDITIONAL_PROPERTIES', path: 'elements.txt-title.bindings/a~1b' }),
    ]))
  })

  it('rejects invalid portable schemas and accepts empty required model pointers', () => {
    const invalid = materialManifest('text')
    invalid.materials[0]!.generation.modelSchema = { type: 'invalid' }
    expect(AssistantMaterialManifestSchema.safeParse(invalid).success).toBe(false)

    const root = materialManifest('text')
    root.materials[0]!.generation.requiredModelPaths = ['']
    expect(validateAssistantSchema(schema, { materialManifest: root }).errors)
      .not
      .toContainEqual(expect.objectContaining({ code: 'MATERIAL_PROPS_MISSING' }))
  })

  it('enforces portable generation completeness and required example paths', () => {
    const prefixed = materialManifest('text')
    prefixed.materials[0]!.generation.requiredModelPaths = ['/model/foo']
    expect(AssistantMaterialManifestSchema.safeParse(prefixed).success).toBe(false)

    const missing = materialManifest('text')
    missing.materials[0]!.generation.requiredModelPaths = ['/content']
    missing.materials[0]!.generation.examples = [{}]
    expect(AssistantMaterialManifestSchema.safeParse(missing).success).toBe(false)

    const incomplete = materialManifest('text')
    delete (incomplete.materials[0]!.generation as { modelSchema?: unknown }).modelSchema
    expect(AssistantMaterialManifestSchema.safeParse(incomplete).success).toBe(false)
  })

  it('accepts root pointers for primitive and null examples', () => {
    for (const example of [1, null]) {
      const manifest = materialManifest('text')
      manifest.materials[0]!.generation.requiredModelPaths = ['']
      manifest.materials[0]!.generation.examples = [example]
      expect(AssistantMaterialManifestSchema.safeParse(manifest).success).toBe(true)
    }
  })

  it('rejects duplicate material types and permits incomplete disabled generation', () => {
    const duplicate = materialManifest('text')
    duplicate.materials.push(deepClone(duplicate.materials[0]!))
    expect(AssistantMaterialManifestSchema.safeParse(duplicate).success).toBe(false)

    const disabled = materialManifest('text')
    disabled.materials[0]!.generation = { enabled: false, examples: [] } as never
    expect(AssistantMaterialManifestSchema.safeParse(disabled).success).toBe(true)
    expect(validateAssistantSchema(schema, { materialManifest: disabled }).errors)
      .not
      .toContainEqual(expect.objectContaining({ code: 'MATERIAL_PROPS_MISSING' }))

    const disabledBadPath = materialManifest('text')
    disabledBadPath.materials[0]!.generation = { enabled: false, examples: [], requiredModelPaths: ['/model/content'] } as never
    expect(AssistantMaterialManifestSchema.safeParse(disabledBadPath).success).toBe(false)
  })

  it('requires planned page-level text watermarks to use page layers', () => {
    const issues = collectDeterministicErrors(schema, {
      pageRenderLayers: [{ kind: 'watermark', type: 'text', text: 'DRAFT' }],
    })

    expect(issues).toContainEqual(expect.objectContaining({
      code: 'PAGE_RENDER_LAYER_MISSING',
      path: 'page.layers',
    }))
  })

  it('accepts matching page-level text watermark layers', () => {
    const issues = collectDeterministicErrors({
      ...schema,
      page: {
        ...schema.page,
        layers: [{
          id: 'page-watermark',
          kind: 'watermark',
          type: 'text',
          enabled: true,
          text: 'DRAFT',
        }],
      },
    }, {
      pageRenderLayers: [{ kind: 'watermark', type: 'text', text: 'DRAFT' }],
    })

    expect(issues).not.toContainEqual(expect.objectContaining({
      code: 'PAGE_RENDER_LAYER_MISSING',
    }))
  })
})
