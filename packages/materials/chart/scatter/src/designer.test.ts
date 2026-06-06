import { describe, expect, it } from 'vitest'
import { createChartScatterExtension } from './designer'

describe('chart-scatter designer extension', () => {
  it('does not own datasource drop zones on the canvas', () => {
    const extension = createChartScatterExtension({} as never)

    expect(extension.datasourceDrop).toBeUndefined()
  })
})
