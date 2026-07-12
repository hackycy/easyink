import { describe, expect, it } from 'vitest'
import { SchemaBuilder } from '../../../../assistant/schema-builder/src'
import { decodeTableModelV1 } from './model-codec'
import { tableSchemaAdapter } from './schema-adapter'

describe('assistant schema builder integration', () => {
  it('produces codec-valid data tables with canonical alignments and inferred collection ports', () => {
    const result = createBuilder().emitTableData({
      id: 'items',
      region: { x: 0, y: 0, width: 100, height: 40 },
      columns: [
        { label: 'Name', field: 'items/name', ratio: 2, align: 'left' },
        { label: 'Price', field: 'items/price', ratio: 1, align: 'right' },
      ],
    })
    const decoded = decodeTableModelV1(result.element.model)

    expect(decoded.issues).toEqual([])
    expect(tableSchemaAdapter.validate(result.element, adapterContext('table-data'))).toEqual([])
    expect(result.element.bindings.records).toMatchObject({ fieldPath: 'items' })
    expect(decoded.value?.bands[0]?.rows[0]?.cells.map(cell => cell.style?.typography?.textAlign)).toEqual(['start', 'end'])
  })

  it('produces adapter-valid static tables with canonical end alignment', () => {
    const result = createBuilder().emitTableStatic({
      id: 'summary',
      region: { x: 0, y: 0, width: 100, height: 20 },
      rows: [{ cells: [
        { text: 'Total', colSpan: 2 },
        { valueBinding: { fieldPath: 'total' }, align: 'right' },
      ] }],
    })
    const decoded = decodeTableModelV1(result.element.model)

    expect(decoded.issues).toEqual([])
    expect(tableSchemaAdapter.validate(result.element, adapterContext('table-static'))).toEqual([])
    expect(decoded.value?.bands[0]?.rows[0]?.cells[2]?.style?.typography?.textAlign).toBe('end')
  })
})

function createBuilder(): SchemaBuilder {
  return new SchemaBuilder({
    pageMode: 'fixed',
    pageWidth: 210,
    pageHeight: 297,
    unit: 'mm',
    dataSourceName: 'report',
  })
}

function adapterContext(materialType: 'table-data' | 'table-static') {
  return {
    documentVersion: '1.0.0',
    sourceUnit: 'mm' as const,
    documentUnit: 'mm' as const,
    materialType,
  }
}
