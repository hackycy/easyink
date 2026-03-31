import { describe, expect, it } from 'vitest'
import { imageInteractionStrategy } from '../src/interaction'

describe('imageInteractionStrategy', () => {
  it('should be an empty strategy object (default behavior)', () => {
    expect(imageInteractionStrategy).toBeDefined()
    expect(typeof imageInteractionStrategy).toBe('object')
  })

  it('should not have onDoubleClick handler', () => {
    expect(imageInteractionStrategy.onDoubleClick).toBeUndefined()
  })

  it('should not have onEnterEditing handler', () => {
    expect(imageInteractionStrategy.onEnterEditing).toBeUndefined()
  })

  it('should not have onExitEditing handler', () => {
    expect(imageInteractionStrategy.onExitEditing).toBeUndefined()
  })

  it('should not have renderOverlay handler', () => {
    expect(imageInteractionStrategy.renderOverlay).toBeUndefined()
  })
})
