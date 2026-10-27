import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import process from 'node:process'
import { describe, expect, it } from 'vitest'
import { materials as allDesignerMaterials } from './all/designer'
import { materials as allViewerMaterials } from './all/viewer'
import { materials as basicDesignerMaterials } from './basic/designer'
import { materials as basicViewerMaterials } from './basic/viewer'
import { generateCollectionEntry } from './collection-source'

const basicTypes = ['text', 'image', 'barcode', 'qrcode', 'line', 'rect', 'ellipse', 'table-static', 'table-data', 'flow-row', 'ring-progress', 'progress', 'rating', 'svg', 'svg-star', 'svg-heart', 'page-number']

describe('builtin static material collections', () => {
  it('preserves the frozen membership and host order', () => {
    expect(basicDesignerMaterials.map(material => material.model.type)).toEqual(basicTypes)
    expect(basicViewerMaterials.map(material => material.model.type)).toEqual(basicTypes)
    expect(allDesignerMaterials.map(material => material.model.type)).toEqual([
      ...basicTypes.slice(0, 6),
      'signature',
      ...basicTypes.slice(6, 13),
      'chart-bar',
      'chart-line',
      'chart-pie',
      'chart-radar',
      'chart-scatter',
      'chart-gauge',
      'chart-custom',
      ...basicTypes.slice(13),
    ])
    expect(allViewerMaterials.map(material => material.model.type)).toEqual([
      ...basicTypes.slice(0, 6),
      'signature',
      ...basicTypes.slice(6, 13),
      'chart-bar',
      'chart-custom',
      'chart-gauge',
      'chart-line',
      'chart-pie',
      'chart-radar',
      'chart-scatter',
      ...basicTypes.slice(13),
    ])
  })

  it('keeps all checked-in static entries reproducible from the build-time source', () => {
    for (const set of ['all', 'basic'] as const) {
      for (const host of ['designer', 'viewer'] as const) {
        const path = resolve(process.cwd(), `packages/builtin/src/${set}/${host}.ts`)
        expect(readFileSync(path, 'utf8')).toBe(generateCollectionEntry(set, host))
      }
    }
  })
})
