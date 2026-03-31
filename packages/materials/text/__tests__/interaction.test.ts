import type { MaterialNode } from '@easyink/core'
import type { CanvasEvent, InteractionContext } from '@easyink/designer'
import { describe, expect, it, vi } from 'vitest'
import { textInteractionStrategy } from '../src/interaction'

function createTextNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'text-1',
    type: 'text',
    props: { content: 'Hello', verticalAlign: 'top', wordBreak: 'normal', overflow: 'visible' },
    layout: { position: 'absolute', width: 100, height: 30 },
    style: {},
    ...overrides,
  } as MaterialNode
}

function createCanvasEvent(material: MaterialNode, overrides: Partial<CanvasEvent> = {}): CanvasEvent {
  return {
    originalEvent: new MouseEvent('dblclick'),
    pageX: 50,
    pageY: 15,
    material,
    ...overrides,
  }
}

function createMockContext(): InteractionContext {
  return {
    getSelectedMaterial: () => undefined,
    executeCommand: vi.fn(),
    getEngine: () => ({
      operations: {},
    }) as any,
  }
}

describe('textInteractionStrategy', () => {
  describe('onDoubleClick', () => {
    it('should return true when in selected state without binding', () => {
      const material = createTextNode()
      const event = createCanvasEvent(material)
      const result = textInteractionStrategy.onDoubleClick!(event, 'selected')
      expect(result).toBe(true)
    })

    it('should return false when not in selected state', () => {
      const material = createTextNode()
      const event = createCanvasEvent(material)
      const result = textInteractionStrategy.onDoubleClick!(event, 'editing')
      expect(result).toBe(false)
    })

    it('should return false when material has binding', () => {
      const material = createTextNode({
        binding: { path: 'user.name' },
      })
      const event = createCanvasEvent(material)
      const result = textInteractionStrategy.onDoubleClick!(event, 'selected')
      expect(result).toBe(false)
    })
  })

  describe('strategy shape', () => {
    it('should have onDoubleClick handler', () => {
      expect(textInteractionStrategy.onDoubleClick).toBeTypeOf('function')
    })

    it('should have onEnterEditing handler', () => {
      expect(textInteractionStrategy.onEnterEditing).toBeTypeOf('function')
    })

    it('should have onExitEditing handler', () => {
      expect(textInteractionStrategy.onExitEditing).toBeTypeOf('function')
    })

    it('should not have renderOverlay', () => {
      expect(textInteractionStrategy.renderOverlay).toBeUndefined()
    })
  })

  describe('onExitEditing', () => {
    it('should handle missing DOM element gracefully', () => {
      const material = createTextNode()
      const context = createMockContext()
      expect(() => {
        textInteractionStrategy.onExitEditing!(material, context)
      }).not.toThrow()
    })
  })

  describe('onEnterEditing', () => {
    it('should handle missing DOM element gracefully', () => {
      const material = createTextNode()
      const context = createMockContext()
      expect(() => {
        textInteractionStrategy.onEnterEditing!(material, context)
      }).not.toThrow()
    })
  })
})
