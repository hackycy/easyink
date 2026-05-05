import type { TableNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { inferAIGenerationPlan } from './domain-profile'
import { buildSchemaFromTemplateIntent } from './template-intent'

describe('template intent builder', () => {
  it('builds a valid receipt table-data schema from sparse intent', () => {
    const plan = inferAIGenerationPlan('生成一个商超小票模版，附带商品结账清单和合计')
    const result = buildSchemaFromTemplateIntent({
      name: '商超小票',
      fields: [],
      sections: [],
    }, { prompt: '生成一个商超小票模版，附带商品结账清单和合计', plan })

    const table = result.schema.elements.find(element => element.type === 'table-data') as TableNode | undefined

    expect(result.schema.page).toMatchObject({ mode: 'stack', width: 80, height: 200 })
    expect(table).toBeTruthy()
    expect(table?.table.kind).toBe('data')
    expect(table?.table.topology.rows.some(row => row.role === 'repeat-template')).toBe(true)
    expect(table?.table.topology.rows[1]?.cells[0]?.binding?.fieldPath).toBe('items/name')
    expect(result.expectedDataSource.fields.some(field => field.path === 'items')).toBe(true)
    expect(result.expectedDataSource.sampleData?.items).toEqual(expect.any(Array))
  })

  it('turns any array field into a repeat-template table-data element', () => {
    const plan = inferAIGenerationPlan('生成一个报价单模板，包含服务明细')
    const result = buildSchemaFromTemplateIntent({
      name: '报价单',
      dataSourceName: 'quote',
      fields: [
        { name: 'customerName', type: 'string', path: 'customerName', title: '客户名称' },
        {
          name: 'services',
          type: 'array',
          path: 'services',
          title: '服务明细',
          children: [
            { name: 'name', type: 'string', path: 'services/name', title: '服务' },
            { name: 'amount', type: 'number', path: 'services/amount', title: '金额' },
          ],
        },
      ],
      sections: [{ kind: 'array-table', sourcePath: 'services' }],
    }, { prompt: '生成一个报价单模板，包含服务明细', plan })

    const table = result.schema.elements.find(element => element.type === 'table-data') as TableNode | undefined

    expect(table?.table.topology.rows.map(row => row.role)).toEqual(['header', 'repeat-template'])
    expect(table?.table.topology.rows[1]?.cells.map(cell => cell.binding?.fieldPath)).toEqual([
      'services/name',
      'services/amount',
    ])
  })

  it('keeps elements below table-data out of the designer preview area', () => {
    const plan = inferAIGenerationPlan('生成一个商超小票模版，附带商品结账清单和合计')
    const result = buildSchemaFromTemplateIntent({
      name: '商超小票',
      fields: [],
      sections: [],
    }, { prompt: '生成一个商超小票模版，附带商品结账清单和合计', plan })

    const tableIndex = result.schema.elements.findIndex(element => element.type === 'table-data')
    const table = result.schema.elements[tableIndex] as TableNode | undefined
    const nextElement = result.schema.elements[tableIndex + 1]
    const repeatRowHeight = table?.table.topology.rows.find(row => row.role === 'repeat-template')?.height ?? 0
    const expectedDesignerBottom = (table?.y ?? 0) + (table?.height ?? 0) + repeatRowHeight * 2

    expect(tableIndex).toBeGreaterThanOrEqual(0)
    expect(nextElement).toBeTruthy()
    expect(nextElement?.y).toBeGreaterThanOrEqual(expectedDesignerBottom)
  })

  it('keeps element ids isolated to a single build invocation', () => {
    const prompt = '生成一个公告模板，包含两段说明文字'
    const plan = inferAIGenerationPlan(prompt)
    let nestedBuildTriggered = false
    const reentrantSection = { kind: 'text' } as const

    Object.defineProperty(reentrantSection, 'text', {
      enumerable: true,
      configurable: true,
      get() {
        if (!nestedBuildTriggered) {
          nestedBuildTriggered = true
          buildSchemaFromTemplateIntent({
            name: '嵌套调用',
            fields: [],
            sections: [{ kind: 'title' }],
          }, { prompt, plan })
        }
        return '第二段说明'
      },
    })

    const result = buildSchemaFromTemplateIntent({
      name: '公告',
      fields: [],
      sections: [
        { kind: 'text', text: '第一段说明' },
        reentrantSection,
      ],
    }, { prompt, plan })

    const elementIds = result.schema.elements.map(element => element.id)

    expect(new Set(elementIds).size).toBe(elementIds.length)
  })
})
