import type { EasyInkEngine } from '@easyink/core'
import type { useSelection } from './use-selection'
import {
  createMoveElementCommand,
  createRemoveElementCommand,
} from '@easyink/core'
import { cloneDeep } from '@easyink/shared'

export function useBatchOperations(
  engine: EasyInkEngine,
  selection: ReturnType<typeof useSelection>,
) {
  function _getSelectedLayouts() {
    return selection.selectedIds.value
      .map((id) => {
        const el = engine.schema.getElementById(id)
        if (!el || el.locked) {
          return null
        }
        return {
          height: typeof el.layout.height === 'number' ? el.layout.height : 0,
          id: el.id,
          width: typeof el.layout.width === 'number' ? el.layout.width : 0,
          x: el.layout.x ?? 0,
          y: el.layout.y ?? 0,
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }

  function batchDelete(): void {
    const elements = engine.schema.schema.elements
    const selectedIds = selection.selectedIds.value.slice()
    if (selectedIds.length === 0) {
      return
    }

    engine.commands.beginTransaction('批量删除')
    // Iterate in reverse index order to avoid index shift
    const entries = selectedIds
      .map((id) => {
        const idx = elements.findIndex(el => el.id === id)
        const el = elements[idx]
        return idx >= 0 && el ? { element: cloneDeep(el), id, index: idx } : null
      })
      .filter((e): e is NonNullable<typeof e> => e !== null)
      .sort((a, b) => b.index - a.index)

    for (const entry of entries) {
      const cmd = createRemoveElementCommand(
        { element: entry.element, index: entry.index },
        engine.operations,
      )
      engine.execute(cmd)
    }
    engine.commands.commitTransaction()
    selection.deselect()
  }

  function _batchMove(calcNewPos: (item: ReturnType<typeof _getSelectedLayouts>[0]) => { x: number, y: number }): void {
    const items = _getSelectedLayouts()
    if (items.length < 2) {
      return
    }

    engine.commands.beginTransaction('批量对齐')
    for (const item of items) {
      const newPos = calcNewPos(item)
      if (newPos.x === item.x && newPos.y === item.y) {
        continue
      }
      const cmd = createMoveElementCommand({
        elementId: item.id,
        newX: newPos.x,
        newY: newPos.y,
        oldX: item.x,
        oldY: item.y,
      }, engine.operations)
      engine.execute(cmd)
    }
    engine.commands.commitTransaction()
  }

  function alignLeft(): void {
    const items = _getSelectedLayouts()
    const minX = Math.min(...items.map(i => i.x))
    _batchMove(item => ({ x: minX, y: item.y }))
  }

  function alignRight(): void {
    const items = _getSelectedLayouts()
    const maxRight = Math.max(...items.map(i => i.x + i.width))
    _batchMove(item => ({ x: maxRight - item.width, y: item.y }))
  }

  function alignTop(): void {
    const items = _getSelectedLayouts()
    const minY = Math.min(...items.map(i => i.y))
    _batchMove(item => ({ x: item.x, y: minY }))
  }

  function alignBottom(): void {
    const items = _getSelectedLayouts()
    const maxBottom = Math.max(...items.map(i => i.y + i.height))
    _batchMove(item => ({ x: item.x, y: maxBottom - item.height }))
  }

  function alignHCenter(): void {
    const items = _getSelectedLayouts()
    const minX = Math.min(...items.map(i => i.x))
    const maxRight = Math.max(...items.map(i => i.x + i.width))
    const centerX = (minX + maxRight) / 2
    _batchMove(item => ({ x: centerX - item.width / 2, y: item.y }))
  }

  function alignVCenter(): void {
    const items = _getSelectedLayouts()
    const minY = Math.min(...items.map(i => i.y))
    const maxBottom = Math.max(...items.map(i => i.y + i.height))
    const centerY = (minY + maxBottom) / 2
    _batchMove(item => ({ x: item.x, y: centerY - item.height / 2 }))
  }

  function distributeHorizontal(): void {
    const items = _getSelectedLayouts()
    if (items.length < 3) {
      return
    }
    const sorted = [...items].sort((a, b) => a.x - b.x)
    const totalWidth = sorted.reduce((sum, i) => sum + i.width, 0)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalSpace = (last.x + last.width) - first.x - totalWidth
    const gap = totalSpace / (sorted.length - 1)

    let currentX = first.x + first.width + gap
    engine.commands.beginTransaction('水平均分')
    for (let i = 1; i < sorted.length - 1; i++) {
      const item = sorted[i]
      if (item.x !== currentX) {
        const cmd = createMoveElementCommand({
          elementId: item.id,
          newX: currentX,
          newY: item.y,
          oldX: item.x,
          oldY: item.y,
        }, engine.operations)
        engine.execute(cmd)
      }
      currentX += item.width + gap
    }
    engine.commands.commitTransaction()
  }

  function distributeVertical(): void {
    const items = _getSelectedLayouts()
    if (items.length < 3) {
      return
    }
    const sorted = [...items].sort((a, b) => a.y - b.y)
    const totalHeight = sorted.reduce((sum, i) => sum + i.height, 0)
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    const totalSpace = (last.y + last.height) - first.y - totalHeight
    const gap = totalSpace / (sorted.length - 1)

    let currentY = first.y + first.height + gap
    engine.commands.beginTransaction('垂直均分')
    for (let i = 1; i < sorted.length - 1; i++) {
      const item = sorted[i]
      if (item.y !== currentY) {
        const cmd = createMoveElementCommand({
          elementId: item.id,
          newX: item.x,
          newY: currentY,
          oldX: item.x,
          oldY: item.y,
        }, engine.operations)
        engine.execute(cmd)
      }
      currentY += item.height + gap
    }
    engine.commands.commitTransaction()
  }

  return {
    alignBottom,
    alignHCenter,
    alignLeft,
    alignRight,
    alignTop,
    alignVCenter,
    batchDelete,
    distributeHorizontal,
    distributeVertical,
  }
}
