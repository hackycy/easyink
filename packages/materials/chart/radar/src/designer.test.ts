import { describe, expect, it } from 'vitest'
import { createChartRadarExtension } from './designer'

describe('chart-radar designer extension', () => {
  it('does not own datasource drop zones on the canvas', () => {
    const extension = createChartRadarExtension({} as never)

    expect(extension.datasourceDrop).toBeUndefined()
  })
})
