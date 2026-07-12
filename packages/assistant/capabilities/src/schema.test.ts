import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DocumentSchema } from '@easyink/schema'
import type { AssistantMaterialManifest } from './types'
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
