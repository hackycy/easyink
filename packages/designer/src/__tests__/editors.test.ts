import { describe, expect, it } from 'vitest'
import { ColorEditor, getEditor, hasEditor, NumberEditor, registerEditor, SelectEditor, SwitchEditor, TextEditor } from '../editors/index'

describe('editor registry', () => {
  it('registers built-in editors on import', () => {
    expect(hasEditor('text')).toBe(true)
    expect(hasEditor('number')).toBe(true)
    expect(hasEditor('color')).toBe(true)
    expect(hasEditor('select')).toBe(true)
    expect(hasEditor('switch')).toBe(true)
  })

  it('getEditor returns the registered component', () => {
    expect(getEditor('text')).toBe(TextEditor)
    expect(getEditor('number')).toBe(NumberEditor)
    expect(getEditor('color')).toBe(ColorEditor)
    expect(getEditor('select')).toBe(SelectEditor)
    expect(getEditor('switch')).toBe(SwitchEditor)
  })

  it('getEditor returns undefined for unknown editor', () => {
    expect(getEditor('unknown-xyz')).toBeUndefined()
  })

  it('hasEditor returns false for unknown editor', () => {
    expect(hasEditor('unknown-xyz')).toBe(false)
  })

  it('registerEditor adds custom editor', () => {
    const FakeComp = { name: 'FakeEditor' } as any
    registerEditor('fake-test', FakeComp)
    expect(hasEditor('fake-test')).toBe(true)
    expect(getEditor('fake-test')).toBe(FakeComp)
  })
})
