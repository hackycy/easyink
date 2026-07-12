import { describe, expect, it, vi } from 'vitest'
import { createChartCustomExtension } from './designer'
import { createChartCustomNode } from './schema'

describe('chart custom designer extension', () => {
  it('binds dropped datasource fields as whole option values', () => {
    const txRun = vi.fn()
    const extension = createChartCustomExtension({
      t: (key: string) => key,
      tx: { run: txRun },
    } as never)
    const node = createChartCustomNode({ id: 'chart-1' })

    extension.datasourceDrop?.onDrop({
      sourceId: 'report',
      path: 'echartsOption',
      title: 'Option',
    } as never, { x: 1, y: 1 }, node)

    expect(txRun).toHaveBeenCalledWith('chart-1', expect.any(Function), { label: 'designer.history.bindField' })
    const draft = createChartCustomNode({ id: 'chart-1' })
    txRun.mock.calls[0][1](draft)
    expect(draft.bindings.value).toEqual({
      sourceId: 'report',
      sourceName: undefined,
      sourceTag: undefined,
      fieldPath: 'echartsOption',
      fieldKey: undefined,
      fieldLabel: 'Option',
      format: undefined,
    })
    expect(draft.model).not.toHaveProperty('optionMode')
  })
})
