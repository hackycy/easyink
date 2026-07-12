import type { MaterialNodeCreationError } from '@easyink/core'
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

  it.each([
    ['collection-detail', (model: ReturnType<typeof createDefaultDataTableModel>) => { model.data.detailKeyPort = model.data.collectionPort }, '/model/data/detailKeyPort'],
    ['collection-cell', (model: ReturnType<typeof createDefaultDataTableModel>) => { model.bands[1]!.rows[0]!.cells[0]!.content = { kind: 'text', text: '', bindingPort: model.data.collectionPort } }, '/model/bands/1/rows/0/cells/0/content/bindingPort'],
    ['detail-cell', (model: ReturnType<typeof createDefaultDataTableModel>) => {
      model.data.detailKeyPort = 'detailKey'
      model.bands[1]!.rows[0]!.cells[0]!.content = { kind: 'text', text: '', bindingPort: 'detailKey' }
    }, '/model/bands/1/rows/0/cells/0/content/bindingPort'],
  ])('rejects %s collisions through the table model adapter', (_name, mutate, path) => {
    const model = createDefaultDataTableModel()
    mutate(model)
    const profile = compileMaterialProfile({
      id: 'table-data-collision',
      engineVersion: '0.0.30',
      packages: [{ packageId: '@easyink/table-data-collision', kind: 'builtin', required: true, manifests: [tableDataMaterialManifest] }],
    })

    let error: MaterialNodeCreationError | undefined
    try {
      profile.createNode('table-data', {
        model,
        bindings: { [model.data.collectionPort]: { sourceId: 'invoice', fieldPath: 'orders' } },
      })
    }
    catch (cause) {
      error = cause as MaterialNodeCreationError
    }

    expect(error?.code).toBe('MATERIAL_ADAPTER_ISSUE')
    expect(error?.issues).toContainEqual(expect.objectContaining({
      code: 'TABLE_MODEL_STRUCTURE_INVALID',
      path,
    }))
  })
})
