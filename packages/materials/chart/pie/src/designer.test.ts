import { describe, expect, it } from 'vitest'
import { createChartPieExtension } from './designer'

describe('chart-pie designer extension', () => {
  it('does not own datasource drop zones on the canvas', () => {
    const extension = createChartPieExtension({} as never)

    expect(extension.datasourceDrop).toBeUndefined()
  })
})
