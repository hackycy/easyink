import { describe, expect, it } from 'vitest'
import { rebaseStableIdSelectionRegion } from './selection-region'

describe('rebaseStableIdSelectionRegion', () => {
  it('keeps stable order, removes deleted IDs, and repairs anchor/focus', () => {
    const result = rebaseStableIdSelectionRegion({
      regionId: 'cells',
      itemIds: ['a', 'b', 'c'],
      anchorId: 'a',
      focusId: 'c',
      data: { bandId: 'detail' },
    }, id => id !== 'a')

    expect(result).toEqual({
      regionId: 'cells',
      itemIds: ['b', 'c'],
      anchorId: 'b',
      focusId: 'c',
      data: { bandId: 'detail' },
    })
  })

  it('repairs a deleted focus to the last surviving ID', () => {
    expect(rebaseStableIdSelectionRegion({
      regionId: 'cells',
      itemIds: ['a', 'b', 'c'],
      anchorId: 'a',
      focusId: 'c',
    }, id => id !== 'c')).toEqual({
      regionId: 'cells',
      itemIds: ['a', 'b'],
      anchorId: 'a',
      focusId: 'b',
    })
  })

  it('returns null when every selected stable ID was deleted', () => {
    expect(rebaseStableIdSelectionRegion({
      regionId: 'cells',
      itemIds: ['a'],
      anchorId: 'a',
      focusId: 'a',
    }, () => false)).toBeNull()
  })
})
