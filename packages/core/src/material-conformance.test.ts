import type { MaterialViewerFacet } from './material-viewer'
import { describe, expect, it, vi } from 'vitest'
import { assertMaterialConformance, runMaterialConformance } from './material-conformance'
import { createTestMaterialManifest } from './testing/material-profile'
import { viewerText } from './viewer-render-tree'

function viewerFacet(): MaterialViewerFacet {
  return { capabilities: {}, extension: { render: () => ({ tree: viewerText('ok') }) } }
}

describe('material conformance', () => {
  it('reports independent normalization, default validation, and property failures', async () => {
    let count = 0
    const manifest = createTestMaterialManifest({
      type: 'broken',
      defaultModel: { value: 1 },
      viewer: async () => viewerFacet(),
      properties: [{
        key: 'value',
        label: 'value',
        type: 'number',
        accessor: Object.freeze({
          paths: Object.freeze(['/model/value'] as const),
          read: (node: any) => node.model.value,
          write: (node: any) => { node.output.leak = true },
        }),
      }],
      schemaAdapter: {
        currentModelVersion: 1,
        modelUnitPolicy: 'independent',
        migrations: [{ from: 0, to: 1, migrate: node => ({ ...node, modelVersion: 1 }) }],
        validateInput: () => [],
        normalize: node => ({ ...node, model: { ...node.model, count: count++ } }),
        validate: () => [{ code: 'BROKEN_DEFAULT', severity: 'error', path: '/model', message: 'invalid' }],
        introspect: () => ({ identities: [], structures: [], references: [], resources: [], bindings: [] }),
      },
    })
    const report = await runMaterialConformance(manifest)
    expect(report.valid).toBe(false)
    expect(report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'CONFORMANCE_NORMALIZE_NOT_IDEMPOTENT',
      'CONFORMANCE_DEFAULT_INVALID',
      'CONFORMANCE_PROPERTY_UNDECLARED_WRITE',
    ]))
    expect(Object.isFrozen(report.issues)).toBe(true)
  })

  it('reports migration, introspection, surface, render, mount, and disposer failures together', async () => {
    let migration = 0
    const dispose = vi.fn(() => {
      throw new Error('dispose failed')
    })
    const manifest = createTestMaterialManifest({
      type: 'many-failures',
      designer: false,
      ai: true,
      viewer: async () => ({ capabilities: {}, extension: { render: () => ({ tree: { kind: 'bad' } as never }) } }),
      schemaAdapter: {
        currentModelVersion: 1,
        modelUnitPolicy: 'independent',
        migrations: [{
          from: 0,
          to: 1,
          migrate: (node) => {
            (node.model as any).mutated = true
            return { ...node, modelVersion: 1, x: migration++ }
          },
        }],
        validateInput: () => [],
        normalize: node => ({ ...node }),
        validate: () => [],
        introspect: () => ({
          identities: [{ path: '/model/missing', location: 'value', value: 'x', target: { scope: 'material', kind: 'id' } }],
          structures: [],
          references: [],
          resources: [],
          bindings: [],
        }),
      },
    })
    const report = await runMaterialConformance(manifest, { mountViewerTree: () => ({ dispose }) })
    expect(report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'CONFORMANCE_MIGRATION_NOT_DETERMINISTIC',
      'CONFORMANCE_MIGRATION_MUTATED_INPUT',
      'CONFORMANCE_INTROSPECTION_POINTER_INVALID',
      'CONFORMANCE_AI_SURFACE_INCOMPLETE',
    ]))
  })

  it('accepts a complete manifest and formats assertion failures deterministically', async () => {
    const valid = createTestMaterialManifest({ type: 'valid', viewer: async () => viewerFacet() })
    await expect(assertMaterialConformance(valid)).resolves.toBeUndefined()
    const invalid = createTestMaterialManifest({ type: 'no-viewer', viewer: false })
    await expect(assertMaterialConformance(invalid)).rejects.toThrow(/CONFORMANCE_VIEWER_REQUIRED \/facets\/viewer:/)
  })

  it('reports mount and repeated disposer failures with stable codes', async () => {
    const manifest = createTestMaterialManifest({ type: 'mount-failure', viewer: async () => viewerFacet() })
    const mountReport = await runMaterialConformance(manifest, {
      mountViewerTree: () => { throw new Error('mount failed') },
    })
    expect(mountReport.issues.map(issue => issue.code)).toContain('CONFORMANCE_VIEWER_MOUNT_FAILED')

    const disposeReport = await runMaterialConformance(manifest, {
      mountViewerTree: () => ({ dispose: () => { throw new Error('dispose failed') } }),
    })
    expect(disposeReport.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'CONFORMANCE_VIEWER_DISPOSE_FAILED',
      'CONFORMANCE_VIEWER_DISPOSE_NOT_IDEMPOTENT',
    ]))
  })
})
