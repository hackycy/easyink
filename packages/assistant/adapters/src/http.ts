import type { HttpRequestConfig, ParsedExternalData } from './types'
import { parseJsonInput } from './json'

export async function fetchJsonInput(request: HttpRequestConfig): Promise<ParsedExternalData> {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.method.toUpperCase() === 'GET' || request.method.toUpperCase() === 'HEAD'
      ? undefined
      : request.body,
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  const text = await response.text()
  const parsed = parseJsonInput(text, urlName(request.url))
  return {
    ...parsed,
    kind: 'http',
    request,
  }
}

function urlName(value: string): string {
  try {
    const url = new URL(value)
    const last = url.pathname.split('/').filter(Boolean).pop()
    return last || url.hostname
  }
  catch {
    return 'httpData'
  }
}
