import type { AdapterInput, ParsedExternalData } from './types'
import { parseCurlInput } from './curl'
import { fetchJsonInput } from './http'
import { parseJsonFileInput, parseJsonInput } from './json'

export async function resolveExternalData(input: AdapterInput): Promise<ParsedExternalData> {
  if (input.kind === 'json')
    return parseJsonInput(input.content, input.name)
  if (input.kind === 'file')
    return parseJsonFileInput(input.content, input.fileName)
  if (input.kind === 'http') {
    return fetchJsonInput({
      url: input.url,
      method: input.method ?? 'GET',
      headers: input.headers,
      body: input.body,
    })
  }

  const curl = parseCurlInput(input.content)
  const fetched = await fetchJsonInput(curl.request)
  return {
    ...fetched,
    kind: 'curl',
    warnings: [...curl.warnings, ...fetched.warnings],
  }
}

export { parseCurlInput } from './curl'
export { fetchJsonInput } from './http'
export { createDescriptorFromSample, parseJsonFileInput, parseJsonInput } from './json'
export type * from './types'
