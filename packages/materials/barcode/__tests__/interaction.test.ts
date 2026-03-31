import { describe, expect, it } from 'vitest'
import { barcodeInteractionStrategy } from '../src/interaction'

describe('barcodeInteractionStrategy', () => {
  it('should be an empty strategy object (default behavior)', () => {
    expect(barcodeInteractionStrategy).toBeDefined()
    expect(typeof barcodeInteractionStrategy).toBe('object')
  })

  it('should not have onDoubleClick handler', () => {
    expect(barcodeInteractionStrategy.onDoubleClick).toBeUndefined()
  })

  it('should not have onEnterEditing handler', () => {
    expect(barcodeInteractionStrategy.onEnterEditing).toBeUndefined()
  })

  it('should not have onExitEditing handler', () => {
    expect(barcodeInteractionStrategy.onExitEditing).toBeUndefined()
  })

  it('should not have renderOverlay handler', () => {
    expect(barcodeInteractionStrategy.renderOverlay).toBeUndefined()
  })
})
