import { describe, expect, it } from 'vitest'
import { resolveHistoryOperationLabel } from './history-label'

describe('resolveHistoryOperationLabel', () => {
  it.each([
    ['geometry.move', 'designer.history.updateGeometry'],
    ['clipboard.duplicate', 'designer.history.addMaterial'],
    ['property.binding.update', 'designer.history.bindField'],
    ['assistant.apply', 'designer.history.updateDocument'],
    ['context.ungroup', 'designer.history.removeElementGroup'],
    ['context.layer-up', 'designer.history.updateGeometry'],
    ['toolbar.rotate', 'designer.history.updateDocument'],
    ['keyboard.nudge', 'designer.history.updateGeometry'],
    ['property.image', 'designer.history.updateProps'],
    ['material.editor-state', 'designer.history.updateMeta'],
    ['template.clear', 'designer.history.importTemplate'],
    ['extension.set', 'designer.history.updateDocument'],
  ])('maps %s to %s', (kind, label) => {
    expect(resolveHistoryOperationLabel(kind)).toBe(label)
  })

  it('falls back for unknown extension kinds', () => {
    expect(resolveHistoryOperationLabel('vendor.extension.action')).toBeUndefined()
  })
})
