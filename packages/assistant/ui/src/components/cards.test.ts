import type { AssistantResult } from '@easyink/assistant-capabilities'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, nextTick } from 'vue'
import ResultCard from './ResultCard.vue'
import SourceAttachmentCard from './SourceAttachmentCard.vue'

describe('assistant conversation cards', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('emits full result and datasource-only actions', async () => {
    const result = createResult()
    const applied: AssistantResult[] = []
    const dataSources: unknown[] = []
    mount(ResultCard, {
      result,
      onApply: (value: AssistantResult) => applied.push(value),
      onApplyDataSource: (value: unknown) => dataSources.push(value),
    })

    const buttons = [...document.querySelectorAll('button')]
    buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(applied).toEqual([result])
    expect(dataSources).toEqual([result.dataSource])
  })

  it('renders source fields and emits delete action', async () => {
    const removed: boolean[] = []
    mount(SourceAttachmentCard, {
      source: { kind: 'json', content: '{"orderNo":"A001"}' },
      title: '识别到 JSON 数据源',
      detail: '字段：orderNo',
      fields: ['orderNo', 'total'],
      warnings: ['样例只有一条记录'],
      onRemove: () => removed.push(true),
    })

    expect(document.body.textContent).toContain('orderNo')
    document.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await nextTick()

    expect(removed).toEqual([true])
  })
})

function mount(component: Parameters<typeof createApp>[0], props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(component, props)
  app.mount(host)
  return app
}

function createResult(): AssistantResult {
  return {
    id: 'result_1',
    schema: {
      version: '1',
      unit: 'mm',
      page: { mode: 'fixed', width: 80, height: 120 },
      guides: { x: [], y: [], groups: [] },
      elements: [],
    },
    dataSource: {
      id: 'orders',
      name: 'orders',
      fields: [],
    },
    patch: [],
    diff: { changed: false, operations: [], summary: [] },
    validation: { valid: true, errors: [], warnings: [], autoFixed: [] },
    preview: {
      title: '订单',
      page: { mode: 'fixed', width: 80, height: 120, unit: 'mm' },
      elementCount: 0,
      dataFieldCount: 0,
      warnings: [],
    },
    createdAt: 1,
  }
}
