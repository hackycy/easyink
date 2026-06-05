import { describe, expect, it } from 'vitest'
import { createChartBarExtension } from './designer'

describe('chart-bar designer extension', () => {
  it('does not own datasource drop zones on the canvas', () => {
    const extension = createChartBarExtension({} as never)

    expect(extension.datasourceDrop).toBeUndefined()
  })
})
