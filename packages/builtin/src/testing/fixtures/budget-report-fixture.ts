import { createTestMaterialManifest } from '@easyink/core/testing'

const source = createTestMaterialManifest({ type: 'fixture-budget-source' })
const identities = Array.from({ length: 600 }, (_, index) => ({
  path: `/model/missing${index}` as `/${string}`,
  location: 'value' as const,
  value: `missing${index}`,
  target: { scope: 'material' as const, kind: 'budget' },
}))

export const budgetReportManifest = createTestMaterialManifest({
  type: 'fixture-budget-report',
  defaultModel: { padding: Array.from({ length: 85_000 }).fill(0) },
  schemaAdapter: {
    ...source.schemaAdapter,
    introspect: () => ({ identities, structures: [], references: [], resources: [], bindings: [] }),
  },
  viewer: false,
})
