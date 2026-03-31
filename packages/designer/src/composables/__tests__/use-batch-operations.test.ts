import type { EasyInkEngine } from '@easyink/core'
import type { useSelection } from '../use-selection'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { useBatchOperations } from '../use-batch-operations'

interface MockLayout {
  height: number
  width: number
  x: number
  y: number
}

interface MockElement {
  id: string
  layout: MockLayout
  locked?: boolean
  type: string
}

function makeMockElement(
  id: string,
  layout: MockLayout,
  locked = false,
): MockElement {
  return { id, layout, locked, type: 'rect' }
}

function makeMockEngine(elements: MockElement[]) {
  const ops = {
    addMaterial: vi.fn(),
    removeMaterial: vi.fn(),
    updateMaterialLayout: vi.fn(),
  }
  const engine = {
    commands: {
      beginTransaction: vi.fn(),
      commitTransaction: vi.fn(),
    },
    execute: vi.fn((cmd: { execute: () => void }) => cmd.execute()),
    get operations() {
      return ops
    },
    schema: {
      getMaterialById: vi.fn((id: string) =>
        elements.find(el => el.id === id) ?? null,
      ),
      operations: ops,
      schema: {
        materials: elements.map(el => ({
          id: el.id,
          layout: { ...el.layout },
          locked: el.locked,
          props: {},
          style: {},
          type: el.type,
        })),
      },
    },
  }
  return engine as unknown as EasyInkEngine & typeof engine
}

function makeMockSelection(ids: string[]): ReturnType<typeof useSelection> {
  return {
    deselect: vi.fn(),
    isSelected: vi.fn((id: string) => ids.includes(id)),
    select: vi.fn(),
    selectedElement: ref(undefined),
    selectedIds: ref(ids),
  } as unknown as ReturnType<typeof useSelection>
}

describe('useBatchOperations', () => {
  describe('batchDelete', () => {
    it('removes all selected elements in reverse index order, wraps in transaction', () => {
      const elements = [
        makeMockElement('el-1', { height: 20, width: 40, x: 0, y: 0 }),
        makeMockElement('el-2', { height: 20, width: 40, x: 50, y: 0 }),
        makeMockElement('el-3', { height: 20, width: 40, x: 100, y: 0 }),
      ]
      const engine = makeMockEngine(elements)
      const selection = makeMockSelection([
        'el-1',
        'el-3',
      ])

      const { batchDelete } = useBatchOperations(engine, selection)
      batchDelete()

      expect(engine.commands.beginTransaction).toHaveBeenCalledWith('批量删除')
      expect(engine.commands.commitTransaction).toHaveBeenCalled()
      expect(engine.execute).toHaveBeenCalledTimes(2)
      expect(selection.deselect).toHaveBeenCalled()

      // Verify reverse index order: el-3 (index 2) removed before el-1 (index 0)
      const removeIds = engine.schema.operations.removeMaterial.mock.calls.map(
        (c: unknown[]) => c[0],
      )
      expect(removeIds).toEqual([
        'el-3',
        'el-1',
      ])
    })

    it('does nothing if nothing selected', () => {
      const engine = makeMockEngine([])
      const selection = makeMockSelection([])

      const { batchDelete } = useBatchOperations(engine, selection)
      batchDelete()

      expect(engine.commands.beginTransaction).not.toHaveBeenCalled()
      expect(engine.execute).not.toHaveBeenCalled()
      expect(selection.deselect).not.toHaveBeenCalled()
    })
  })

  describe('alignment operations', () => {
    // Three elements at different positions:
    //   el-1: (10, 20) 40x30
    //   el-2: (60, 10) 50x40
    //   el-3: (30, 50) 30x20
    function makeAlignSetup() {
      const elements = [
        makeMockElement('el-1', { height: 30, width: 40, x: 10, y: 20 }),
        makeMockElement('el-2', { height: 40, width: 50, x: 60, y: 10 }),
        makeMockElement('el-3', { height: 20, width: 30, x: 30, y: 50 }),
      ]
      const engine = makeMockEngine(elements)
      const selection = makeMockSelection([
        'el-1',
        'el-2',
        'el-3',
      ])
      return {
        engine,
        ops: useBatchOperations(engine, selection),
        selection,
      }
    }

    function getLayoutUpdates(engine: ReturnType<typeof makeMockEngine>) {
      return engine.schema.operations.updateMaterialLayout.mock.calls.map(
        (c: unknown[]) => ({ id: c[0], layout: c[1] }),
      )
    }

    it('alignLeft aligns to minimum x', () => {
      const { engine, ops } = makeAlignSetup()
      ops.alignLeft()

      expect(engine.commands.beginTransaction).toHaveBeenCalledWith('批量对齐')
      expect(engine.commands.commitTransaction).toHaveBeenCalled()

      // min X = 10 (el-1). el-1 stays, el-2 and el-3 move to x=10
      const updates = getLayoutUpdates(engine)
      expect(updates).toHaveLength(2)
      expect(updates).toContainEqual({ id: 'el-2', layout: { x: 10, y: 10 } })
      expect(updates).toContainEqual({ id: 'el-3', layout: { x: 10, y: 50 } })
    })

    it('alignRight aligns to maximum right edge', () => {
      const { engine, ops } = makeAlignSetup()
      ops.alignRight()

      // max right = max(10+40, 60+50, 30+30) = 110
      // el-1: x = 110-40 = 70, el-2: x = 110-50 = 60 (no change), el-3: x = 110-30 = 80
      const updates = getLayoutUpdates(engine)
      expect(updates).toHaveLength(2)
      expect(updates).toContainEqual({ id: 'el-1', layout: { x: 70, y: 20 } })
      expect(updates).toContainEqual({ id: 'el-3', layout: { x: 80, y: 50 } })
    })

    it('alignTop aligns to minimum y', () => {
      const { engine, ops } = makeAlignSetup()
      ops.alignTop()

      // min Y = 10 (el-2). el-2 stays, el-1 and el-3 move to y=10
      const updates = getLayoutUpdates(engine)
      expect(updates).toHaveLength(2)
      expect(updates).toContainEqual({ id: 'el-1', layout: { x: 10, y: 10 } })
      expect(updates).toContainEqual({ id: 'el-3', layout: { x: 30, y: 10 } })
    })

    it('alignBottom aligns to maximum bottom edge', () => {
      const { engine, ops } = makeAlignSetup()
      ops.alignBottom()

      // max bottom = max(20+30, 10+40, 50+20) = 70
      // el-1: y = 70-30 = 40, el-2: y = 70-40 = 30, el-3: y = 70-20 = 50 (no change)
      const updates = getLayoutUpdates(engine)
      expect(updates).toHaveLength(2)
      expect(updates).toContainEqual({ id: 'el-1', layout: { x: 10, y: 40 } })
      expect(updates).toContainEqual({ id: 'el-2', layout: { x: 60, y: 30 } })
    })

    it('alignHCenter centers horizontally', () => {
      const { engine, ops } = makeAlignSetup()
      ops.alignHCenter()

      // minX = 10, maxRight = 110, centerX = 60
      // el-1: x = 60-20 = 40, el-2: x = 60-25 = 35, el-3: x = 60-15 = 45
      const updates = getLayoutUpdates(engine)
      expect(updates).toHaveLength(3)
      expect(updates).toContainEqual({ id: 'el-1', layout: { x: 40, y: 20 } })
      expect(updates).toContainEqual({ id: 'el-2', layout: { x: 35, y: 10 } })
      expect(updates).toContainEqual({ id: 'el-3', layout: { x: 45, y: 50 } })
    })

    it('alignVCenter centers vertically', () => {
      const { engine, ops } = makeAlignSetup()
      ops.alignVCenter()

      // minY = 10, maxBottom = 70, centerY = 40
      // el-1: y = 40-15 = 25, el-2: y = 40-20 = 20, el-3: y = 40-10 = 30
      const updates = getLayoutUpdates(engine)
      expect(updates).toHaveLength(3)
      expect(updates).toContainEqual({ id: 'el-1', layout: { x: 10, y: 25 } })
      expect(updates).toContainEqual({ id: 'el-2', layout: { x: 60, y: 20 } })
      expect(updates).toContainEqual({ id: 'el-3', layout: { x: 30, y: 30 } })
    })
  })

  describe('distribute operations', () => {
    it('distributeHorizontal does nothing if fewer than 3 elements', () => {
      const elements = [
        makeMockElement('el-1', { height: 20, width: 40, x: 0, y: 0 }),
        makeMockElement('el-2', { height: 20, width: 40, x: 50, y: 0 }),
      ]
      const engine = makeMockEngine(elements)
      const selection = makeMockSelection([
        'el-1',
        'el-2',
      ])

      const { distributeHorizontal } = useBatchOperations(engine, selection)
      distributeHorizontal()

      expect(engine.commands.beginTransaction).not.toHaveBeenCalled()
      expect(engine.execute).not.toHaveBeenCalled()
    })

    it('distributeVertical does nothing if fewer than 3 elements', () => {
      const elements = [
        makeMockElement('el-1', { height: 20, width: 40, x: 0, y: 0 }),
        makeMockElement('el-2', { height: 20, width: 40, x: 0, y: 50 }),
      ]
      const engine = makeMockEngine(elements)
      const selection = makeMockSelection([
        'el-1',
        'el-2',
      ])

      const { distributeVertical } = useBatchOperations(engine, selection)
      distributeVertical()

      expect(engine.commands.beginTransaction).not.toHaveBeenCalled()
      expect(engine.execute).not.toHaveBeenCalled()
    })
  })
})
