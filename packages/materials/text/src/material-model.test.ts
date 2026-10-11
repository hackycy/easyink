import { describe, expect, it } from 'vitest'
import { text as designerText } from './designer-material'
import { textModel } from './material-model'
import { TEXT_CONDITION } from './schema'
import { text as viewerText } from './viewer-material'

describe('text material model', () => {
  it('owns the binding and condition shared by both host declarations', () => {
    expect(textModel.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'content',
      formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' },
    })
    expect(textModel.condition).toBe(TEXT_CONDITION)
    expect(designerText.model).toBe(textModel)
    expect(viewerText.model).toBe(textModel)
  })
})
