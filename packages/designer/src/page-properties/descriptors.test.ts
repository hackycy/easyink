import type { DocumentSchema, PageSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { PAGE_PROPERTY_DESCRIPTORS } from './descriptors'
import { filterVisible } from './resolve'

describe('page background descriptors', () => {
  it('hides background size and offset fields in full repeat mode', () => {
    const visible = visibleDescriptorIds({
      background: {
        image: 'https://example.com/bg.png',
        repeat: 'full',
      },
    })

    expect(visible).toContain('bgImage')
    expect(visible).toContain('bgRepeat')
    expect(visible).not.toContain('bgWidth')
    expect(visible).not.toContain('bgHeight')
    expect(visible).not.toContain('bgOffsetX')
    expect(visible).not.toContain('bgOffsetY')
  })

  it('shows background size and offset fields for tiled or positioned images', () => {
    const visible = visibleDescriptorIds({
      background: {
        image: 'https://example.com/bg.png',
        repeat: 'repeat',
      },
    })

    expect(visible).toContain('bgWidth')
    expect(visible).toContain('bgHeight')
    expect(visible).toContain('bgOffsetX')
    expect(visible).toContain('bgOffsetY')
  })

  it('allows background width and height to be cleared outside full repeat mode', () => {
    const document = makeDocument({
      background: {
        image: 'https://example.com/bg.png',
        repeat: 'repeat',
        width: 120,
        height: 80,
      },
    })

    const widthDescriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'bgWidth')
    const heightDescriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'bgHeight')

    expect(widthDescriptor?.nullable).toBe(true)
    expect(heightDescriptor?.nullable).toBe(true)

    const widthPatch = widthDescriptor?.normalize?.(null, { document })
    const heightPatch = heightDescriptor?.normalize?.('', { document })

    expect(widthPatch?.page?.background).toEqual({
      image: 'https://example.com/bg.png',
      repeat: 'repeat',
      height: 80,
    })
    expect(heightPatch?.page?.background).toEqual({
      image: 'https://example.com/bg.png',
      repeat: 'repeat',
      width: 120,
    })
  })
})

function visibleDescriptorIds(pagePatch: Partial<PageSchema>) {
  const document = makeDocument(pagePatch)
  return filterVisible(PAGE_PROPERTY_DESCRIPTORS, {
    document,
  }).map(descriptor => descriptor.id)
}

function makeDocument(pagePatch: Partial<PageSchema>): DocumentSchema {
  const page: PageSchema = {
    mode: 'fixed',
    width: 210,
    height: 297,
    ...pagePatch,
  }
  return {
    version: '1',
    unit: 'mm',
    page,
    guides: { x: [], y: [] },
    elements: [],
  }
}
