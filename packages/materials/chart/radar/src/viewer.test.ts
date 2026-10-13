import { readTrustedViewerHtml } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { createChartRadarRuntimeOption } from './options'
import { createChartRadarNode } from './schema'
import { renderChartRadar } from './viewer'

describe('chart radar runtime rendering', () => {
  it('renders an empty radar without inventing preview data when no binding is selected', () => {
    const output = renderChartRadar(createChartRadarNode())
    const html = readTrustedViewerHtml(output.html)
    expect(html).toContain('<svg')
    expect(html).not.toContain('NaN')
    expect(createChartRadarRuntimeOption({}).radar).toMatchObject({ indicator: [] })
  })
})
