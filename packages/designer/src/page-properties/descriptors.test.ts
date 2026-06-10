import type { DocumentSchema, PageSchema, TextWatermarkPageLayerConfig } from '@easyink/schema'
import { PAPER_PRESETS } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import { createPagePropertyDescriptors } from './descriptors'
import { filterVisible } from './resolve'

const PAGE_PROPERTY_DESCRIPTORS = createPagePropertyDescriptors(PAPER_PRESETS)

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

describe('page paper descriptors', () => {
  it('keeps pageModel paper in sync when width and height are edited', () => {
    const document = makeDocument({
      width: 80,
      height: 120,
      pageModel: {
        kind: 'paged-paper',
        paper: { width: 80, height: 120 },
      },
    })

    const widthDescriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'width')
    const heightDescriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'height')

    const widthPatch = widthDescriptor?.normalize?.(90, { document })
    const heightPatch = heightDescriptor?.normalize?.(150, { document })

    expect(widthPatch?.page).toMatchObject({
      width: 90,
      pageModel: { kind: 'paged-paper', paper: { width: 90, height: 120 } },
    })
    expect(heightPatch?.page).toMatchObject({
      height: 150,
      pageModel: { kind: 'paged-paper', paper: { width: 80, height: 150 } },
    })
  })

  it('keeps pageModel paper in sync when selecting a preset', () => {
    const document = makeDocument({
      width: 80,
      height: 120,
      pageModel: {
        kind: 'paged-paper',
        paper: { width: 80, height: 120 },
      },
    })

    const descriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'paperPreset')
    const patch = descriptor?.normalize?.('A4', { document })

    expect(patch?.page).toMatchObject({
      width: 210,
      height: 297,
      pageModel: { kind: 'paged-paper', paper: { width: 210, height: 297 } },
    })
  })

  it('uses injected paper presets when selecting a preset', () => {
    const document = makeDocument({
      width: 80,
      height: 120,
      pageModel: {
        kind: 'paged-paper',
        paper: { width: 80, height: 120 },
      },
    })

    const descriptors = createPagePropertyDescriptors([
      { name: 'Enterprise Label', width: 76, height: 42 },
    ])
    const descriptor = descriptors.find(descriptor => descriptor.id === 'paperPreset')
    const patch = descriptor?.normalize?.('Enterprise Label', { document })

    expect(descriptor?.enum).toEqual([
      { label: 'Enterprise Label', value: 'Enterprise Label' },
      { label: 'designer.page.custom', value: 'custom' },
    ])
    expect(patch?.page).toMatchObject({
      width: 76,
      height: 42,
      pageModel: { kind: 'paged-paper', paper: { width: 76, height: 42 } },
    })
  })
})

describe('page watermark descriptors', () => {
  it('only shows text watermark details after enabling watermark', () => {
    const disabledVisible = visibleDescriptorIds({})
    expect(disabledVisible).toContain('watermarkEnabled')
    expect(disabledVisible).not.toContain('watermarkText')
    expect(disabledVisible).not.toContain('watermarkOpacity')

    const enabledVisible = visibleDescriptorIds({
      layers: [textWatermarkLayer({
        enabled: true,
        text: 'DRAFT',
      })],
    })
    expect(enabledVisible).toContain('watermarkText')
    expect(enabledVisible).toContain('watermarkRotation')
    expect(enabledVisible).toContain('watermarkOpacity')
    expect(enabledVisible).toContain('watermarkFontSize')
    expect(enabledVisible).toContain('watermarkGap')
    expect(enabledVisible).toContain('watermarkColor')
  })

  it('creates a typed text watermark when enabling from an empty page', () => {
    const document = makeDocument({})
    const descriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'watermarkEnabled')
    const patch = descriptor?.normalize?.(true, { document })

    expect(patch?.page?.layers).toEqual([{
      id: 'page-watermark',
      kind: 'watermark',
      type: 'text',
      enabled: true,
      placement: 'over-content',
      zIndex: 0,
      text: '',
      rotation: -30,
      opacity: 0.1,
      fontSize: 18,
      gap: 60,
      color: '#b8b8b8',
    }])
  })

  it('stores opacity as 0..1 while exposing 0..100 in the editor', () => {
    const document = makeDocument({
      layers: [textWatermarkLayer({
        enabled: true,
        text: 'DRAFT',
        opacity: 0.25,
      })],
    })
    const descriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'watermarkOpacity')

    expect(descriptor?.read?.({ document })).toBe(25)
    expect(descriptor?.normalize?.(10, { document })?.page?.layers?.[0]).toMatchObject({
      id: 'page-watermark',
      kind: 'watermark',
      opacity: 0.1,
    })
  })

  it('keeps existing numeric watermark values when editor input is invalid', () => {
    const document = makeDocument({
      layers: [textWatermarkLayer({
        enabled: true,
        text: 'DRAFT',
        rotation: -45,
        opacity: 0.25,
        fontSize: 24,
        gap: 80,
      })],
    })
    const ctx = { document }
    const rotationDescriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'watermarkRotation')
    const opacityDescriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'watermarkOpacity')
    const fontSizeDescriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'watermarkFontSize')
    const gapDescriptor = PAGE_PROPERTY_DESCRIPTORS.find(descriptor => descriptor.id === 'watermarkGap')

    expect(rotationDescriptor?.normalize?.(Number.NaN, ctx)?.page?.layers?.[0]).toMatchObject({ rotation: -45 })
    expect(opacityDescriptor?.normalize?.('bad-value', ctx)?.page?.layers?.[0]).toMatchObject({ opacity: 0.25 })
    expect(fontSizeDescriptor?.normalize?.(0, ctx)?.page?.layers?.[0]).toMatchObject({ fontSize: 24 })
    expect(gapDescriptor?.normalize?.('', ctx)?.page?.layers?.[0]).toMatchObject({ gap: 80 })
  })
})

function textWatermarkLayer(overrides: Partial<TextWatermarkPageLayerConfig> = {}): TextWatermarkPageLayerConfig {
  return {
    id: 'page-watermark',
    kind: 'watermark',
    type: 'text',
    ...overrides,
  }
}

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
