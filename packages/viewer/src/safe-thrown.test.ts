import { describe, expect, it } from 'vitest'
import { safeSummarizeThrown } from './safe-thrown'

describe('safeSummarizeThrown', () => {
  it('reads only bounded own data message and code fields', () => {
    const thrown = Object.create({ message: 'prototype secret' })
    Object.defineProperties(thrown, {
      message: { value: 'safe message', enumerable: true },
      code: { value: 'SAFE_CODE', enumerable: true },
      stack: { get: () => { throw new Error('stack getter') } },
      toString: { value: () => { throw new Error('toString called') } },
    })

    expect(safeSummarizeThrown(thrown)).toEqual({
      message: 'safe message',
      code: 'SAFE_CODE',
      cause: { message: 'safe message', code: 'SAFE_CODE' },
    })
  })

  it('contains proxies and hostile accessors without retaining the thrown value', () => {
    const proxy = new Proxy({}, {
      getOwnPropertyDescriptor() {
        throw new Error('proxy secret')
      },
    })
    const accessor = Object.defineProperty({}, 'message', {
      get() {
        throw new Error('getter secret')
      },
    })

    for (const value of [proxy, accessor]) {
      const summary = safeSummarizeThrown(value)
      expect(summary).toEqual({ message: 'Unknown thrown value', cause: { message: 'Unknown thrown value' } })
      expect(summary.cause).not.toBe(value)
    }
  })
})
