import { describe, expect, it } from 'vitest'
import { buildMaterialContext, getMaterialAliases, getMaterialTypes, loadMaterialsConfig } from './material-loader'

describe('materials config', () => {
  it('uses canonical material types generated from real material descriptors', () => {
    const config = loadMaterialsConfig()
    const types = getMaterialTypes(config)

    expect(types.has('text')).toBe(true)
    expect(types.has('line')).toBe(true)
    expect(types.has('table-data')).toBe(true)
    expect(types.has('table-static')).toBe(true)
    expect(types.has('table')).toBe(false)
    expect(types.has('rich-text')).toBe(false)
  })

  it('documents aliases as repair hints instead of canonical generation targets', () => {
    const config = loadMaterialsConfig()
    const aliases = getMaterialAliases(config)
    const context = buildMaterialContext(config)

    expect(aliases.table).toBe('table-data')
    expect(context).toContain('Generate the canonical material type, never the alias')
    expect(context).toContain('Do not use legacy type table')
    expect(context).toContain('two virtual preview rows')
    expect(context).toContain('display-only and must not be encoded as extra schema rows')
  })
})
