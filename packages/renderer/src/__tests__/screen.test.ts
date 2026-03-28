import { createDefaultSchema } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { ScreenRenderer } from '../screen'

describe('screenRenderer', () => {
  it('should have name "screen"', () => {
    const renderer = new ScreenRenderer()
    expect(renderer.name).toBe('screen')
  })

  it('should default zoom to 1', () => {
    const renderer = new ScreenRenderer()
    expect(renderer.zoom).toBe(1)
  })

  it('should accept zoom option', () => {
    const renderer = new ScreenRenderer({ zoom: 2 })
    expect(renderer.zoom).toBe(2)
  })

  it('should update zoom', () => {
    const renderer = new ScreenRenderer()
    renderer.zoom = 1.5
    expect(renderer.zoom).toBe(1.5)
  })

  it('should expose domRenderer', () => {
    const renderer = new ScreenRenderer()
    expect(renderer.domRenderer).toBeTruthy()
    expect(renderer.domRenderer.registry.has('text')).toBe(true)
  })

  it('should render schema to container', () => {
    const renderer = new ScreenRenderer()
    const container = document.createElement('div')
    const result = renderer.render(createDefaultSchema(), {}, container)
    expect(result.page).toBeTruthy()
    expect(container.children.length).toBe(1)
  })

  it('should destroy and clean up', () => {
    const renderer = new ScreenRenderer()
    const container = document.createElement('div')
    renderer.render(createDefaultSchema(), {}, container)
    renderer.destroy()
    expect(container.children.length).toBe(0)
  })
})
