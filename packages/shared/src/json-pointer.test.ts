import { describe, expect, it } from 'vitest'
import { decodeRfc6901Pointer, isRfc6901Pointer, jsonPointerExists } from './json-pointer'

describe('rFC 6901 pointers', () => {
  it('accepts the empty root pointer and escaped tokens', () => {
    expect(isRfc6901Pointer('')).toBe(true)
    expect(jsonPointerExists(null, '')).toBe(true)
    expect(jsonPointerExists(1, '')).toBe(true)
    expect(jsonPointerExists({ 'a/b': { '~key': null } }, '/a~1b/~0key')).toBe(true)
    expect(decodeRfc6901Pointer('/a~1b/~0key')).toEqual(['a/b', '~key'])
  })

  it('rejects malformed escapes', () => {
    expect(isRfc6901Pointer('/bad~2path')).toBe(false)
  })
})
