const MAX_THROWN_TEXT_LENGTH = 512

export interface SafeThrownSummary {
  readonly message: string
  readonly code?: string
  readonly cause: Readonly<{ message: string, code?: string }>
}

export function safeSummarizeThrown(value: unknown): SafeThrownSummary {
  const primitive = summarizePrimitive(value)
  if (primitive !== undefined)
    return freezeSummary(primitive)

  try {
    const message = readOwnDataString(value, 'message')
    const code = readOwnDataString(value, 'code')
    return freezeSummary(message ?? 'Unknown thrown value', code)
  }
  catch {
    return freezeSummary('Unknown thrown value')
  }
}

function summarizePrimitive(value: unknown): string | undefined {
  switch (typeof value) {
    case 'string':
      return limit(value)
    case 'number':
      return Number.isFinite(value) ? String(value) : 'Non-finite number thrown'
    case 'bigint':
      return limit(String(value))
    case 'boolean':
      return String(value)
    case 'undefined':
      return 'undefined'
    case 'symbol':
      return 'Symbol thrown'
    case 'object':
      return value === null ? 'null' : undefined
    default:
      return undefined
  }
}

function readOwnDataString(value: object, key: 'message' | 'code'): string | undefined {
  const descriptor = Object.getOwnPropertyDescriptor(value, key)
  if (!descriptor || !('value' in descriptor) || typeof descriptor.value !== 'string')
    return undefined
  return limit(descriptor.value)
}

function freezeSummary(message: string, code?: string): SafeThrownSummary {
  const cause = Object.freeze({ message, ...(code === undefined ? {} : { code }) })
  return Object.freeze({ message, ...(code === undefined ? {} : { code }), cause })
}

function limit(value: string): string {
  return value.length <= MAX_THROWN_TEXT_LENGTH ? value : `${value.slice(0, MAX_THROWN_TEXT_LENGTH)}...`
}
