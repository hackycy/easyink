import { describe, expect, it } from 'vitest'
import { lineInteractionStrategy } from '../src/interaction'

describe('lineInteractionStrategy', () => {
  it('should be an empty strategy object (default behavior)', () => {
    expect(lineInteractionStrategy).toBeDefined()
    expect(typeof lineInteractionStrategy).toBe('object')
  })

  it('should not have onDoubleClick handler', () => {
    expect(lineInteractionStrategy.onDoubleClick).toBeUndefined()
  })

  it('should not have onEnterEditing handler', () => {
    expect(lineInteractionStrategy.onEnterEditing).toBeUndefined()
  })

  it('should not have onExitEditing handler', () => {
    expect(lineInteractionStrategy.onExitEditing).toBeUndefined()
  })

  it('should not have renderOverlay handler', () => {
    expect(lineInteractionStrategy.renderOverlay).toBeUndefined()
  })
})
