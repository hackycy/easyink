import type { MaterialNode } from '@easyink/core'
import type { CanvasEvent, InteractionContext } from '@easyink/designer'
import { describe, expect, it, vi } from 'vitest'
import { createTableContextMenuItems, tableInteractionStrategy } from '../src/interaction'

function createTableNode(overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: 'table-1',
    type: 'table',
    props: {
      columns: [
        { key: 'col-1', title: 'Col 1', width: 50 },
        { key: 'col-2', title: 'Col 2', width: 50 },
      ],
      rowCount: 3,
      cells: {},
      bordered: true,
      borderStyle: 'solid',
    },
    layout: { position: 'flow', width: 'auto', height: 'auto' },
    style: {},
    ...overrides,
  } as MaterialNode
}

function createCanvasEvent(material: MaterialNode, overrides: Partial<CanvasEvent> = {}): CanvasEvent {
  return {
    originalEvent: new MouseEvent('dblclick'),
    pageX: 100,
    pageY: 50,
    material,
    ...overrides,
  }
}

function createMockContext(material?: MaterialNode): InteractionContext {
  const getMaterialById = material ? () => material : () => undefined
  return {
    getSelectedMaterial: () => material,
    executeCommand: vi.fn(),
    getEngine: () => ({
      operations: {},
      schema: { getMaterialById },
    }) as any,
  }
}

function createMouseEventWithTarget(): MouseEvent {
  const target = document.createElement('div')
  const event = new MouseEvent('mousedown', { bubbles: true })
  Object.defineProperty(event, 'target', { value: target })
  return event
}

describe('tableInteractionStrategy', () => {
  describe('onDoubleClick', () => {
    it('should return true when in selected state', () => {
      const material = createTableNode()
      const event = createCanvasEvent(material)
      const result = tableInteractionStrategy.onDoubleClick!(event, 'selected')
      expect(result).toBe(true)
    })

    it('should return false when not in selected state', () => {
      const material = createTableNode()
      const event = createCanvasEvent(material)
      const result = tableInteractionStrategy.onDoubleClick!(event, 'editing')
      expect(result).toBe(false)
    })
  })

  describe('onMouseDown', () => {
    it('should return false when not clicking a column handle', () => {
      const material = createTableNode()
      const event = createCanvasEvent(material, {
        originalEvent: createMouseEventWithTarget(),
      })
      const result = tableInteractionStrategy.onMouseDown!(event, 'selected')
      expect(result).toBe(false)
    })

    it('should return false when not in selected state', () => {
      const material = createTableNode()
      const event = createCanvasEvent(material, {
        originalEvent: createMouseEventWithTarget(),
      })
      const result = tableInteractionStrategy.onMouseDown!(event, 'editing')
      expect(result).toBe(false)
    })
  })

  describe('strategy shape', () => {
    it('should have onDoubleClick handler', () => {
      expect(tableInteractionStrategy.onDoubleClick).toBeTypeOf('function')
    })

    it('should have onMouseDown handler', () => {
      expect(tableInteractionStrategy.onMouseDown).toBeTypeOf('function')
    })

    it('should have onEnterEditing handler', () => {
      expect(tableInteractionStrategy.onEnterEditing).toBeTypeOf('function')
    })

    it('should have onExitEditing handler', () => {
      expect(tableInteractionStrategy.onExitEditing).toBeTypeOf('function')
    })

    it('should have renderOverlay handler', () => {
      expect(tableInteractionStrategy.renderOverlay).toBeTypeOf('function')
    })
  })

  describe('renderOverlay', () => {
    it('should return null when not in selected state', () => {
      const material = createTableNode()
      const result = tableInteractionStrategy.renderOverlay!('editing', material)
      expect(result).toBeNull()
    })

    it('should return null when only one column', () => {
      const material = createTableNode({
        props: {
          columns: [{ key: 'col-1', title: 'Col 1', width: 100 }],
          rowCount: 3,
          cells: {},
          bordered: true,
        },
      })
      const result = tableInteractionStrategy.renderOverlay!('selected', material)
      expect(result).toBeNull()
    })

    it('should return VNode with column handles when multiple columns', () => {
      const material = createTableNode()
      const result = tableInteractionStrategy.renderOverlay!('selected', material)
      expect(result).not.toBeNull()
    })
  })

  describe('onEnterEditing', () => {
    it('should handle missing DOM element gracefully', () => {
      const material = createTableNode()
      const context = createMockContext()
      expect(() => {
        tableInteractionStrategy.onEnterEditing!(material, context)
      }).not.toThrow()
    })
  })

  describe('onExitEditing', () => {
    it('should handle missing DOM element gracefully', () => {
      const material = createTableNode()
      const context = createMockContext()
      expect(() => {
        tableInteractionStrategy.onExitEditing!(material, context)
      }).not.toThrow()
    })
  })
})

describe('createTableContextMenuItems', () => {
  it('should return empty array when material not found', () => {
    const context = createMockContext()
    const items = createTableContextMenuItems('missing-id', 0, 0, context)
    expect(items).toEqual([])
  })

  it('should return 6 menu items when material exists', () => {
    const material = createTableNode()
    const context: InteractionContext = {
      getSelectedMaterial: () => material,
      executeCommand: vi.fn(),
      getEngine: () => ({
        operations: {},
        schema: { getMaterialById: () => material },
      }) as any,
    }
    const items = createTableContextMenuItems('table-1', 0, 0, context)
    expect(items).toHaveLength(6)
  })

  it('should have correct menu labels', () => {
    const material = createTableNode()
    const context: InteractionContext = {
      getSelectedMaterial: () => material,
      executeCommand: vi.fn(),
      getEngine: () => ({
        operations: {},
        schema: { getMaterialById: () => material },
      }) as any,
    }
    const items = createTableContextMenuItems('table-1', 0, 0, context)
    const labels = items.map(item => item.label)
    expect(labels).toContain('上方插入行')
    expect(labels).toContain('下方插入行')
    expect(labels).toContain('删除行')
    expect(labels).toContain('左侧插入列')
    expect(labels).toContain('右侧插入列')
    expect(labels).toContain('删除列')
  })
})
