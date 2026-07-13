import { describe, expect, it } from 'vitest'
import { resolveHistoryOperationLabel } from './history-label'

describe('resolveHistoryOperationLabel', () => {
  it.each([
    ['geometry.move', 'designer.history.updateGeometry'],
    ['clipboard.duplicate', 'designer.history.addMaterial'],
    ['property.binding.update', 'designer.history.bindField'],
    ['assistant.apply', 'designer.history.updateDocument'],
    ['context.ungroup', 'designer.history.removeElementGroup'],
  ])('maps %s to %s', (kind, label) => {
    expect(resolveHistoryOperationLabel(kind)).toBe(label)
  })

  it('falls back for unknown extension kinds', () => {
    expect(resolveHistoryOperationLabel('vendor.extension.action')).toBeUndefined()
  })
})
