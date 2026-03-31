import { EasyInkEngine } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { useSelection } from '../composables/use-selection'

function makeEngine() {
  return new EasyInkEngine()
}

function addEl(engine: EasyInkEngine, id: string, type = 'text') {
  engine.schema.addMaterial({
    id,
    layout: { height: 30, position: 'absolute', width: 100, x: 0, y: 0 },
    props: type === 'text' ? { content: 'hello' } : {},
    style: {},
    type,
  }, -1)
}

describe('useSelection', () => {
  it('starts with no selection', () => {
    const engine = makeEngine()
    const { selectedElement, selectedIds } = useSelection(engine)
    expect(selectedIds.value).toEqual([])
    expect(selectedElement.value).toBeUndefined()
  })

  it('select marks element as selected', () => {
    const engine = makeEngine()
    addEl(engine, 'el1')
    const { isSelected, select, selectedIds } = useSelection(engine)
    select('el1')
    expect(selectedIds.value).toEqual(['el1'])
    expect(isSelected('el1')).toBe(true)
  })

  it('deselect clears selection', () => {
    const engine = makeEngine()
    addEl(engine, 'el1')
    const { deselect, select, selectedIds } = useSelection(engine)
    select('el1')
    deselect()
    expect(selectedIds.value).toEqual([])
  })

  it('selectedElement resolves from engine schema', () => {
    const engine = makeEngine()
    addEl(engine, 'el2', 'rect')
    const { select, selectedElement } = useSelection(engine)
    select('el2')
    expect(selectedElement.value?.id).toBe('el2')
    expect(selectedElement.value?.type).toBe('rect')
  })

  it('isSelected is false for unselected element', () => {
    const engine = makeEngine()
    const { isSelected } = useSelection(engine)
    expect(isSelected('nobody')).toBe(false)
  })
})
