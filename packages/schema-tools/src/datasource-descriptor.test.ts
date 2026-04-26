import { describe, expect, it } from 'vitest'
import { buildDataSourceDescriptor } from './datasource-descriptor'

describe('buildDataSourceDescriptor', () => {
  it('builds stable AI data source descriptors from expected fields', () => {
    const descriptor = buildDataSourceDescriptor({
      name: 'receipt',
      fields: [
        {
          name: 'store',
          title: '门店',
          type: 'object',
          path: 'store',
          children: [
            { name: 'name', title: '店铺名称', type: 'string', path: 'store/name' },
          ],
        },
        {
          name: 'items',
          title: '商品明细',
          type: 'array',
          path: 'items',
          children: [
            { name: 'code', title: '商品条码', type: 'string', path: 'items/code' },
            { name: 'subtotal', title: '小计', type: 'number', path: 'items/subtotal' },
          ],
        },
      ],
    }, { prompt: '生成商超小票' })

    expect(descriptor.id).toBe('receipt')
    expect(descriptor.name).toBe('receipt')
    expect(descriptor.meta).toMatchObject({
      namespace: '__ai__',
      generatedBy: 'easyink-mcp-server',
      sourceName: 'receipt',
      prompt: '生成商超小票',
    })
    expect(descriptor.fields[0]).toMatchObject({
      name: 'store',
      title: '门店',
      expand: true,
    })
    expect(descriptor.fields[1]?.fields?.[0]).toMatchObject({
      name: 'code',
      title: '商品条码',
      use: 'barcode',
    })
  })
})
