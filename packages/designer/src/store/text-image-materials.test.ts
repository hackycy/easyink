import { UpdateMaterialPropsCommand } from '@easyink/core'
import { createImageNode, image } from '@easyink/material-image'
import { image as viewerImage } from '@easyink/material-image/viewer'
import { createTextNode, text } from '@easyink/material-text'
import { text as viewerText } from '@easyink/material-text/viewer'
import { describe, expect, it } from 'vitest'
import { DesignerStore } from './designer-store'

describe('complete text and image Designer consumption', () => {
  it('installs palette, properties and locale without extra declarations and retains undo', async () => {
    const store = await DesignerStore.create({
      materials: [image, text],
      schema: { elements: [createTextNode({ id: 'title', props: { content: 'Before' } }), createImageNode({ id: 'logo' })] },
    })
    try {
      expect(text.model).toBe(viewerText.model)
      expect(image.model).toBe(viewerImage.model)
      expect(store.getCatalog().map(item => item.materialType)).toEqual(['text', 'image'])
      for (const material of [text, image]) {
        const definition = store.getMaterial(material.model.type)!
        expect(definition.binding).toEqual(material.model.binding)
        expect(definition.condition).toEqual(material.model.condition)
        expect(definition.props).toEqual(material.properties)
        expect(store.t(`materials.${material.model.type}.name`)).not.toBe(`materials.${material.model.type}.name`)
        expect(store.getDesignerExtension(material.model.type)?.renderContent).toBeTypeOf('function')
      }
      const declarations = store.getMaterialDeclarations()
      expect(declarations.map(material => material.model.type)).toEqual(['image', 'text'])
      store.commands.execute(new UpdateMaterialPropsCommand(store.schema.elements, 'title', { content: 'After' }))
      expect(store.getElementById('title')?.props.content).toBe('After')
      store.commands.undo()
      expect(store.getElementById('title')?.props.content).toBe('Before')
    }
    finally {
      await store.destroy()
    }
  })

  it('keeps the model usable with optional UI, properties and locale omitted', async () => {
    const store = await DesignerStore.create({ materials: [{ model: image.model, renderer: image.renderer! }] })
    try {
      expect(store.getMaterial('image')?.binding).toEqual(image.model.binding)
      expect(store.getCatalog()).toEqual([])
      expect(store.getMaterial('image')?.props).toEqual([])
      expect(store.getDesignerExtension('image')?.renderContent).toBeTypeOf('function')
    }
    finally {
      await store.destroy()
    }
  })
})
