// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { loadRenderApiConfig } from './config'
import { createRenderApiApp } from './server'

describe('render API h3 app', () => {
  it('serves health without invoking the render CLI', async () => {
    const app = createRenderApiApp(loadRenderApiConfig({}))
    const response = await app.request('/health')

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
    expect(await readJsonResponse(response)).toMatchObject({
      ok: true,
      service: 'easyink-render-api',
    })
  })

  it('keeps JSON body validation errors in the API response shape', async () => {
    const app = createRenderApiApp(loadRenderApiConfig({ EASYINK_RENDER_API_MAX_BODY_BYTES: '32' }))
    const response = await app.request('/v1/render/pdf', {
      method: 'POST',
      body: '{',
    })

    expect(response.status).toBe(400)
    expect(await readJsonResponse(response)).toMatchObject({
      success: false,
      error: {
        code: 'INVALID_JSON',
      },
    })
  })

  it('handles browser preflight requests for playground calls', async () => {
    const app = createRenderApiApp(loadRenderApiConfig({ EASYINK_RENDER_API_CORS_ORIGIN: 'http://localhost:5173' }))
    const response = await app.request('/v1/render/pdf', {
      method: 'OPTIONS',
      headers: {
        'origin': 'http://localhost:5173',
        'access-control-request-method': 'POST',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(response.headers.get('access-control-expose-headers')).toContain('x-easyink-page-count')
  })

  it('returns the API not-found envelope for unknown routes', async () => {
    const app = createRenderApiApp(loadRenderApiConfig({}))
    const response = await app.request('/missing')

    expect(response.status).toBe(404)
    expect(await readJsonResponse(response)).toEqual({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'No route for GET /missing',
      },
    })
  })
})

async function readJsonResponse(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) {
    return undefined
  }

  const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(value)
  }

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}
