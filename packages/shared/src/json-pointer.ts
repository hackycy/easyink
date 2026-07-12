export type Rfc6901Pointer = '' | `/${string}`

const POINTER_PATTERN = /^(?:\/(?:[^~/]|~[01])*)*$/u

export function isRfc6901Pointer(value: unknown): value is Rfc6901Pointer {
  return typeof value === 'string' && POINTER_PATTERN.test(value)
}

export function decodeRfc6901Pointer(pointer: Rfc6901Pointer): string[] {
  if (!isRfc6901Pointer(pointer))
    throw new Error('JSON_POINTER_INVALID')
  if (pointer === '')
    return []
  return pointer.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~'))
}

export function jsonPointerExists(root: unknown, pointer: Rfc6901Pointer): boolean {
  let value = root
  for (const token of decodeRfc6901Pointer(pointer)) {
    if (value === null || typeof value !== 'object')
      return false
    const descriptor = Object.getOwnPropertyDescriptor(value, token)
    if (!descriptor || !('value' in descriptor))
      return false
    value = descriptor.value
  }
  return true
}

export function appendRfc6901Token(pointer: Rfc6901Pointer, token: string): `/${string}` {
  return `${pointer}/${token.replaceAll('~', '~0').replaceAll('/', '~1')}`
}
