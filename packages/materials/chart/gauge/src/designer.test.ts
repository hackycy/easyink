import { describe, expect, it } from 'vitest'
import { createChartGaugeExtension } from './designer'

describe('chart-gauge designer extension', () => {
  it('does not own datasource drop zones on the canvas', () => {
    const extension = createChartGaugeExtension({} as never)

    expect(extension.datasourceDrop).toBeUndefined()
  })
})
