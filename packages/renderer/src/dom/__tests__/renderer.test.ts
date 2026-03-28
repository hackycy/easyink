import type { TemplateSchema } from '@easyink/core'
import { createDefaultSchema } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { DOMRenderer } from '../renderer'

function createSchema(overrides?: Partial<TemplateSchema>): TemplateSchema {
  return {
    ...createDefaultSchema(),
    ...overrides,
  }
}

function createContainer(): HTMLElement {
  return document.createElement('div')
}

describe('dOMRenderer', () => {
  it('should have name "dom"', () => {
    const renderer = new DOMRenderer()
    expect(renderer.name).toBe('dom')
  })

  it('should render empty schema', () => {
    const renderer = new DOMRenderer()
    const container = createContainer()
    const result = renderer.render(createSchema(), {}, container)

    expect(result.page).toBeTruthy()
    expect(result.page.className).toBe('easyink-page')
    expect(container.children.length).toBe(1)
    expect(result.actualHeight).toBeGreaterThan(0)
  })

  it('should render text element', () => {
    const schema = createSchema({
      elements: [{
        id: 'text-1',
        type: 'text',
        layout: { position: 'absolute', x: 10, y: 10, width: 80, height: 20 },
        props: { content: 'Hello' },
        style: {},
      }],
    })
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(schema, {}, container)

    const textEl = container.querySelector('[data-element-id="text-1"]')
    expect(textEl).not.toBeNull()
    expect(textEl!.textContent).toBe('Hello')
  })

  it('should render text with data binding', () => {
    const schema = createSchema({
      elements: [{
        id: 'text-1',
        type: 'text',
        layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 20 },
        props: { content: '' },
        style: {},
        binding: { path: 'name' },
      }],
    })
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(schema, { name: 'World' }, container)

    const textEl = container.querySelector('[data-element-id="text-1"]')
    expect(textEl!.textContent).toBe('World')
  })

  it('should skip hidden elements', () => {
    const schema = createSchema({
      elements: [
        { id: 'a', type: 'text', layout: { position: 'absolute', x: 0, y: 0, width: 50, height: 20 }, props: { content: 'visible' }, style: {} },
        { id: 'b', type: 'text', layout: { position: 'absolute', x: 0, y: 0, width: 50, height: 20 }, props: { content: 'hidden' }, style: {}, hidden: true },
      ],
    })
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(schema, {}, container)

    expect(container.querySelector('[data-element-id="a"]')).not.toBeNull()
    expect(container.querySelector('[data-element-id="b"]')).toBeNull()
  })

  it('should render unknown element type as placeholder', () => {
    const schema = createSchema({
      elements: [{
        id: 'custom-1',
        type: 'my-custom-type',
        layout: { position: 'absolute', x: 0, y: 0, width: 50, height: 20 },
        props: {},
        style: {},
      }],
    })
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(schema, {}, container)

    const el = container.querySelector('[data-element-id="custom-1"]')
    expect(el).not.toBeNull()
    expect(el!.className).toContain('easyink-unknown')
    expect(el!.textContent).toBe('[my-custom-type]')
  })

  it('should apply element style', () => {
    const schema = createSchema({
      elements: [{
        id: 'rect-1',
        type: 'rect',
        layout: { position: 'absolute', x: 10, y: 10, width: 50, height: 50 },
        props: { fill: 'blue' },
        style: { opacity: 0.5, color: 'white' },
      }],
    })
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(schema, {}, container)

    const el = container.querySelector('[data-element-id="rect-1"]') as HTMLElement
    expect(el.style.opacity).toBe('0.5')
    expect(el.style.color).toBe('white')
  })

  it('should apply rotation transform', () => {
    const schema = createSchema({
      elements: [{
        id: 'r1',
        type: 'rect',
        layout: { position: 'absolute', x: 0, y: 0, width: 50, height: 50, rotation: 45 },
        props: {},
        style: {},
      }],
    })
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(schema, {}, container)

    const el = container.querySelector('[data-element-id="r1"]') as HTMLElement
    expect(el.style.transform).toBe('rotate(45deg)')
  })

  it('should dispose and remove DOM', () => {
    const renderer = new DOMRenderer()
    const container = createContainer()
    const result = renderer.render(createSchema(), {}, container)
    expect(container.children.length).toBe(1)

    result.dispose()
    expect(container.children.length).toBe(0)
  })

  it('should auto-clean previous render on re-render', () => {
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(createSchema(), {}, container)
    expect(container.children.length).toBe(1)

    renderer.render(createSchema(), {}, container)
    // Only new page should be in container (old disposed)
    expect(container.querySelectorAll('.easyink-page').length).toBe(1)
  })

  it('should destroy renderer and clean up', () => {
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(createSchema(), {}, container)
    renderer.destroy()
    expect(container.children.length).toBe(0)
  })

  it('should expose registry for custom renderers', () => {
    const renderer = new DOMRenderer()
    expect(renderer.registry.has('text')).toBe(true)
    expect(renderer.registry.has('rect')).toBe(true)
    expect(renderer.registry.has('table')).toBe(true)

    // Register custom
    renderer.registry.register('custom', () => {
      const el = document.createElement('div')
      el.textContent = 'custom'
      return el
    })
    expect(renderer.registry.has('custom')).toBe(true)
  })

  it('should support zoom', () => {
    const renderer = new DOMRenderer({ zoom: 2 })
    expect(renderer.zoom).toBe(2)
    renderer.zoom = 1.5
    expect(renderer.zoom).toBe(1.5)
  })

  it('should render multiple elements with correct positioning', () => {
    const schema = createSchema({
      elements: [
        { id: 'e1', type: 'text', layout: { position: 'flow', width: 'auto', height: 20 }, props: { content: 'Flow 1' }, style: {} },
        { id: 'e2', type: 'text', layout: { position: 'flow', width: 'auto', height: 20 }, props: { content: 'Flow 2' }, style: {} },
        { id: 'e3', type: 'rect', layout: { position: 'absolute', x: 50, y: 50, width: 30, height: 30 }, props: {}, style: {} },
      ],
    })
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(schema, {}, container)

    expect(container.querySelector('[data-element-id="e1"]')).not.toBeNull()
    expect(container.querySelector('[data-element-id="e2"]')).not.toBeNull()
    expect(container.querySelector('[data-element-id="e3"]')).not.toBeNull()
  })

  it('should render image element', () => {
    const schema = createSchema({
      elements: [{
        id: 'img-1',
        type: 'image',
        layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 100 },
        props: { src: 'https://example.com/photo.jpg', fit: 'cover' },
        style: {},
      }],
    })
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(schema, {}, container)

    const imgWrapper = container.querySelector('[data-element-id="img-1"]')
    expect(imgWrapper).not.toBeNull()
    const img = imgWrapper!.querySelector('img')
    expect(img).not.toBeNull()
  })

  it('should render table element with data', () => {
    const schema = createSchema({
      elements: [{
        id: 'table-1',
        type: 'table',
        layout: { position: 'flow', width: 'auto', height: 'auto' },
        props: {
          columns: [
            { key: 'name', title: 'Name', width: 60, binding: { path: 'items.name' } },
            { key: 'qty', title: 'Qty', width: 40, binding: { path: 'items.qty' } },
          ],
        },
        style: {},
      }],
    })
    const data = { items: [{ name: 'A', qty: 1 }, { name: 'B', qty: 2 }] }
    const renderer = new DOMRenderer()
    const container = createContainer()
    renderer.render(schema, data, container)

    const table = container.querySelector('table')
    expect(table).not.toBeNull()
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)
  })
})
