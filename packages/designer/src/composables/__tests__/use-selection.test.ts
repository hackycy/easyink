import type { EasyInkEngine, MaterialNode } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { useSelection } from '../use-selection'

function makeElement(
  id: string,
  opts: { height?: number, hidden?: boolean, locked?: boolean, width?: number, x?: number, y?: number } = {},
): MaterialNode {
  return {
    id,
    layout: {
      height: opts.height ?? 30,
      position: 'absolute',
      width: opts.width ?? 100,
      x: opts.x ?? 0,
      y: opts.y ?? 0,
    },
    props: {},
    style: {},
    type: 'rect',
    hidden: opts.hidden,
    locked: opts.locked,
  } as MaterialNode
}

function makeEngine(elements: MaterialNode[] = []) {
  const elementsMap = new Map(elements.map(el => [el.id, el]))

  return {
    hooks: {
      selectionChanged: { emit: vi.fn() },
    },
    schema: {
      getMaterialById: (id: string) => elementsMap.get(id),
      schema: { materials: elements },
    },
  } as unknown as EasyInkEngine
}

describe('useSelection (multi-select)', () => {
  it('select sets selectedIds to [id]', () => {
    const el = makeElement('a')
    const engine = makeEngine([el])
    const { select, selectedIds } = useSelection(engine)

    select('a')

    expect(selectedIds.value).toEqual(['a'])
    expect(engine.hooks.selectionChanged.emit).toHaveBeenCalledWith(['a'])
  })

  it('deselect clears selectedIds', () => {
    const engine = makeEngine([makeElement('a')])
    const { deselect, select, selectedIds } = useSelection(engine)

    select('a')
    deselect()

    expect(selectedIds.value).toEqual([])
    expect(engine.hooks.selectionChanged.emit).toHaveBeenLastCalledWith([])
  })

  it('isSelected returns true when id is included', () => {
    const engine = makeEngine([makeElement('a')])
    const { isSelected, select } = useSelection(engine)

    select('a')

    expect(isSelected('a')).toBe(true)
    expect(isSelected('b')).toBe(false)
  })

  it('toggleSelect adds id if not present', () => {
    const engine = makeEngine([
      makeElement('a'),
      makeElement('b'),
    ])
    const { select, selectedIds, toggleSelect } = useSelection(engine)

    select('a')
    toggleSelect('b')

    expect(selectedIds.value).toEqual([
      'a',
      'b',
    ])
  })

  it('toggleSelect removes id if already present', () => {
    const engine = makeEngine([
      makeElement('a'),
      makeElement('b'),
    ])
    const { selectedIds, selectMany, toggleSelect } = useSelection(engine)

    selectMany([
      'a',
      'b',
    ])
    toggleSelect('a')

    expect(selectedIds.value).toEqual(['b'])
  })

  it('selectMany sets multiple ids at once', () => {
    const engine = makeEngine([
      makeElement('a'),
      makeElement('b'),
      makeElement('c'),
    ])
    const { selectedIds, selectMany } = useSelection(engine)

    selectMany([
      'a',
      'b',
      'c',
    ])

    expect(selectedIds.value).toEqual([
      'a',
      'b',
      'c',
    ])
    expect(engine.hooks.selectionChanged.emit).toHaveBeenCalledWith([
      'a',
      'b',
      'c',
    ])
  })

  it('selectAll selects all non-hidden, non-locked elements', () => {
    const engine = makeEngine([
      makeElement('a'),
      makeElement('b', { hidden: true }),
      makeElement('c', { locked: true }),
      makeElement('d'),
    ])
    const { selectAll, selectedIds } = useSelection(engine)

    selectAll()

    expect(selectedIds.value).toEqual([
      'a',
      'd',
    ])
  })

  it('selectedElement returns first element when single selected', () => {
    const el = makeElement('a')
    const engine = makeEngine([el])
    const { select, selectedElement } = useSelection(engine)

    select('a')

    expect(selectedElement.value).toBe(el)
  })

  it('selectedElement returns first element when multiple selected', () => {
    const elA = makeElement('a')
    const elB = makeElement('b')
    const engine = makeEngine([
      elA,
      elB,
    ])
    const { selectMany, selectedElement } = useSelection(engine)

    selectMany([
      'a',
      'b',
    ])

    expect(selectedElement.value).toBe(elA)
  })

  it('selectedElements returns all selected elements', () => {
    const elA = makeElement('a')
    const elB = makeElement('b')
    const engine = makeEngine([
      elA,
      elB,
    ])
    const { selectMany, selectedElements } = useSelection(engine)

    selectMany([
      'a',
      'b',
    ])

    expect(selectedElements.value).toEqual([
      elA,
      elB,
    ])
  })

  it('selectionBounds returns null when nothing selected', () => {
    const engine = makeEngine([])
    const { selectionBounds } = useSelection(engine)

    expect(selectionBounds.value).toBeNull()
  })

  it('selectionBounds returns correct bounding box for multiple elements', () => {
    const engine = makeEngine([
      makeElement('a', { height: 20, width: 50, x: 10, y: 10 }),
      makeElement('b', { height: 30, width: 40, x: 80, y: 60 }),
    ])
    const { selectMany, selectionBounds } = useSelection(engine)

    selectMany([
      'a',
      'b',
    ])

    expect(selectionBounds.value).toEqual({
      height: 80, // 90 - 10
      width: 110, // 120 - 10
      x: 10,
      y: 10,
    })
  })
})
