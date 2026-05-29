import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchJsonInput, parseCurlInput, parseJsonFileInput, parseJsonInput } from './index'

describe('assistant adapters', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

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

  it('keeps curl query strings and sensitive headers inside request config only', () => {
    const result = parseCurlInput(`curl 'https://example.com/api?token=secret' -H 'authorization: Bearer abc'`)

    expect(result.request.url).toBe('https://example.com/api?token=secret')
    expect(result.request.headers?.authorization).toBe('Bearer abc')
  })

  it('fetches json over HTTP with a mock fetch boundary', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ orderNo: 'A001' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchJsonInput({ url: 'https://example.com/orders/1', method: 'GET' })

    expect(fetchMock).toHaveBeenCalledWith('https://example.com/orders/1', expect.objectContaining({ method: 'GET' }))
    expect(result.descriptor.name).toBe('1')
    expect(result.descriptor.fields[0]?.name).toBe('orderNo')
  })

  it('parses json files with a stable source name', () => {
    const result = parseJsonFileInput('{"total":12}', 'receipt.sample.json')

    expect(result.kind).toBe('file')
    expect(result.descriptor.name).toBe('receipt-sample')
  })
})
