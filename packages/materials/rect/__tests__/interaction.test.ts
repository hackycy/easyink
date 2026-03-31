import { describe, expect, it } from 'vitest'
import { rectInteractionStrategy } from '../src/interaction'

describe('rectInteractionStrategy', () => {
  it('should be an empty strategy object (default behavior)', () => {
    expect(rectInteractionStrategy).toBeDefined()
    expect(typeof rectInteractionStrategy).toBe('object')
  })

  it('should not have onDoubleClick handler', () => {
    expect(rectInteractionStrategy.onDoubleClick).toBeUndefined()
  })

  it('should not have onEnterEditing handler', () => {
    expect(rectInteractionStrategy.onEnterEditing).toBeUndefined()
  })

  it('should not have onExitEditing handler', () => {
    expect(rectInteractionStrategy.onExitEditing).toBeUndefined()
  })

  it('should not have renderOverlay handler', () => {
    expect(rectInteractionStrategy.renderOverlay).toBeUndefined()
  })
})
