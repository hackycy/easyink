import type { BackgroundLayer } from '@easyink/shared'
import { describe, expect, it, vi } from 'vitest'
import { BackgroundLayerList } from '../components/BackgroundLayerList'

describe('backgroundLayerList', () => {
  it('is a named component', () => {
    expect(BackgroundLayerList.name).toBe('BackgroundLayerList')
  })

  it('exports setup function', () => {
    expect(typeof BackgroundLayerList.setup).toBe('function')
  })
})

describe('background layer command integration', () => {
  it('createAddBackgroundLayerCommand works correctly', async () => {
    const {
      createAddBackgroundLayerCommand,
    } = await import('@easyink/core')

    const ops = {
      addBackgroundLayer: vi.fn(),
      removeBackgroundLayer: vi.fn(),
    } as any

    const layer: BackgroundLayer = { color: '#ff0000', type: 'color' }
    const cmd = createAddBackgroundLayerCommand({ index: 0, layer }, ops)

    expect(cmd.type).toBe('add-background-layer')
    cmd.execute()
    expect(ops.addBackgroundLayer).toHaveBeenCalledWith(layer, 0)

    cmd.undo()
    expect(ops.removeBackgroundLayer).toHaveBeenCalledWith(0)
  })

  it('createRemoveBackgroundLayerCommand works correctly', async () => {
    const {
      createRemoveBackgroundLayerCommand,
    } = await import('@easyink/core')

    const ops = {
      addBackgroundLayer: vi.fn(),
      removeBackgroundLayer: vi.fn(),
    } as any

    const layer: BackgroundLayer = { color: '#00ff00', type: 'color' }
    const cmd = createRemoveBackgroundLayerCommand({ index: 1, layer }, ops)

    expect(cmd.type).toBe('remove-background-layer')
    cmd.execute()
    expect(ops.removeBackgroundLayer).toHaveBeenCalledWith(1)

    cmd.undo()
    expect(ops.addBackgroundLayer).toHaveBeenCalledWith(layer, 1)
  })

  it('createUpdateBackgroundLayerCommand works correctly', async () => {
    const {
      createUpdateBackgroundLayerCommand,
    } = await import('@easyink/core')

    const ops = {
      updateBackgroundLayer: vi.fn(),
    } as any

    const oldLayer: BackgroundLayer = { color: '#000000', type: 'color' }
    const newLayer: BackgroundLayer = { color: '#ffffff', type: 'color' }
    const cmd = createUpdateBackgroundLayerCommand({ index: 0, newLayer, oldLayer }, ops)

    expect(cmd.type).toBe('update-background-layer')
    cmd.execute()
    expect(ops.updateBackgroundLayer).toHaveBeenCalledWith(0, newLayer)

    cmd.undo()
    expect(ops.updateBackgroundLayer).toHaveBeenCalledWith(0, oldLayer)
  })

  it('createReorderBackgroundLayerCommand works correctly', async () => {
    const {
      createReorderBackgroundLayerCommand,
    } = await import('@easyink/core')

    const ops = {
      reorderBackgroundLayer: vi.fn(),
    } as any

    const cmd = createReorderBackgroundLayerCommand({ fromIndex: 0, toIndex: 2 }, ops)

    expect(cmd.type).toBe('reorder-background-layer')
    cmd.execute()
    expect(ops.reorderBackgroundLayer).toHaveBeenCalledWith(0, 2)

    cmd.undo()
    expect(ops.reorderBackgroundLayer).toHaveBeenCalledWith(2, 0)
  })

  it('color layer default values match expected shape', () => {
    const layer: BackgroundLayer = { color: '#ffffff', type: 'color' }
    expect(layer.type).toBe('color')
    expect(layer.opacity).toBeUndefined()
    expect(layer.enabled).toBeUndefined()
  })

  it('image layer default values match expected shape', () => {
    const layer: BackgroundLayer = { type: 'image', url: '' }
    expect(layer.type).toBe('image')
    expect(layer.opacity).toBeUndefined()
    expect(layer.enabled).toBeUndefined()
    expect(layer.size).toBeUndefined()
    expect(layer.repeat).toBeUndefined()
    expect(layer.position).toBeUndefined()
  })

  it('image layer with all options', () => {
    const layer: BackgroundLayer = {
      enabled: true,
      opacity: 0.8,
      position: 'top-left',
      repeat: 'no-repeat',
      size: 'cover',
      type: 'image',
      url: 'https://example.com/bg.png',
    }
    expect(layer.type).toBe('image')
    expect(layer.opacity).toBe(0.8)
    expect(layer.position).toBe('top-left')
  })

  it('enabled false disables layer', () => {
    const layer: BackgroundLayer = { color: '#000', enabled: false, type: 'color' }
    expect(layer.enabled).toBe(false)
  })
})
