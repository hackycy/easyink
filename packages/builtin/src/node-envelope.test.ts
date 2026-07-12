import type { MaterialNode } from '@easyink/schema'
import { createBarcodeNode } from '@easyink/material-barcode'
import { createChartBarNode } from '@easyink/material-chart-bar'
import { createChartCustomNode } from '@easyink/material-chart-custom'
import { createChartGaugeNode } from '@easyink/material-chart-gauge'
import { createChartLineNode } from '@easyink/material-chart-line'
import { createChartPieNode } from '@easyink/material-chart-pie'
import { createChartRadarNode } from '@easyink/material-chart-radar'
import { createChartScatterNode } from '@easyink/material-chart-scatter'
import { createEllipseNode } from '@easyink/material-ellipse'
import { createFlowRowNode, migrateFlowRowModelV0ToV1 } from '@easyink/material-flow-row'
import { createImageNode } from '@easyink/material-image'
import { createLineNode } from '@easyink/material-line'
import { createPageNumberNode } from '@easyink/material-page-number'
import { createProgressNode } from '@easyink/material-progress'
import { createQrcodeNode } from '@easyink/material-qrcode'
import { createRatingNode } from '@easyink/material-rating'
import { createRectNode } from '@easyink/material-rect'
import { createRingProgressNode } from '@easyink/material-ring-progress'
import { createSignatureNode } from '@easyink/material-signature'
import { createSvgCustomNode } from '@easyink/material-svg-custom'
import { createSvgHeartNode } from '@easyink/material-svg-heart'
import { createSvgStarNode } from '@easyink/material-svg-star'
import { createTextNode, migrateTextModelV0ToV1 } from '@easyink/material-text'
import { describe, expect, it, vi } from 'vitest'

const factories = [
  createBarcodeNode,
  createChartBarNode,
  createChartCustomNode,
  createChartGaugeNode,
  createChartLineNode,
  createChartPieNode,
  createChartRadarNode,
  createChartScatterNode,
  createEllipseNode,
  createFlowRowNode,
  createImageNode,
  createLineNode,
  createPageNumberNode,
  createProgressNode,
  createQrcodeNode,
  createRatingNode,
  createRectNode,
  createRingProgressNode,
  createSignatureNode,
  createSvgCustomNode,
  createSvgHeartNode,
  createSvgStarNode,
  createTextNode,
]

function assertCanonical(node: MaterialNode): void {
  expect(node.modelVersion).toBe(1)
  expect(node.model).toBeTypeOf('object')
  expect(node.slots).toEqual(expect.any(Object))
  expect(node.bindings).toEqual(expect.any(Object))
  expect(node.output).toMatchObject({ visibility: 'include' })
  for (const key of ['props', 'binding', 'children', 'table'])
    expect(node).not.toHaveProperty(key)
  for (const children of Object.values(node.slots))
    children.forEach(assertCanonical)
}

describe('builtin node envelopes', () => {
  it.each(factories)('creates a canonical envelope', (factory) => {
    assertCanonical(factory())
  })

  it.each(factories)('rejects envelope identity and legacy-field injection', (factory) => {
    const node = factory({
      type: 'injected',
      modelVersion: 999,
      unit: 'px',
      unknownRoot: true,
      props: { injected: true },
      binding: { fieldPath: 'legacy' },
      children: [],
      table: {},
      hidden: true,
    } as never)
    assertCanonical(node)
    expect(node.type).not.toBe('injected')
    expect(node).not.toHaveProperty('unit')
    expect(node).not.toHaveProperty('unknownRoot')
    expect(node).not.toHaveProperty('hidden')
  })

  it.each(factories)('does not drop model defaults for a partial model', (factory) => {
    const defaults = factory().model as Record<string, unknown>
    const node = factory({ model: { __probe: true } } as never)
    expect(node.model).toMatchObject(defaults)
  })

  it('keeps table construction profile-owned', async () => {
    const [{ createTableStaticNode }, { createTableDataNode }] = await Promise.all([
      import('@easyink/material-table-static'),
      import('@easyink/material-table-data'),
    ])
    const result = createTextNode()
    const profile = { createNode: vi.fn(() => result) }
    const input = { model: { kind: 'static' } }
    expect(createTableStaticNode(profile as never, input as never, 'mm')).toBe(result)
    expect(createTableDataNode(profile as never, input as never, 'mm')).toBe(result)
    expect(profile.createNode).toHaveBeenNthCalledWith(1, 'table-static', input, 'mm')
    expect(profile.createNode).toHaveBeenNthCalledWith(2, 'table-data', input, 'mm')
  })

  it('does not admit removed v1 text and flow-row model fields', () => {
    expect(createTextNode({ model: { autoWrap: false } } as never).model).not.toHaveProperty('autoWrap')
    expect(createFlowRowNode({ model: { padding: 4 } } as never).model).not.toHaveProperty('padding')
  })

  it('keeps page-number placement and repetition in canonical output', () => {
    const node = createPageNumberNode({
      output: {
        visibility: 'remove',
        placement: { mode: 'flow' },
        repeat: { scope: 'none' },
      },
    })
    expect(node.output).toEqual(expect.objectContaining({
      visibility: 'include',
      placement: { mode: 'fixed' },
      repeat: { scope: 'every-output-page' },
    }))
    expect(node).not.toHaveProperty('placement')
    expect(node).not.toHaveProperty('repeat')
  })

  it('migrates legacy text wrapping without retaining autoWrap', () => {
    const migrated = migrateTextModelV0ToV1.migrate({
      ...createTextNode(),
      modelVersion: 0,
      model: { content: 'legacy', autoWrap: false },
    }, {} as never)
    expect(migrated.model).toMatchObject({ content: 'legacy', wrapMode: 'nowrap' })
    expect(migrated.model).not.toHaveProperty('autoWrap')
  })

  it('migrates flow padding and private column bindings to canonical ports', () => {
    const migrated = migrateFlowRowModelV0ToV1.migrate({
      ...createFlowRowNode(),
      modelVersion: 0,
      model: {
        padding: 4,
        columns: [{
          ratio: 1,
          textAlign: 'left',
          wrapMode: 'inline',
          content: 'legacy',
          privateValue: true,
          binding: { sourceId: 'orders', fieldPath: 'orders.name' },
        }],
      },
    } as never, {} as never)
    expect(migrated.model).toMatchObject({ paddingX: 4, paddingY: 4 })
    expect(migrated.model).not.toHaveProperty('padding')
    expect((migrated.model as any).columns[0]).toEqual({
      id: 'default-1',
      ratio: 1,
      textAlign: 'left',
      wrapMode: 'inline',
      content: 'legacy',
      bindingPort: 'column:default-1:value',
    })
    expect(migrated.bindings['column:default-1:value']).toMatchObject({
      sourceId: 'orders',
      fieldPath: 'orders.name',
    })
  })
})
