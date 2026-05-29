import type { JSONOutput } from 'curlconverter'
import type { HttpRequestConfig } from './types'
import { toJsonObjectWarn } from 'curlconverter'

export interface ParsedCurlRequest {
  request: HttpRequestConfig
  warnings: string[]
}

export function parseCurlInput(content: string): ParsedCurlRequest {
  const [output, warnings] = toJsonObjectWarn(content)
  return {
    request: toHttpRequest(output),
    warnings: warnings.map(([code, message]) => `${code}: ${message}`),
  }
}

function toHttpRequest(output: JSONOutput): HttpRequestConfig {
  const headers = Object.fromEntries(
    Object.entries(output.headers ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
  return {
    url: typeof (output as { raw_url?: unknown }).raw_url === 'string'
      ? (output as { raw_url: string }).raw_url
      : output.url,
    method: output.method?.toUpperCase() || 'GET',
    headers: Object.keys(headers).length ? headers : undefined,
    body: output.data == null ? undefined : typeof output.data === 'string' ? output.data : JSON.stringify(output.data),
  }
}
