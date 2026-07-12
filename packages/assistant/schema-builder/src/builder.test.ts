import { MaterialKnowledgeRegistry } from '@easyink/assistant-material-knowledge'
import { describe, expect, it } from 'vitest'
import { SchemaBuilder } from './builder'

describe('schema builder', () => {
  it('emits generic elements with data-contract binding mappings', () => {
    const builder = new SchemaBuilder({
      pageMode: 'fixed',
      pageWidth: 210,
      pageHeight: 297,
      unit: 'mm',
      dataSourceName: 'report',
    }, new MaterialKnowledgeRegistry())

    const result = builder.emitElement({
      id: 'chart-sales',
      type: 'chart-bar',
      region: { x: 10, y: 20, width: 120, height: 60 },
      model: { barColor: '#2563eb' },
      bindings: {
        value: {
          kind: 'data-contract',
          mappings: {
            category: { select: { path: 'monthlySales/month', label: '月份' } },
            value: { select: { path: 'monthlySales/revenue', label: '销售额' } },
          },
          relation: { kind: 'auto' },
        },
      },
    })

    expect(result.element.bindings.value).toEqual({
      kind: 'data-contract',
      mappings: {
        category: {
          sourceId: 'report',
          sourceName: 'report',
          select: { path: 'monthlySales/month', label: '月份' },
        },
        value: {
          sourceId: 'report',
          sourceName: 'report',
          select: { path: 'monthlySales/revenue', label: '销售额' },
        },
      },
      relation: { kind: 'auto' },
    })
  })

  it('emits text bindings only through the canonical binding map', () => {
    const builder = createBuilder()
    const result = builder.emitText({
      id: 'title',
      region: { x: 0, y: 0, width: 40, height: 8 },
      content: 'Title',
      valueBinding: { fieldPath: 'customer/name' },
    })

    expect(result.element.model).toMatchObject({ content: 'Title' })
    expect(result.element.bindings.value).toMatchObject({ fieldPath: 'customer/name' })
    expect(Object.hasOwn(result.element, 'binding')).toBe(false)
  })

  it('emits a direct data TableModel with collection and cell binding ports', () => {
    const builder = createBuilder()
    const result = builder.emitTableData({
      id: 'items',
      region: { x: 0, y: 0, width: 100, height: 40 },
      collectionField: 'items',
      columns: [
        { label: 'Name', field: 'items/name', ratio: 2, align: 'left' },
        { label: 'Price', field: 'items/price', ratio: 1, align: 'right' },
      ],
    })

    expect(result.element.model).toMatchObject({
      kind: 'data',
      data: { collectionPort: 'records' },
      columns: [{ track: { kind: 'fr' } }, { track: { kind: 'fr' } }],
      bands: [{ role: 'header' }, { role: 'detail' }],
    })
    expect(result.element.bindings.records).toMatchObject({ fieldPath: 'items' })
    expect(Object.hasOwn(result.element.model, 'table')).toBe(false)
    const header = (result.element.model.bands as Array<{ rows: Array<{ cells: Array<{ style?: { typography?: { textAlign?: string } } }> }> }>)[0]
    expect(header?.rows[0]?.cells.map(cell => cell.style?.typography?.textAlign)).toEqual(['start', 'end'])
  })

  it('infers the collection parent from one column path', () => {
    const result = createBuilder().emitTableData({
      id: 'single-column',
      region: { x: 0, y: 0, width: 100, height: 40 },
      columns: [{ label: 'Name', field: 'items/name', ratio: 1 }],
    })

    expect(result.element.bindings.records).toMatchObject({ fieldPath: 'items' })
  })

  it('emits static table merges and bindings through direct model resources', () => {
    const builder = createBuilder()
    const result = builder.emitTableStatic({
      id: 'summary',
      region: { x: 0, y: 0, width: 100, height: 20 },
      rows: [{ cells: [
        { text: 'Total', colSpan: 2 },
        { valueBinding: { fieldPath: 'total' }, align: 'right' },
      ] }],
    })

    expect(result.element.model).toMatchObject({ kind: 'static', bands: [{ role: 'body' }] })
    expect((result.element.model.merges as unknown[])).toHaveLength(1)
    expect(Object.keys(result.element.bindings)).toHaveLength(1)
    expect(Object.hasOwn(result.element, 'props')).toBe(false)
    const body = (result.element.model.bands as Array<{ rows: Array<{ cells: Array<{ style?: { typography?: { textAlign?: string } } }> }> }>)[0]
    expect(body?.rows[0]?.cells[2]?.style?.typography?.textAlign).toBe('end')
  })
})

function createBuilder(): SchemaBuilder {
  return new SchemaBuilder({
    pageMode: 'fixed',
    pageWidth: 210,
    pageHeight: 297,
    unit: 'mm',
    dataSourceName: 'report',
  }, new MaterialKnowledgeRegistry())
}
