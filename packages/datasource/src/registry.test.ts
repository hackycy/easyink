import { describe, expect, it } from 'vitest'
import { DataSourceRegistry } from './registry'

describe('dataSourceRegistry', () => {
  it('registers and retrieves a source by id', () => {
    const reg = new DataSourceRegistry()
    const source = { id: 's1', name: 'Source 1', fields: [] }
    reg.registerSource(source)
    expect(reg.getSourceSync('s1')).toBe(source)
  })

  it('returns undefined for unknown source', () => {
    const reg = new DataSourceRegistry()
    expect(reg.getSourceSync('unknown')).toBeUndefined()
  })

  it('finds source by tag', () => {
    const reg = new DataSourceRegistry()
    const source = { id: 's1', name: 'Source 1', tag: 'main', fields: [] }
    reg.registerSource(source)
    expect(reg.findSourceByTag('main')).toBe(source)
  })

  it('returns undefined when tag not found', () => {
    const reg = new DataSourceRegistry()
    expect(reg.findSourceByTag('none')).toBeUndefined()
  })

  it('getSources returns all registered sources', () => {
    const reg = new DataSourceRegistry()
    reg.registerSource({ id: 's1', name: 'A', fields: [] })
    reg.registerSource({ id: 's2', name: 'B', fields: [] })
    expect(reg.getSources()).toHaveLength(2)
  })

  it('unregisterSource removes a source', () => {
    const reg = new DataSourceRegistry()
    reg.registerSource({ id: 's1', name: 'A', fields: [] })
    reg.unregisterSource('s1')
    expect(reg.getSourceSync('s1')).toBeUndefined()
  })

  it('clear removes everything', () => {
    const reg = new DataSourceRegistry()
    reg.registerSource({ id: 's1', name: 'A', fields: [] })
    reg.clear()
    expect(reg.getSources()).toHaveLength(0)
  })

  it('resolves a provider factory on async access', async () => {
    const reg = new DataSourceRegistry()
    const source = { id: 'remote', name: 'Remote Source', fields: [] }

    reg.registerProviderFactory({
      id: 'remote',
      namespace: 'external',
      resolve: async () => source,
    })

    await expect(reg.getSource('remote')).resolves.toBe(source)
    expect(reg.getSourceSync('remote')).toBe(source)
  })
})
