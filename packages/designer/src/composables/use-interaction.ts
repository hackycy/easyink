import type { EasyInkEngine } from '@easyink/core'
import type { ResizeHandlePosition } from '../types'
import type { useCanvas } from './use-canvas'
import type { useSelection } from './use-selection'
import type { useSnapping } from './use-snapping'
import {
  createMoveMaterialCommand,
  createResizeMaterialCommand,
  createRotateMaterialCommand,
  fromPixels,
} from '@easyink/core'
import { ref } from 'vue'

export function useInteraction(
  engine: EasyInkEngine,
  selection: ReturnType<typeof useSelection>,
  canvas: ReturnType<typeof useCanvas>,
  snapping?: ReturnType<typeof useSnapping>,
) {
  const isDragging = ref(false)
  const isResizing = ref(false)
  const isRotating = ref(false)
  const activeHandle = ref<ResizeHandlePosition | null>(null)

  let _startMouseX = 0
  let _startMouseY = 0
  let _startElX = 0
  let _startElY = 0
  let _startElW = 0
  let _startElH = 0
  let _dragElementId = ''
  let _isMultiDrag = false
  let _multiDragStarts: Array<{ height: number, id: string, width: number, x: number, y: number }> = []

  function _pxToUnit(px: number): number {
    const unit = engine.schema.schema.page.unit
    return fromPixels(px, unit, 96, canvas.zoom.value)
  }

  // ── Drag to move ──

  function startDrag(materialId: string, e: MouseEvent): void {
    const el = engine.schema.getMaterialById(materialId)
    if (!el || el.locked) {
      return
    }

    // Check if this element is part of a multi-selection
    const ids = selection.selectedIds.value
    if (ids.length > 1 && ids.includes(materialId)) {
      _startMultiDrag(e)
      return
    }

    _isMultiDrag = false
    _dragElementId = materialId
    _startMouseX = e.clientX
    _startMouseY = e.clientY
    _startElX = el.layout.x ?? 0
    _startElY = el.layout.y ?? 0
    _startElW = typeof el.layout.width === 'number' ? el.layout.width : 100
    _startElH = typeof el.layout.height === 'number' ? el.layout.height : 60
    isDragging.value = true

    document.addEventListener('mousemove', _onDragMove)
    document.addEventListener('mouseup', _onDragEnd)
  }

  function _startMultiDrag(e: MouseEvent): void {
    _isMultiDrag = true
    _startMouseX = e.clientX
    _startMouseY = e.clientY
    _multiDragStarts = []

    for (const id of selection.selectedIds.value) {
      const el = engine.schema.getMaterialById(id)
      if (!el || el.locked) {
        continue
      }
      _multiDragStarts.push({
        height: typeof el.layout.height === 'number' ? el.layout.height : 60,
        id: el.id,
        width: typeof el.layout.width === 'number' ? el.layout.width : 100,
        x: el.layout.x ?? 0,
        y: el.layout.y ?? 0,
      })
    }

    if (_multiDragStarts.length === 0) {
      return
    }

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

    if (_isMultiDrag) {
      // Multi-element drag: apply snapping to bounding box
      let adjustedDx = dx
      let adjustedDy = dy
      if (snapping && _multiDragStarts.length > 0) {
        const bounds = _getMultiBounds(_multiDragStarts)
        const result = snapping.calculateSnap(
          '',
          bounds.x + dx,
          bounds.y + dy,
          bounds.width,
          bounds.height,
          _multiDragStarts.map(s => s.id),
        )
        adjustedDx = result.adjustedX - bounds.x
        adjustedDy = result.adjustedY - bounds.y
      }
      for (const start of _multiDragStarts) {
        engine.schema.operations.updateMaterialLayout(start.id, {
          x: start.x + adjustedDx,
          y: start.y + adjustedDy,
        })
      }
    }
    else {
      // Single element drag with snapping
      let newX = _startElX + dx
      let newY = _startElY + dy
      if (snapping) {
        const result = snapping.calculateSnap(
          _dragElementId,
          newX,
          newY,
          _startElW,
          _startElH,
          [_dragElementId],
        )
        newX = result.adjustedX
        newY = result.adjustedY
      }
      engine.schema.operations.updateMaterialLayout(_dragElementId, {
        x: newX,
        y: newY,
      })
    }
  }

  function _onDragEnd(e: MouseEvent): void {
    document.removeEventListener('mousemove', _onDragMove)
    document.removeEventListener('mouseup', _onDragEnd)

    if (!isDragging.value) {
      return
    }
    isDragging.value = false
    snapping?.clearSnap()

    const dx = _pxToUnit(e.clientX - _startMouseX)
    const dy = _pxToUnit(e.clientY - _startMouseY)
    if (dx === 0 && dy === 0) {
      return
    }

    if (_isMultiDrag) {
      // Final snapped positions
      let adjustedDx = dx
      let adjustedDy = dy
      if (snapping && _multiDragStarts.length > 0) {
        const bounds = _getMultiBounds(_multiDragStarts)
        const result = snapping.calculateSnap(
          '',
          bounds.x + dx,
          bounds.y + dy,
          bounds.width,
          bounds.height,
          _multiDragStarts.map(s => s.id),
        )
        adjustedDx = result.adjustedX - bounds.x
        adjustedDy = result.adjustedY - bounds.y
      }
      // Revert all live changes
      for (const start of _multiDragStarts) {
        engine.schema.operations.updateMaterialLayout(start.id, {
          x: start.x,
          y: start.y,
        })
      }
      // Execute as transaction
      engine.commands.beginTransaction('批量移动')
      for (const start of _multiDragStarts) {
        const cmd = createMoveMaterialCommand({
          materialId: start.id,
          newX: start.x + adjustedDx,
          newY: start.y + adjustedDy,
          oldX: start.x,
          oldY: start.y,
        }, engine.operations)
        engine.execute(cmd)
      }
      engine.commands.commitTransaction()
    }
    else {
      // Single element: compute final snapped position
      let newX = _startElX + dx
      let newY = _startElY + dy
      if (snapping) {
        const result = snapping.calculateSnap(
          _dragElementId,
          newX,
          newY,
          _startElW,
          _startElH,
          [_dragElementId],
        )
        newX = result.adjustedX
        newY = result.adjustedY
      }

      // Revert live changes
      engine.schema.operations.updateMaterialLayout(_dragElementId, {
        x: _startElX,
        y: _startElY,
      })

      if (newX === _startElX && newY === _startElY) {
        return
      }

      const cmd = createMoveMaterialCommand({
        materialId: _dragElementId,
        newX,
        newY,
        oldX: _startElX,
        oldY: _startElY,
      }, engine.operations)
      engine.execute(cmd)
    }
  }

  // ── Resize ──

  function startResize(materialId: string, handle: ResizeHandlePosition, e: MouseEvent): void {
    const el = engine.schema.getMaterialById(materialId)
    if (!el || el.locked) {
      return
    }

    _dragElementId = materialId
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
    engine.schema.operations.updateMaterialLayout(_dragElementId, r)
  }

  function _onResizeEnd(e: MouseEvent): void {
    document.removeEventListener('mousemove', _onResizeMove)
    document.removeEventListener('mouseup', _onResizeEnd)

    if (!isResizing.value) {
      return
    }
    isResizing.value = false
    activeHandle.value = null
    snapping?.clearSnap()

    const r = _computeResize(e)
    const noChange = r.x === _startElX && r.y === _startElY
      && r.width === _startElW && r.height === _startElH
    if (noChange) {
      return
    }

    // 撤销实时变更，用 Command 重做
    engine.schema.operations.updateMaterialLayout(_dragElementId, {
      height: _startElH,
      width: _startElW,
      x: _startElX,
      y: _startElY,
    })

    // 如果位置改了需要 move + resize，用 batch
    if (r.x !== _startElX || r.y !== _startElY) {
      const moveCmd = createMoveMaterialCommand({
        materialId: _dragElementId,
        newX: r.x,
        newY: r.y,
        oldX: _startElX,
        oldY: _startElY,
      }, engine.operations)
      engine.execute(moveCmd)
    }

    const resizeCmd = createResizeMaterialCommand({
      materialId: _dragElementId,
      newHeight: r.height,
      newWidth: r.width,
      oldHeight: _startElH,
      oldWidth: _startElW,
    }, engine.operations)
    engine.execute(resizeCmd)
  }

  // ── Rotate ──

  let _rotateElementId = ''
  let _origRotation = 0
  let _startAngle = 0
  let _rotateCenterX = 0
  let _rotateCenterY = 0

  function startRotate(materialId: string, e: MouseEvent, centerScreenX: number, centerScreenY: number): void {
    const el = engine.schema.getMaterialById(materialId)
    if (!el || el.locked) {
      return
    }

    _rotateElementId = materialId
    _origRotation = el.layout.rotation ?? 0
    _rotateCenterX = centerScreenX
    _rotateCenterY = centerScreenY
    _startAngle = Math.atan2(
      e.clientY - centerScreenY,
      e.clientX - centerScreenX,
    ) * 180 / Math.PI

    isRotating.value = true
    document.addEventListener('mousemove', _onRotateMove)
    document.addEventListener('mouseup', _onRotateEnd)
  }

  function _onRotateMove(e: MouseEvent): void {
    if (!isRotating.value) {
      return
    }

    const currentAngle = Math.atan2(
      e.clientY - _rotateCenterY,
      e.clientX - _rotateCenterX,
    ) * 180 / Math.PI

    const delta = currentAngle - _startAngle
    let newRotation = _origRotation + delta

    // Normalize to 0-360
    newRotation = ((newRotation % 360) + 360) % 360

    // Shift key: snap to 15 degree increments
    if (e.shiftKey) {
      newRotation = Math.round(newRotation / 15) * 15
    }

    engine.schema.operations.updateMaterialLayout(_rotateElementId, {
      rotation: newRotation,
    })
  }

  function _onRotateEnd(e: MouseEvent): void {
    document.removeEventListener('mousemove', _onRotateMove)
    document.removeEventListener('mouseup', _onRotateEnd)

    if (!isRotating.value) {
      return
    }
    isRotating.value = false

    const currentAngle = Math.atan2(
      e.clientY - _rotateCenterY,
      e.clientX - _rotateCenterX,
    ) * 180 / Math.PI

    const delta = currentAngle - _startAngle
    let newRotation = _origRotation + delta
    newRotation = ((newRotation % 360) + 360) % 360

    if (e.shiftKey) {
      newRotation = Math.round(newRotation / 15) * 15
    }

    if (newRotation === _origRotation) {
      return
    }

    // Revert live change
    engine.schema.operations.updateMaterialLayout(_rotateElementId, {
      rotation: _origRotation,
    })

    const cmd = createRotateMaterialCommand({
      materialId: _rotateElementId,
      newRotation,
      oldRotation: _origRotation,
    }, engine.operations)
    engine.execute(cmd)
  }

  // ── Helpers ──

  function _getMultiBounds(starts: typeof _multiDragStarts) {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const s of starts) {
      if (s.x < minX) {
        minX = s.x
      }
      if (s.y < minY) {
        minY = s.y
      }
      if (s.x + s.width > maxX) {
        maxX = s.x + s.width
      }
      if (s.y + s.height > maxY) {
        maxY = s.y + s.height
      }
    }
    return { height: maxY - minY, width: maxX - minX, x: minX, y: minY }
  }

  return { activeHandle, isDragging, isResizing, isRotating, startDrag, startResize, startRotate }
}
