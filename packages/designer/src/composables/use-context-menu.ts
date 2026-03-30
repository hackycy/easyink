import type { EasyInkEngine, ElementNode } from '@easyink/core'
import type { useSelection } from './use-selection'
import {
  createAddElementCommand,
  createReorderElementCommand,
  createToggleLockCommand,
} from '@easyink/core'
import { cloneDeep, generateId } from '@easyink/shared'
import { ref } from 'vue'

export interface ContextMenuItem {
  key: string
  label: string
  disabled?: boolean
  divider?: boolean
  action: () => void
}

export function useContextMenu(
  engine: EasyInkEngine,
  selection: ReturnType<typeof useSelection>,
  removeSelected: () => void,
) {
  const visible = ref(false)
  const x = ref(0)
  const y = ref(0)
  const items = ref<ContextMenuItem[]>([])

  let _clipboard: ElementNode[] = []

  function _copySelected(): void {
    const elements = selection.selectedElements.value
    if (elements.length === 0) {
      return
    }
    _clipboard = elements.map(el => cloneDeep(el))
  }

  function _paste(): void {
    if (_clipboard.length === 0) {
      return
    }
    if (_clipboard.length === 1) {
      const cloned: ElementNode = cloneDeep(_clipboard[0])
      cloned.id = generateId()
      if (cloned.layout.x != null) {
        cloned.layout.x += 5
      }
      if (cloned.layout.y != null) {
        cloned.layout.y += 5
      }
      const cmd = createAddElementCommand(
        { element: cloned, index: -1 },
        engine.operations,
      )
      engine.execute(cmd)
      selection.select(cloned.id)
    }
    else {
      const newIds: string[] = []
      engine.commands.beginTransaction('粘贴')
      for (const el of _clipboard) {
        const cloned: ElementNode = cloneDeep(el)
        cloned.id = generateId()
        if (cloned.layout.x != null) {
          cloned.layout.x += 5
        }
        if (cloned.layout.y != null) {
          cloned.layout.y += 5
        }
        const cmd = createAddElementCommand(
          { element: cloned, index: -1 },
          engine.operations,
        )
        engine.execute(cmd)
        newIds.push(cloned.id)
      }
      engine.commands.commitTransaction()
      selection.selectMany(newIds)
    }
  }

  function _buildItems(_elementId?: string): ContextMenuItem[] {
    const ids = selection.selectedIds.value
    const isSingle = ids.length === 1
    const isMulti = ids.length > 1
    const elements = engine.schema.schema.elements
    const result: ContextMenuItem[] = []

    if (isSingle) {
      const el = selection.selectedElement.value!
      // 复制
      result.push({
        action: _copySelected,
        key: 'copy',
        label: 'contextMenu.copy',
      })
      // 粘贴
      result.push({
        action: _paste,
        disabled: _clipboard.length === 0,
        key: 'paste',
        label: 'contextMenu.paste',
      })
      // 删除
      result.push({
        action: removeSelected,
        key: 'delete',
        label: 'contextMenu.delete',
      })
      // 分隔线
      result.push({ action: () => {}, divider: true, key: 'div1', label: '' })
      // 层级操作
      const currentIndex = elements.indexOf(el)
      const maxIndex = elements.length - 1
      result.push({
        action: () => _reorder(el.id, currentIndex, maxIndex),
        disabled: currentIndex === maxIndex,
        key: 'bringToFront',
        label: 'contextMenu.bringToFront',
      })
      result.push({
        action: () => _reorder(el.id, currentIndex, 0),
        disabled: currentIndex === 0,
        key: 'sendToBack',
        label: 'contextMenu.sendToBack',
      })
      result.push({
        action: () => _reorder(el.id, currentIndex, Math.min(currentIndex + 1, maxIndex)),
        disabled: currentIndex === maxIndex,
        key: 'bringForward',
        label: 'contextMenu.bringForward',
      })
      result.push({
        action: () => _reorder(el.id, currentIndex, Math.max(currentIndex - 1, 0)),
        disabled: currentIndex === 0,
        key: 'sendBackward',
        label: 'contextMenu.sendBackward',
      })
      // 分隔线
      result.push({ action: () => {}, divider: true, key: 'div2', label: '' })
      // 锁定/解锁
      result.push({
        action: () => _toggleLock(el),
        key: 'lock',
        label: el.locked ? 'contextMenu.unlock' : 'contextMenu.lock',
      })
    }
    else if (isMulti) {
      // 删除
      result.push({
        action: removeSelected,
        key: 'delete',
        label: 'contextMenu.delete',
      })
      // 分隔线
      result.push({ action: () => {}, divider: true, key: 'div1', label: '' })
      // 复制
      result.push({
        action: _copySelected,
        key: 'copy',
        label: 'contextMenu.copy',
      })
      // 锁定/解锁
      const anyLocked = selection.selectedElements.value.some(el => el.locked)
      result.push({
        action: () => _toggleLockAll(!anyLocked),
        key: 'lock',
        label: anyLocked ? 'contextMenu.unlock' : 'contextMenu.lock',
      })
    }
    else {
      // 空白区域右键 — 只有粘贴
      result.push({
        action: _paste,
        disabled: _clipboard.length === 0,
        key: 'paste',
        label: 'contextMenu.paste',
      })
    }

    return result
  }

  function _reorder(elementId: string, oldIndex: number, newIndex: number): void {
    if (oldIndex === newIndex) {
      return
    }
    const cmd = createReorderElementCommand(
      { elementId, newIndex, oldIndex },
      engine.operations,
    )
    engine.execute(cmd)
  }

  function _toggleLock(el: ElementNode): void {
    const cmd = createToggleLockCommand(
      { elementId: el.id, newLocked: !el.locked, oldLocked: !!el.locked },
      engine.operations,
    )
    engine.execute(cmd)
  }

  function _toggleLockAll(locked: boolean): void {
    engine.commands.beginTransaction(locked ? '批量锁定' : '批量解锁')
    for (const el of selection.selectedElements.value) {
      if (!!el.locked !== locked) {
        const cmd = createToggleLockCommand(
          { elementId: el.id, newLocked: locked, oldLocked: !!el.locked },
          engine.operations,
        )
        engine.execute(cmd)
      }
    }
    engine.commands.commitTransaction()
  }

  function show(e: MouseEvent, elementId?: string): void {
    e.preventDefault()
    e.stopPropagation()

    // If right-clicking on an unselected element, select it first
    if (elementId && !selection.isSelected(elementId)) {
      selection.select(elementId)
    }

    x.value = e.clientX
    y.value = e.clientY
    items.value = _buildItems(elementId)
    visible.value = true
  }

  function hide(): void {
    visible.value = false
    items.value = []
  }

  return {
    hide,
    items,
    show,
    visible,
    x,
    y,
  }
}
