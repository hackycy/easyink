import { describe, expect, it } from 'vitest'
import { parseCurlInput, parseJsonInput } from './index'

describe('assistant adapters', () => {
  it('infers a descriptor from json samples', () => {
    const result = parseJsonInput(JSON.stringify({
      store: { name: 'Demo' },
      items: [{ name: 'Apple', quantity: 2 }],
      total: 12.5,
    }))

    expect(result.descriptor.fields.map(field => field.name)).toEqual(['store', 'items', 'total'])
    expect(result.descriptor.fields.find(field => field.name === 'items')?.fields?.[0]?.path).toBe('items/name')
  })

  it('parses curl into an http request config', () => {
    const result = parseCurlInput(`curl -X POST https://example.com/api -H 'content-type: application/json' --data '{"ok":true}'`)

    expect(result.request.url).toBe('https://example.com/api')
    expect(result.request.method).toBe('POST')
    expect(result.request.headers?.['content-type']).toBe('application/json')
  })
})
