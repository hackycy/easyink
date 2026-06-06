import { describe, expect, it } from 'vitest'
import { createChartLineExtension } from './designer'

describe('chart-line designer extension', () => {
  it('does not own datasource drop zones on the canvas', () => {
    const extension = createChartLineExtension({} as never)

    expect(extension.datasourceDrop).toBeUndefined()
  })
})
