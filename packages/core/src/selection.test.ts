import { describe, expect, it } from 'vitest'
import { SelectionModel } from './selection'

describe('selectionModel', () => {
  it('starts empty', () => {
    const sel = new SelectionModel()
    expect(sel.isEmpty).toBe(true)
    expect(sel.count).toBe(0)
  })

  it('select sets single element and clears previous', () => {
    const sel = new SelectionModel()
    sel.select('a')
    expect(sel.has('a')).toBe(true)
    expect(sel.count).toBe(1)

    sel.select('b')
    expect(sel.has('a')).toBe(false)
    expect(sel.has('b')).toBe(true)
    expect(sel.count).toBe(1)
  })

  it('selectMultiple sets multiple elements', () => {
    const sel = new SelectionModel()
    sel.selectMultiple(['a', 'b', 'c'])
    expect(sel.count).toBe(3)
    expect(sel.has('a')).toBe(true)
    expect(sel.has('b')).toBe(true)
    expect(sel.has('c')).toBe(true)
  })

  it('toggle adds and removes', () => {
    const sel = new SelectionModel()
    sel.select('a')
    sel.toggle('a')
    expect(sel.isEmpty).toBe(true)
    sel.toggle('a')
    expect(sel.has('a')).toBe(true)
  })

  it('add without clearing', () => {
    const sel = new SelectionModel()
    sel.select('a')
    sel.add('b')
    expect(sel.count).toBe(2)
    expect(sel.has('a')).toBe(true)
    expect(sel.has('b')).toBe(true)
  })

  it('remove deletes specific id', () => {
    const sel = new SelectionModel()
    sel.selectMultiple(['a', 'b', 'c'])
    sel.remove('b')
    expect(sel.has('b')).toBe(false)
    expect(sel.count).toBe(2)
  })

  it('clear empties selection', () => {
    const sel = new SelectionModel()
    sel.selectMultiple(['a', 'b'])
    sel.clear()
    expect(sel.isEmpty).toBe(true)
  })

  it('has returns correct boolean', () => {
    const sel = new SelectionModel()
    sel.select('x')
    expect(sel.has('x')).toBe(true)
    expect(sel.has('y')).toBe(false)
  })

  it('reconcile removes ids not in nodes', () => {
    const sel = new SelectionModel()
    sel.selectMultiple(['a', 'b', 'c'])
    sel.reconcile(['a', 'c'] as const)
    expect(sel.has('b')).toBe(false)
    expect(sel.count).toBe(2)
  })

  it('changes lineage for user changes but preserves it when reconcile retains a stable ID', () => {
    const sel = new SelectionModel()
    const initial = sel.lineageId
    sel.selectMultiple(['a', 'b'])
    const selected = sel.lineageId
    expect(selected).not.toBe(initial)

    sel.reconcile(['b'])
    expect(sel.ids).toEqual(['b'])
    expect(sel.lineageId).toBe(selected)

    sel.reconcile([])
    expect(sel.lineageId).not.toBe(selected)
  })

  describe('change notification short-circuit', () => {
    function trackedSelection() {
      const sel = new SelectionModel()
      let count = 0
      sel.onChange(() => {
        count++
      })
      return { sel, calls: () => count }
    }

    it('select(sameId) does not notify', () => {
      const { sel, calls } = trackedSelection()
      sel.select('a')
      expect(calls()).toBe(1)
      sel.select('a')
      expect(calls()).toBe(1)
    })

    it('selectMultiple with same set does not notify', () => {
      const { sel, calls } = trackedSelection()
      sel.selectMultiple(['a', 'b'])
      expect(calls()).toBe(1)
      sel.selectMultiple(['b', 'a'])
      expect(calls()).toBe(1)
    })

    it('selectMultiple with duplicate IDs does not change an equivalent selection or lineage', () => {
      const { sel, calls } = trackedSelection()
      sel.select('a')
      const lineage = sel.lineageId
      sel.selectMultiple(['a', 'a'])
      expect(calls()).toBe(1)
      expect(sel.lineageId).toBe(lineage)
    })

    it('selectMultiple([]) on empty selection does not notify', () => {
      const { sel, calls } = trackedSelection()
      sel.selectMultiple([])
      expect(calls()).toBe(0)
    })

    it('add(existing) does not notify', () => {
      const { sel, calls } = trackedSelection()
      sel.select('a')
      expect(calls()).toBe(1)
      sel.add('a')
      expect(calls()).toBe(1)
    })

    it('remove(missing) does not notify', () => {
      const { sel, calls } = trackedSelection()
      sel.remove('a')
      expect(calls()).toBe(0)
    })

    it('clear() on empty selection does not notify', () => {
      const { sel, calls } = trackedSelection()
      sel.clear()
      expect(calls()).toBe(0)
    })

    it('reconcile() with no stale ids does not notify', () => {
      const { sel, calls } = trackedSelection()
      sel.selectMultiple(['a', 'b'])
      expect(calls()).toBe(1)
      sel.reconcile(['a', 'b'] as const)
      expect(calls()).toBe(1)
    })
  })

  it('uses canonical editor state for interaction eligibility', async () => {
    const { isInteractable } = await import('./selection')
    expect(isInteractable({ editorState: { locked: true } } as any)).toBe(false)
    expect(isInteractable({ editorState: { hidden: true } } as any)).toBe(false)
  })
})
