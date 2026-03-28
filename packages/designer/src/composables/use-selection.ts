import type { EasyInkEngine, ElementNode } from '@easyink/core'
import { computed, ref } from 'vue'

export function useSelection(engine: EasyInkEngine) {
  const selectedIds = ref<string[]>([])

  const selectedElement = computed<ElementNode | undefined>(() => {
    if (selectedIds.value.length === 0) {
      return undefined
    }
    return engine.schema.getElementById(selectedIds.value[0])
  })

  const selectedElements = computed<ElementNode[]>(() => {
    return selectedIds.value
      .map(id => engine.schema.getElementById(id))
      .filter((el): el is ElementNode => el !== undefined)
  })

  const selectionBounds = computed<{ height: number, width: number, x: number, y: number } | null>(() => {
    const els = selectedElements.value
    if (els.length === 0) {
      return null
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity

    for (const el of els) {
      const x = el.layout.x ?? 0
      const y = el.layout.y ?? 0
      const w = typeof el.layout.width === 'number' ? el.layout.width : 0
      const h = typeof el.layout.height === 'number' ? el.layout.height : 0
      if (x < minX) {
        minX = x
      }
      if (y < minY) {
        minY = y
      }
      if (x + w > maxX) {
        maxX = x + w
      }
      if (y + h > maxY) {
        maxY = y + h
      }
    }

    return {
      height: maxY - minY,
      width: maxX - minX,
      x: minX,
      y: minY,
    }
  })

  function select(id: string): void {
    selectedIds.value = [id]
    engine.hooks.selectionChanged.emit([id])
  }

  function deselect(): void {
    selectedIds.value = []
    engine.hooks.selectionChanged.emit([])
  }

  function isSelected(id: string): boolean {
    return selectedIds.value.includes(id)
  }

  function toggleSelect(id: string): void {
    const ids = selectedIds.value.slice()
    const idx = ids.indexOf(id)
    if (idx >= 0) {
      ids.splice(idx, 1)
    }
    else {
      ids.push(id)
    }
    selectedIds.value = ids
    engine.hooks.selectionChanged.emit(ids)
  }

  function selectMany(ids: string[]): void {
    selectedIds.value = ids
    engine.hooks.selectionChanged.emit(ids)
  }

  function selectAll(): void {
    const ids = engine.schema.schema.elements
      .filter(el => !el.hidden && !el.locked)
      .map(el => el.id)
    selectedIds.value = ids
    engine.hooks.selectionChanged.emit(ids)
  }

  return {
    deselect,
    isSelected,
    select,
    selectAll,
    selectMany,
    selectedElement,
    selectedElements,
    selectedIds,
    selectionBounds,
    toggleSelect,
  }
}
