import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { createReadonlyMap } from './readonly-map'

describe('createReadonlyMap', () => {
  it('copies the source and exposes the complete readonly map protocol', () => {
    const source = new Map([['a', 1]])
    const view = createReadonlyMap(source)
    source.set('b', 2)

    expect(view.size).toBe(1)
    expect(view.has('a')).toBe(true)
    expect(view.get('a')).toBe(1)
    expect([...view.entries()]).toEqual([['a', 1]])
    expect([...view.keys()]).toEqual(['a'])
    expect([...view.values()]).toEqual([1])
    expect([...view]).toEqual([['a', 1]])
    expect(Object.prototype.toString.call(view)).toBe('[object ReadonlyMap]')
    expect(Object.isFrozen(view)).toBe(true)
    expect('set' in view).toBe(false)
    expect('delete' in view).toBe(false)
    expect('clear' in view).toBe(false)
    expectTypeOf(view).toEqualTypeOf<ReadonlyMap<string, number>>()
  })

  it('keeps extracted methods callable and supplies the published view to forEach', () => {
    const view = createReadonlyMap(new Map([['a', 1]]))
    const has = view.has
    const entries = view.entries
    const iterator = view[Symbol.iterator]
    const callback = vi.fn()

    expect(has('a')).toBe(true)
    expect([...entries()]).toEqual([['a', 1]])
    expect([...iterator()]).toEqual([['a', 1]])
    view.forEach(callback, { receiver: true })
    expect(callback).toHaveBeenCalledWith(1, 'a', view)
    expect(callback.mock.instances[0]).toEqual({ receiver: true })
  })
})
