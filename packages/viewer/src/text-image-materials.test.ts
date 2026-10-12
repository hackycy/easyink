import type { DeepReadonly } from '@easyink/plugin-api'
import type { ViewerContext, ViewerMaterial } from '@easyink/plugin-api/viewer'
import type { MaterialNode } from '@easyink/schema'
import { createImageNode, image } from '@easyink/material-image/viewer'
import { createTextNode, text } from '@easyink/material-text/viewer'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { createViewer } from './index'

const unknown: MaterialNode = { id: 'unknown', type: 'vendor/uninstalled', x: 0, y: 0, width: 10, height: 5, props: { opaque: { keep: true } }, extensions: { vendor: 'preserved' } }

describe('complete text and image Viewer consumption', () => {
  it('projects bindings and conditions while preserving unknown nodes with visible diagnostics', async () => {
    const container = document.createElement('div')
    const viewer = await createViewer({ container, materials: [text, image] })
    const schema = normalizeDocumentSchema({ elements: [
      createTextNode({ id: 'title', binding: { sourceId: 'customer', fieldPath: 'customer/name' } }),
      createImageNode({ id: 'logo', binding: { sourceId: 'customer', fieldPath: 'customer/logo' } }),
      createImageNode({ id: 'hidden', renderCondition: { whenMatched: 'show', whenHidden: 'remove', groups: [{ conditions: [{ source: { path: 'absent' }, operator: { compare: 'exists' } }] }] } }),
      unknown,
    ] })
    const before = JSON.stringify(schema)
    try {
      await viewer.open({ schema, data: { customer: { name: 'Ada', logo: 'https://example.test/logo.png' } } })
      expect(container.textContent).toContain('Ada')
      expect(container.querySelector('[data-element-id="logo"] [data-resource-placeholder="image"]')).not.toBeNull()
      expect(container.querySelector('[data-element-id="hidden"]')).toBeNull()
      expect(container.textContent).toContain('[Unknown: vendor/uninstalled]')
      const result = await viewer.render()
      if (result.status !== 'completed')
        throw new Error('Expected completed render')
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_MATERIAL', scope: 'material', nodeId: 'unknown' }))
      expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'IMAGE_LOAD_FAILED', nodeId: 'logo' }))
      expect(JSON.stringify(schema)).toBe(before)
    }
    finally {
      await viewer.destroy()
    }
  })

  it('uses a replacement renderer with the unchanged shared binding model', async () => {
    const render = vi.fn((_node: DeepReadonly<MaterialNode>, ctx: ViewerContext) => {
      const element = ctx.document.createElement('span')
      element.textContent = `Custom: ${ctx.resolvedProps.content}`
      return { element }
    })
    const container = document.createElement('div')
    const viewer = await createViewer({ container, materials: [{ model: text.model, renderer: { render } }] })
    try {
      await viewer.open({ schema: normalizeDocumentSchema({ elements: [createTextNode({ binding: { sourceId: 'customer', fieldPath: 'customer/name' } })] }), data: { customer: { name: 'Ada' } } })
      expect(container.textContent).toContain('Custom: Ada')
      expect(render).toHaveBeenCalledOnce()
    }
    finally {
      await viewer.destroy()
    }
  })

  it('rejects a selected material with no renderer before opening a document', async () => {
    await expect(createViewer({ materials: [{ model: text.model }] as ViewerMaterial[] })).rejects.toMatchObject({ cause: { code: 'invalid-material' } })
  })

  it('degrades a declared lazy failure locally, keeps other nodes and retries', async () => {
    const close = vi.fn()
    let attempts = 0
    const container = document.createElement('div')
    const viewer = await createViewer({ container, materials: [text, {
      model: image.model,
      loadRenderer: async (resources) => {
        resources.onDispose(close)
        if (++attempts === 1)
          throw new Error('network unavailable')
        return image.renderer!
      },
    }] })
    try {
      const diagnostics: { code: string, nodeId?: string }[] = []
      await viewer.open({ schema: normalizeDocumentSchema({ elements: [createTextNode({ props: { content: 'Still visible' } }), createImageNode({ id: 'logo', props: { src: 'https://example.test/logo.png' } }), unknown] }), onDiagnostic: event => diagnostics.push(event) })
      expect(close).toHaveBeenCalledOnce()
      expect(container.textContent).toContain('Still visible')
      expect(container.textContent).toContain('[Unavailable: image]')
      expect(container.textContent).toContain('[Unknown: vendor/uninstalled]')
      expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_LOAD_ERROR', nodeId: 'logo' }))
      expect(diagnostics).toContainEqual(expect.objectContaining({ code: 'UNKNOWN_MATERIAL', nodeId: 'unknown' }))
      const result = await viewer.render()
      if (result.status !== 'completed')
        throw new Error('Expected completed render')
      expect(attempts).toBe(2)
      expect(container.querySelector('[data-element-id="logo"] [data-resource-placeholder="image"]')).not.toBeNull()
      expect(result.diagnostics.some(diagnostic => diagnostic.code === 'MATERIAL_LOAD_ERROR')).toBe(false)
    }
    finally {
      await viewer.destroy()
    }
    expect(close).toHaveBeenCalledTimes(2)
  })
})
