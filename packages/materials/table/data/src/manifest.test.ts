import { compileMaterialProfile } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { tableDataMaterialManifest } from './manifest'
import { createDefaultDataTableModel } from './schema'

describe('table data manifest binding admission', () => {
  it('admits collection, detail-key, and cell ports named by the model', () => {
    const model = createDefaultDataTableModel()
    model.data.collectionPort = 'orders'
    model.data.detailKeyPort = 'orderId'
    const detail = model.bands.find(band => band.role === 'detail')!.rows[0]!
    detail.cells[0]!.content = { kind: 'text', text: '', bindingPort: 'detail:name' }
    const profile = compileMaterialProfile({
      id: 'table-data-test',
      engineVersion: '0.0.30',
      packages: [{ packageId: '@easyink/table-data-test', kind: 'builtin', required: true, manifests: [tableDataMaterialManifest] }],
    })

    const node = profile.createNode('table-data', {
      model,
      bindings: {
        'orders': { sourceId: 'invoice', fieldPath: 'orders' },
        'orderId': { sourceId: 'invoice', fieldPath: 'orders/id' },
        'detail:name': { sourceId: 'invoice', fieldPath: 'orders/name' },
      },
    })

    expect(node.bindings).toEqual({
      'orders': { sourceId: 'invoice', fieldPath: 'orders' },
      'orderId': { sourceId: 'invoice', fieldPath: 'orders/id' },
      'detail:name': { sourceId: 'invoice', fieldPath: 'orders/name' },
    })
  })
})
