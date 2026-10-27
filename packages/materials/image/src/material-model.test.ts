import { describe, expect, it } from 'vitest'
import { image as designerImage } from './designer-material'
import { imageModel } from './material-model'
import { createImageNode, IMAGE_CONDITION, IMAGE_DEFAULTS } from './schema'
import { image as viewerImage } from './viewer-material'

describe('image material model', () => {
  it('owns the binding and condition shared by both host declarations', () => {
    expect(imageModel.binding).toEqual({
      kind: 'ordinary',
      primaryProp: 'src',
      formatEditor: { tabs: ['preset', 'custom'], defaultTab: 'preset' },
    })
    expect(imageModel.condition).toBe(IMAGE_CONDITION)
    expect(designerImage.model).toBe(imageModel)
    expect(viewerImage.model).toBe(imageModel)
  })

  it('preserves default nodes and the frozen partial-props replacement behavior', () => {
    expect(createImageNode().props).toEqual(IMAGE_DEFAULTS)
    const props = { src: 'https://example.test/logo.png' }
    expect(createImageNode({ props }).props).toBe(props)
    expect(createImageNode({ props }).props).toEqual(props)
  })
})
