import type { EasyInkEngine } from '@easyink/core'
import type { ResizeHandlePosition } from '../types'
import type { useCanvas } from './use-canvas'
import type { useSelection } from './use-selection'
import {
  createMoveElementCommand,
  createResizeElementCommand,
  fromPixels,
} from '@easyink/core'
import { ref } from 'vue'

export function useInteraction(
  engine: EasyInkEngine,
  selection: ReturnType<typeof useSelection>,
  canvas: ReturnType<typeof useCanvas>,
) {
  const isDragging = ref(false)
  const isResizing = ref(false)
  const activeHandle = ref<ResizeHandlePosition | null>(null)

  let _startMouseX = 0
  let _startMouseY = 0
  let _startElX = 0
  let _startElY = 0
  let _startElW = 0
  let _startElH = 0
  let _dragElementId = ''

  function _pxToUnit(px: number): number {
    const unit = engine.schema.schema.page.unit
    return fromPixels(px, unit, 96, canvas.zoom.value)
  }

  // ── Drag to move ──

  function startDrag(elementId: string, e: MouseEvent): void {
    const el = engine.schema.getElementById(elementId)
    if (!el || el.locked) {
      return
    }

    _dragElementId = elementId
    _startMouseX = e.clientX
    _startMouseY = e.clientY
    _startElX = el.layout.x ?? 0
    _startElY = el.layout.y ?? 0
    isDragging.value = true

    document.addEventListener('mousemove', _onDragMove)
    document.addEventListener('mouseup', _onDragEnd)
  }

  function _onDragMove(e: MouseEvent): void {
    if (!isDragging.value) {
      return
    }
    const dx = _pxToUnit(e.clientX - _startMouseX)
    const dy = _pxToUnit(e.clientY - _startMouseY)

    // 实时更新（直接操作 Schema，不走 Command 避免栈膨胀）
    engine.schema.operations.updateElementLayout(_dragElementId, {
      x: _startElX + dx,
      y: _startElY + dy,
    })
  }

  function _onDragEnd(e: MouseEvent): void {
    document.removeEventListener('mousemove', _onDragMove)
    document.removeEventListener('mouseup', _onDragEnd)

    if (!isDragging.value) {
      return
    }
    isDragging.value = false

    const dx = _pxToUnit(e.clientX - _startMouseX)
    const dy = _pxToUnit(e.clientY - _startMouseY)
    if (dx === 0 && dy === 0) {
      return
    }

    // 撤销实时变更然后用 Command 重做（保证 undo 正确）
    engine.schema.operations.updateElementLayout(_dragElementId, {
      x: _startElX,
      y: _startElY,
    })
    const cmd = createMoveElementCommand({
      elementId: _dragElementId,
      newX: _startElX + dx,
      newY: _startElY + dy,
      oldX: _startElX,
      oldY: _startElY,
    }, engine.operations)
    engine.execute(cmd)
  }

  // ── Resize ──

  function startResize(elementId: string, handle: ResizeHandlePosition, e: MouseEvent): void {
    const el = engine.schema.getElementById(elementId)
    if (!el || el.locked) {
      return
    }

    _dragElementId = elementId
    activeHandle.value = handle
    _startMouseX = e.clientX
    _startMouseY = e.clientY
    _startElX = el.layout.x ?? 0
    _startElY = el.layout.y ?? 0
    _startElW = typeof el.layout.width === 'number' ? el.layout.width : 100
    _startElH = typeof el.layout.height === 'number' ? el.layout.height : 60
    isResizing.value = true

    document.addEventListener('mousemove', _onResizeMove)
    document.addEventListener('mouseup', _onResizeEnd)
  }

  function _computeResize(e: MouseEvent) {
    const dx = _pxToUnit(e.clientX - _startMouseX)
    const dy = _pxToUnit(e.clientY - _startMouseY)
    const h = activeHandle.value!

    let x = _startElX
    let y = _startElY
    let w = _startElW
    let ht = _startElH

    // 水平
    if (h.includes('left')) {
      x = _startElX + dx
      w = _startElW - dx
    }
    else if (h.includes('right')) {
      w = _startElW + dx
    }

    // 垂直
    if (h.startsWith('top')) {
      y = _startElY + dy
      ht = _startElH - dy
    }
    else if (h.startsWith('bottom')) {
      ht = _startElH + dy
    }

    // 最小尺寸
    if (w < 1) {
      w = 1
    }
    if (ht < 1) {
      ht = 1
    }

    return { height: ht, width: w, x, y }
  }

  function _onResizeMove(e: MouseEvent): void {
    if (!isResizing.value) {
      return
    }
    const r = _computeResize(e)
    engine.schema.operations.updateElementLayout(_dragElementId, r)
  }

  function _onResizeEnd(e: MouseEvent): void {
    document.removeEventListener('mousemove', _onResizeMove)
    document.removeEventListener('mouseup', _onResizeEnd)

    if (!isResizing.value) {
      return
    }
    isResizing.value = false
    activeHandle.value = null

    const r = _computeResize(e)
    const noChange = r.x === _startElX && r.y === _startElY
      && r.width === _startElW && r.height === _startElH
    if (noChange) {
      return
    }

    // 撤销实时变更，用 Command 重做
    engine.schema.operations.updateElementLayout(_dragElementId, {
      height: _startElH,
      width: _startElW,
      x: _startElX,
      y: _startElY,
    })

    // 如果位置改了需要 move + resize，用 batch
    if (r.x !== _startElX || r.y !== _startElY) {
      const moveCmd = createMoveElementCommand({
        elementId: _dragElementId,
        newX: r.x,
        newY: r.y,
        oldX: _startElX,
        oldY: _startElY,
      }, engine.operations)
      engine.execute(moveCmd)
    }

    const resizeCmd = createResizeElementCommand({
      elementId: _dragElementId,
      newHeight: r.height,
      newWidth: r.width,
      oldHeight: _startElH,
      oldWidth: _startElW,
    }, engine.operations)
    engine.execute(resizeCmd)
  }

  return { activeHandle, isDragging, isResizing, startDrag, startResize }
}
