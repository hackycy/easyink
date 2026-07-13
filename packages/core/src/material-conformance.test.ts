import type { MaterialNode } from '@easyink/schema'
import type { MaterialConformanceOptions } from './material-conformance'
import type { MaterialViewerFacet, ViewerRenderContext } from './material-viewer'
import { describe, expect, it, vi } from 'vitest'
import { assertMaterialConformance, compareMaterialConformanceIssues, runMaterialConformance } from './material-conformance'
import { defineMaterialFacetFactory } from './material-manifest'
import { createTestMaterialManifest } from './testing/material-profile'
import { viewerText } from './viewer-render-tree'

function viewerFacet(): MaterialViewerFacet {
  return { capabilities: {}, extension: { render: () => ({ tree: viewerText('ok') }) } }
}

function options(extra: MaterialConformanceOptions = {}): MaterialConformanceOptions {
  return { executionMode: 'trusted-in-process', ...extra }
}

describe('material conformance', () => {
  it('reports independent normalization, default validation, and property failures', async () => {
    let count = 0
    const manifest = createTestMaterialManifest({
      type: 'broken',
      defaultModel: { value: 1 },
      viewer: () => viewerFacet(),
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
    const report = await runMaterialConformance(manifest, options())
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
      viewer: () => ({ capabilities: {}, extension: { render: () => ({ tree: { kind: 'bad' } as never }) } }),
      schemaAdapter: {
        currentModelVersion: 1,
        modelUnitPolicy: 'independent',
        migrations: [{
          from: 0,
          to: 1,
          conformance: {
            fixtures: [{ id: 'bad-v0', input: { model: {} } }],
            declaredWritePaths: ['/modelVersion'],
          },
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
    const report = await runMaterialConformance(manifest, options({ mountViewerTree: () => ({ dispose }) }))
    expect(report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'CONFORMANCE_MIGRATION_NOT_DETERMINISTIC',
      'CONFORMANCE_MIGRATION_MUTATED_INPUT',
      'CONFORMANCE_INTROSPECTION_POINTER_INVALID',
      'CONFORMANCE_AI_SURFACE_INCOMPLETE',
    ]))
  })

  it('accepts a complete manifest and formats assertion failures deterministically', async () => {
    const valid = createTestMaterialManifest({ type: 'valid', viewer: () => viewerFacet() })
    await expect(assertMaterialConformance(valid, options())).resolves.toBeUndefined()
    const invalid = createTestMaterialManifest({ type: 'no-viewer', viewer: false })
    await expect(assertMaterialConformance(invalid, options())).rejects.toThrow(/CONFORMANCE_VIEWER_REQUIRED \/facets\/viewer:/)
  })

  it('provides a complete frozen Task 1 render context to viewer conformance', async () => {
    const manifest = createTestMaterialManifest({
      type: 'layout-context',
      defaultModel: { value: 'resolved' },
      viewer: () => ({
        capabilities: {},
        extension: {
          render: (node: MaterialNode, context: ViewerRenderContext) => {
            const slot = context.renderSlot('missing')
            context.renderBudget.reserveNodes('text', 1)
            if (!Object.isFrozen(context)
              || context.instanceKey !== node.id
              || context.layoutPlan.instanceKey !== context.instanceKey
              || context.layoutPlan.nodeId !== node.id
              || context.fragmentPlan.sourceInstanceKey !== context.instanceKey
              || context.fragmentPlan.sourceNodeId !== node.id
              || context.resolvedModel.value !== 'resolved'
              || context.pageIndex !== 0
              || context.unit !== 'mm'
              || context.renderBudget.nodesUsed !== 1
              || slot.kind !== 'fragment'
              || slot.children.length !== 0) {
              throw new Error('incomplete viewer render context')
            }
            return { tree: viewerText('ok') }
          },
        },
      }),
    })

    const report = await runMaterialConformance(manifest, options())

    expect(report.issues.map(issue => issue.code)).not.toContain('CONFORMANCE_VIEWER_FAILED')
  })

  it('reports mount and repeated disposer failures with stable codes', async () => {
    const manifest = createTestMaterialManifest({ type: 'mount-failure', viewer: () => viewerFacet() })
    const mountReport = await runMaterialConformance(manifest, options({
      mountViewerTree: () => { throw new Error('mount failed') },
    }))
    expect(mountReport.issues.map(issue => issue.code)).toContain('CONFORMANCE_VIEWER_MOUNT_FAILED')

    const disposeReport = await runMaterialConformance(manifest, options({
      mountViewerTree: () => ({ dispose: () => { throw new Error('dispose failed') } }),
    }))
    expect(disposeReport.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'CONFORMANCE_VIEWER_DISPOSE_FAILED',
      'CONFORMANCE_VIEWER_DISPOSE_NOT_IDEMPOTENT',
    ]))
  })

  it('fails closed before invoking any hook unless trusted execution is explicit', async () => {
    let calls = 0
    const manifest = createTestMaterialManifest({
      type: 'isolation-required',
      viewer: defineMaterialFacetFactory('async-isolated', async () => {
        calls++
        await new Promise(resolve => setTimeout(resolve, 1))
        while (true)
          continue
      }),
      schemaAdapter: {
        ...createTestMaterialManifest({ type: 'adapter-source' }).schemaAdapter,
        normalize: () => {
          calls++
          return {} as never
        },
      },
    })
    const inaccessible = new Proxy(manifest, {
      get: () => {
        calls++
        throw new Error('manifest must remain untouched without isolation')
      },
    })
    const started = Date.now()
    const report = await runMaterialConformance(inaccessible)
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(calls).toBe(0)
    expect(report.issues).toEqual([expect.objectContaining({
      code: 'CONFORMANCE_ISOLATED_EXECUTION_REQUIRED',
      path: '',
    })])
    await expect(assertMaterialConformance(inaccessible)).rejects.toThrow('CONFORMANCE_ISOLATED_EXECUTION_REQUIRED')
    expect(calls).toBe(0)
  })

  it('safely summarizes hostile thrown values in trusted execution', async () => {
    const valid = createTestMaterialManifest({ type: 'trusted-errors', viewer: () => viewerFacet() })
    const hostile = createTestMaterialManifest({
      type: 'hostile-throw',
      viewer: false,
      schemaAdapter: {
        ...valid.schemaAdapter,
        normalize: () => {
          throw new Proxy({}, {
            getOwnPropertyDescriptor: () => {
              throw new Error('trap')
            },
          })
        },
      },
    })
    const report = await runMaterialConformance(hostile, options())
    expect(report.issues.some(issue => issue.message === 'Unknown error')).toBe(true)
    expect(report.issues.map(issue => issue.code)).toContain('CONFORMANCE_VIEWER_REQUIRED')
  })

  it('rejects promise-returning factories declared as synchronous without awaiting them', async () => {
    const manifest = createTestMaterialManifest({
      type: 'undeclared-async',
      viewer: defineMaterialFacetFactory('sync', () => Promise.resolve(viewerFacet())),
    })
    const report = await runMaterialConformance(manifest, options())
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'CONFORMANCE_UNDECLARED_ASYNC_HOOK',
      path: '/facets/viewer',
    }))
  })

  it('activates declared async factories inside an explicitly trusted isolate', async () => {
    let calls = 0
    const manifest = createTestMaterialManifest({
      type: 'isolated-async',
      viewer: defineMaterialFacetFactory('async-isolated', async () => {
        calls++
        await Promise.resolve()
        return viewerFacet()
      }),
    })
    const report = await runMaterialConformance(manifest, options())
    expect(report.valid).toBe(true)
    expect(calls).toBe(1)
  })

  it('requires migration fixtures and reports protected writes without hiding other failures', async () => {
    const withoutFixture = createTestMaterialManifest({
      type: 'fixture-required',
      schemaAdapter: {
        ...createTestMaterialManifest({ type: 'fixture-adapter' }).schemaAdapter,
        migrations: [{ from: 0, to: 1, migrate: node => ({ ...node, modelVersion: 1 }) }],
      },
      viewer: () => viewerFacet(),
    })
    expect((await runMaterialConformance(withoutFixture, options())).issues.map(issue => issue.code))
      .toContain('CONFORMANCE_MIGRATION_FIXTURE_REQUIRED')

    const protectedWrite = createTestMaterialManifest({
      type: 'protected-write',
      schemaAdapter: {
        ...withoutFixture.schemaAdapter,
        migrations: [{
          from: 0,
          to: 1,
          conformance: {
            fixtures: [{ id: 'protected-v0', input: { model: {} } }],
            declaredWritePaths: ['/modelVersion'],
          },
          migrate: node => ({ ...node, rotation: 90, modelVersion: 2 }),
        }],
      },
      viewer: () => viewerFacet(),
    })
    const report = await runMaterialConformance(protectedWrite, options())
    expect(report.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'CONFORMANCE_MIGRATION_UNDECLARED_WRITE',
      'CONFORMANCE_MIGRATION_VERSION_INVALID',
    ]))
  })

  it('preserves original migration fixture indices after material filtering', async () => {
    const manifest = createTestMaterialManifest({
      type: 'fixture-index',
      schemaAdapter: {
        ...createTestMaterialManifest({ type: 'fixture-index-adapter' }).schemaAdapter,
        migrations: [{
          from: 0,
          to: 1,
          conformance: {
            fixtures: [
              { id: 'other-v0', materialType: 'other-material', input: { model: {} } },
              { id: 'bad-v0', materialType: 'fixture-index', input: { model: {} } },
            ],
            declaredWritePaths: ['/modelVersion'],
          },
          migrate: node => ({ ...node, modelVersion: 2 }),
        }],
      },
      viewer: () => viewerFacet(),
    })
    const report = await runMaterialConformance(manifest, options())
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'CONFORMANCE_MIGRATION_VERSION_INVALID',
      path: '/schemaAdapter/migrations/0/conformance/fixtures/1',
    }))
    expect(report.issues.some(issue => issue.path === '/schemaAdapter/migrations/0/conformance/fixtures/0')).toBe(false)
  })

  it('caps issue output with one deterministic truncation marker', async () => {
    const model = Object.fromEntries(Array.from({ length: 600 }, (_, index) => [`value${index}`, 0]))
    const properties = Array.from({ length: 600 }, (_, index) => ({
      key: `value${index}`,
      label: `value${index}`,
      type: 'number' as const,
      accessor: {
        paths: [`/model/value${index}` as const],
        read: (node: any) => node.model[`value${index}`],
        write: () => {},
      },
    }))
    const manifest = createTestMaterialManifest({ type: 'issue-cap', defaultModel: model, properties, viewer: () => viewerFacet() })
    const first = await runMaterialConformance(manifest, options())
    const second = await runMaterialConformance(manifest, options())
    expect(first.issues).toHaveLength(512)
    expect(first.issues.filter(issue => issue.code === 'CONFORMANCE_ISSUES_TRUNCATED')).toHaveLength(1)
    expect(second.issues).toEqual(first.issues)
  })

  it('bounds changed-pointer traversal just above the operation limit', async () => {
    const large = Array.from({ length: 12_000 }).fill(0)
    const manifest = createTestMaterialManifest({
      type: 'changed-pointer-budget',
      defaultModel: { large },
      properties: [{
        key: 'large',
        label: 'large',
        type: 'array',
        accessor: {
          paths: ['/model/large'],
          read: node => node.model.large,
          write: (node) => {
            const values = node.model.large as number[]
            for (let index = 0; index < values.length; index++)
              values[index] = 1
          },
        },
      }],
      viewer: () => viewerFacet(),
    })
    const started = Date.now()
    const report = await runMaterialConformance(manifest, options())
    expect(Date.now() - started).toBeLessThan(8_000)
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'CONFORMANCE_PROPERTY_ACCESSOR_FAILED',
      message: 'CONFORMANCE_WORK_BUDGET_EXCEEDED',
    }))
  }, 10_000)

  it('sorts issues with an ordinal comparator without locale APIs', () => {
    const localeCompare = vi.spyOn(String.prototype, 'localeCompare').mockImplementation(() => {
      throw new Error('locale sort must not run')
    })
    try {
      const issues = ['中', 'é', 'a', 'A'].map(code => ({ code, path: '' as const, message: '' }))
      expect(issues.toSorted(compareMaterialConformanceIssues).map(issue => issue.code)).toEqual(['A', 'a', 'é', '中'])
    }
    finally {
      localeCompare.mockRestore()
    }
  })

  it('does not allow a declared property leaf to authorize ancestor replacement', async () => {
    const manifest = createTestMaterialManifest({
      type: 'property-containment',
      defaultModel: { value: { nested: 1 }, rows: [{ value: 1 }] },
      properties: [
        {
          key: 'delete-model',
          label: 'delete',
          type: 'number',
          accessor: { paths: ['/model/value'], read: () => 1, write: (node) => { delete (node as any).model } },
        },
        {
          key: 'replace-array',
          label: 'replace',
          type: 'number',
          accessor: { paths: ['/model/rows/0/value'], read: () => 1, write: (node) => { (node.model as any).rows = [] } },
        },
        {
          key: 'legit',
          label: 'legit',
          type: 'number',
          accessor: { paths: ['/model/value/nested'], read: node => (node.model.value as any).nested, write: (node, value) => { (node.model.value as any).nested = value } },
        },
      ],
      viewer: () => viewerFacet(),
    })
    const issues = (await runMaterialConformance(manifest, options())).issues.filter(issue => issue.code === 'CONFORMANCE_PROPERTY_UNDECLARED_WRITE')
    expect(issues).toHaveLength(2)
    expect(issues.map(issue => issue.message)).toEqual(expect.arrayContaining([
      'write changed undeclared path /model',
      'write changed undeclared path /model/rows/0',
    ]))
  })

  it('requires alternate-value roundtrips and detects reads that mutate the node', async () => {
    const manifest = createTestMaterialManifest({
      type: 'property-roundtrip',
      defaultModel: { empty: 1, wrong: 1, mutating: 1 },
      properties: [
        {
          key: 'empty',
          label: 'empty',
          type: 'number',
          accessor: { paths: ['/model/empty'], read: node => node.model.empty, write: () => {} },
        },
        {
          key: 'wrong',
          label: 'wrong',
          type: 'number',
          accessor: { paths: ['/model/wrong'], read: node => node.model.wrong, write: (node) => { node.model.wrong = 1 } },
        },
        {
          key: 'mutating',
          label: 'mutating',
          type: 'number',
          accessor: {
            paths: ['/model/mutating'],
            read: (node) => {
              node.model.sideEffect = true
              return node.model.mutating
            },
            write: (node, value) => { node.model.mutating = value },
          },
        },
      ],
      viewer: () => viewerFacet(),
    })
    const report = await runMaterialConformance(manifest, options())
    expect(report.issues.filter(issue => issue.code === 'CONFORMANCE_PROPERTY_ROUNDTRIP_FAILED')).toHaveLength(2)
    expect(report.issues.map(issue => issue.code)).toContain('CONFORMANCE_PROPERTY_READ_MUTATED')
  })

  it('decodes identity and reference encodings for value and key locations', async () => {
    const encoded = createTestMaterialManifest({
      type: 'encoded',
      defaultModel: { id: 'pre-X-suf', ref: 'pre-X-suf', keys: { 'pre-X-suf': true } },
      schemaAdapter: {
        ...createTestMaterialManifest({ type: 'encoded-adapter' }).schemaAdapter,
        introspect: _node => ({
          identities: [
            { path: '/model/id', location: 'value', encoding: { prefix: 'pre-', suffix: '-suf' }, value: 'X', target: { scope: 'material', kind: 'encoded' } },
            { path: '/model/keys/pre-X-suf', location: 'key', encoding: { prefix: 'pre-', suffix: '-suf' }, value: 'X', target: { scope: 'material', kind: 'encoded-key' } },
          ],
          references: [{ path: '/model/ref', location: 'value', encoding: { prefix: 'pre-', suffix: '-suf' }, value: 'X', target: { scope: 'material', kind: 'encoded' }, required: true }],
          structures: [],
          resources: [],
          bindings: [],
        }),
      },
      viewer: () => viewerFacet(),
    })
    expect((await runMaterialConformance(encoded, options())).issues.map(issue => issue.code))
      .not
      .toContain('CONFORMANCE_INTROSPECTION_POINTER_INVALID')

    const bad = createTestMaterialManifest({
      type: 'bad-encoding',
      defaultModel: { id: 'wrong-X-suf', ref: 'pre-X-wrong' },
      schemaAdapter: {
        ...encoded.schemaAdapter,
        introspect: () => ({
          identities: [{ path: '/model/id', location: 'value', encoding: { prefix: 'pre-', suffix: '-suf' }, value: 'X', target: { scope: 'material', kind: 'encoded' } }],
          references: [{ path: '/model/ref', location: 'value', encoding: { prefix: 'pre-', suffix: '-suf' }, value: 'X', target: { scope: 'material', kind: 'encoded' }, required: true }],
          structures: [],
          resources: [],
          bindings: [],
        }),
      },
      viewer: () => viewerFacet(),
    })
    expect((await runMaterialConformance(bad, options())).issues
      .filter(issue => issue.code === 'CONFORMANCE_INTROSPECTION_POINTER_INVALID')).toHaveLength(2)
  })
})
