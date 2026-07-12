import type { MaterialNode } from '@easyink/schema'
import { recordSchemaAdapter } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { DiagnosticsChannel } from './diagnostics'
import { FontService } from './font-service'

describe('font service', () => {
  it('preloads material-private fonts through profile introspection', async () => {
    const adapter = {
      ...recordSchemaAdapter(1),
      introspect: (node: MaterialNode) => ({
        identities: [],
        structures: [],
        references: [],
        bindings: [],
        resources: [{
          path: '/model/fontFamily' as const,
          value: String(node.model.fontFamily),
          kind: 'font' as const,
        }],
      }),
    }
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'private-font', schemaAdapter: adapter }),
    ])
    const node = profile.createNode('private-font', { id: 'private-font-1', model: { fontFamily: 'HostedFont' } })
    const loadFont = vi.fn(async () => new ArrayBuffer(0))
    const service = new FontService(new DiagnosticsChannel(), profile)
    service.setProvider({ listFonts: async () => [], loadFont })
    service.setTarget(document)

    await service.preloadDocumentFonts({
      version: '1.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 210, height: 297 },
      guides: { x: [], y: [] },
      elements: [node],
    })

    expect(loadFont).toHaveBeenCalledWith('HostedFont', undefined, undefined)
  })
})
