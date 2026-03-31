import type { MaterialNode } from '@easyink/core'
import type { CanvasEvent, InteractionContext } from '@easyink/designer'
import { describe, expect, it, vi } from 'vitest'
import { richTextInteractionStrategy } from '../src/interaction'

function createRichTextNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'rich-text-1',
    type: 'rich-text',
    props: { content: '<p>Hello</p>', verticalAlign: 'top' },
    layout: { position: 'absolute', width: 200, height: 60 },
    style: {},
    ...overrides,
  } as MaterialNode
}

function createCanvasEvent(material: MaterialNode): CanvasEvent {
  return {
    originalEvent: new MouseEvent('dblclick'),
    pageX: 50,
    pageY: 15,
    material,
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

describe('richTextInteractionStrategy', () => {
  describe('onDoubleClick', () => {
    it('should return true when in selected state without binding', () => {
      const material = createRichTextNode()
      const event = createCanvasEvent(material)
      const result = richTextInteractionStrategy.onDoubleClick!(event, 'selected')
      expect(result).toBe(true)
    })

    it('should return false when not in selected state', () => {
      const material = createRichTextNode()
      const event = createCanvasEvent(material)
      const result = richTextInteractionStrategy.onDoubleClick!(event, 'editing')
      expect(result).toBe(false)
    })

    it('should return false when material has binding', () => {
      const material = createRichTextNode({
        binding: { path: 'content.html' },
      })
      const event = createCanvasEvent(material)
      const result = richTextInteractionStrategy.onDoubleClick!(event, 'selected')
      expect(result).toBe(false)
    })
  })

  describe('strategy shape', () => {
    it('should have onDoubleClick handler', () => {
      expect(richTextInteractionStrategy.onDoubleClick).toBeTypeOf('function')
    })

    it('should have onEnterEditing handler', () => {
      expect(richTextInteractionStrategy.onEnterEditing).toBeTypeOf('function')
    })

    it('should have onExitEditing handler', () => {
      expect(richTextInteractionStrategy.onExitEditing).toBeTypeOf('function')
    })

    it('should not have renderOverlay', () => {
      expect(richTextInteractionStrategy.renderOverlay).toBeUndefined()
    })
  })

  describe('onExitEditing', () => {
    it('should handle missing DOM element gracefully', () => {
      const material = createRichTextNode()
      const context = createMockContext()
      expect(() => {
        richTextInteractionStrategy.onExitEditing!(material, context)
      }).not.toThrow()
    })
  })

  describe('onEnterEditing', () => {
    it('should handle missing DOM element gracefully', () => {
      const material = createRichTextNode()
      const context = createMockContext()
      expect(() => {
        richTextInteractionStrategy.onEnterEditing!(material, context)
      }).not.toThrow()
    })
  })
})
