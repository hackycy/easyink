import type { MaterialViewerFacet, ViewerRenderContext } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { viewerText } from '@easyink/core'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { ProfileMaterialRuntime } from './material-runtime'

const node: MaterialNode = {
  id: 'node',
  type: 'good',
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  modelVersion: 1,
  model: {},
  slots: {},
  bindings: {},
  output: { visibility: 'include' },
}
const context: ViewerRenderContext = {
  data: {},
  resolvedProps: {},
  pageIndex: 0,
  unit: 'mm',
  zoom: 1,
  capabilities: { sanitizeMarkup: () => { throw new Error('unused') } },
}

describe('profileMaterialRuntime', () => {
  it('prepares unique types and isolates failed activation behind a sentinel', async () => {
    const activate = vi.fn((): MaterialViewerFacet => ({
      extension: { render: () => ({ tree: viewerText('good') }) },
      capabilities: {},
    }))
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({ type: 'good', viewer: activate }),
      createTestMaterialManifest({ type: 'bad', viewer: () => { throw new Error('boom') } }),
    ])
    const runtime = new ProfileMaterialRuntime(profile)

    const diagnostics = await runtime.prepare(['good', 'bad', 'good'])

    expect(activate).toHaveBeenCalledTimes(1)
    expect(runtime.get('good')?.state).toBe('active')
    expect(runtime.get('bad')?.state).toBe('quarantined')
    expect(diagnostics).toEqual([expect.objectContaining({ code: 'MATERIAL_FACET_ACTIVATION_FAILED', materialType: 'bad' })])
    expect(runtime.render(node, context).tree).toEqual(viewerText('good'))
    expect(runtime.render({ ...node, type: 'bad' }, context).tree).toEqual(expect.objectContaining({ kind: 'element' }))
  })

  it('disposes active facets once through the public facet host', async () => {
    const dispose = vi.fn()
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'good',
        viewer: () => ({ extension: { render: () => ({ tree: viewerText('good') }) }, capabilities: {}, dispose }),
      }),
    ])
    const runtime = new ProfileMaterialRuntime(profile)
    await runtime.prepare(['good'])

    await runtime.dispose()
    await runtime.dispose()

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('snapshots declared capabilities at activation', async () => {
    const imperativeDom = ['chart']
    const profile = createTestCompiledMaterialProfile([
      createTestMaterialManifest({
        type: 'good',
        viewer: () => ({
          extension: { render: () => ({ tree: viewerText('good') }) },
          capabilities: { imperativeDom },
        }),
      }),
    ])
    const runtime = new ProfileMaterialRuntime(profile)
    await runtime.prepare(['good'])

    imperativeDom.push('late-escalation')

    expect(runtime.getCapabilities('good')?.imperativeDom).toEqual(['chart'])
  })
})
