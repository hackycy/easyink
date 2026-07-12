import { describe, expect, it } from 'vitest'
import { builtinCatalogGroupLabels, builtinMaterialIcons } from './material-host'

describe('designer builtin material host metadata', () => {
  it('owns every builtin icon and catalog label outside the manifest package', () => {
    expect(Object.keys(builtinMaterialIcons).sort()).toEqual([
      'barcode',
      'chart-bar',
      'chart-custom',
      'chart-gauge',
      'chart-line',
      'chart-pie',
      'chart-radar',
      'chart-scatter',
      'ellipse',
      'flow-row',
      'image',
      'line',
      'page-number',
      'progress',
      'qrcode',
      'rating',
      'rect',
      'ring-progress',
      'signature',
      'svg-custom',
      'svg-heart',
      'svg-star',
      'table',
      'table-data',
      'text',
    ])
    expect(builtinCatalogGroupLabels).toEqual({
      basic: 'materials.catalog.basic',
      data: 'materials.catalog.data',
      chart: 'materials.catalog.chart',
      svg: 'materials.catalog.svg',
      utility: 'materials.catalog.utility',
    })
  })
})
