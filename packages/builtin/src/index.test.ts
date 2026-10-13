import { describe, expect, it } from 'vitest'
import { materials as all } from './all/designer'
import { materials as basic } from './basic/designer'
import { materials as root } from './index'
import { materials as none } from './none'

describe('builtin complete collection entries', () => {
  it('uses all as the root default and retains basic and empty selections', () => {
    expect(root).toBe(all)
    expect(all).toHaveLength(25)
    expect(basic).toHaveLength(17)
    expect(none).toEqual([])
    expect(basic.every(material => all.includes(material))).toBe(true)
  })
})
