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
})

function visibleDescriptorIds(pagePatch: Partial<PageSchema>) {
  const page: PageSchema = {
    mode: 'fixed',
    width: 210,
    height: 297,
    ...pagePatch,
  }
  const document: DocumentSchema = {
    version: '1',
    unit: 'mm',
    page,
    guides: { x: [], y: [] },
    elements: [],
  }
  return filterVisible(PAGE_PROPERTY_DESCRIPTORS, {
    document,
  }).map(descriptor => descriptor.id)
}
