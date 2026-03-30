import type { EasyInkEngine } from '@easyink/core'
import type { GuideLineData } from '../types'
import { generateId } from '@easyink/shared'
import { computed, ref } from 'vue'

export interface GuidePreview {
  orientation: 'horizontal' | 'vertical'
  position: number
}

export function useGuides(engine: EasyInkEngine) {
  const guides = computed<GuideLineData[]>(() => {
    const ext = engine.schema.schema.extensions
    return (ext?.guides as GuideLineData[] | undefined) ?? []
  })

  const previewGuide = ref<GuidePreview | null>(null)

  function setPreview(preview: GuidePreview): void {
    previewGuide.value = preview
  }

  function clearPreview(): void {
    previewGuide.value = null
  }

  function _updateGuides(newGuides: GuideLineData[]): void {
    const oldGuides = guides.value.slice()
    // Create a simple undoable command
    const cmd = {
      description: '更新辅助线',
      execute: () => {
        engine.schema.updateExtensions('guides', newGuides)
      },
      id: generateId(),
      type: 'update-guides',
      undo: () => {
        engine.schema.updateExtensions('guides', oldGuides)
      },
    }
    engine.execute(cmd)
  }

  function addGuide(orientation: 'horizontal' | 'vertical', position: number): void {
    const newGuide: GuideLineData = {
      id: generateId(),
      orientation,
      position,
    }
    _updateGuides([...guides.value, newGuide])
  }

  function removeGuide(id: string): void {
    _updateGuides(guides.value.filter(g => g.id !== id))
  }

  function updateGuidePosition(id: string, position: number): void {
    _updateGuides(guides.value.map(g =>
      g.id === id ? { ...g, position } : g,
    ))
  }

  return { addGuide, clearPreview, guides, previewGuide, removeGuide, setPreview, updateGuidePosition }
}
