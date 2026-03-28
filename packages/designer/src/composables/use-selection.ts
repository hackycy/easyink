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

  return { deselect, isSelected, select, selectedElement, selectedIds }
}
