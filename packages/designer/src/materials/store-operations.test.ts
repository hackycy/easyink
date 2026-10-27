import type { DataSourceDescriptor } from '@easyink/datasource'
import type { DesignerMaterial, DesignerRendererContext } from '@easyink/plugin-api/designer'
import type { DesignerInteractionProvider } from '../types'
import { UpdateMaterialPropsCommand } from '@easyink/core'
import { describe, expect, it, vi } from 'vitest'
import { DesignerStore } from '../store/designer-store'

async function fixture(label: string, interactionProvider?: DesignerInteractionProvider) {
  const node = { id: 'node', type: 'shared', x: 0, y: 0, width: 10, height: 10, props: { label } }
  let context!: DesignerRendererContext
  const material: DesignerMaterial = {
    model: { type: 'shared', binding: { kind: 'none' }, createDefaultNode: () => ({ ...node, props: { label } }) },
    locale: { messages: { fixture: { label } } },
    renderer: (ctx) => {
      context = ctx
      expect(ctx.t('fixture.label')).toBe(label)
      expect(ctx.getMaterials().map(entry => entry.model.type)).toEqual(['shared'])
      return { renderContent: () => () => {} }
    },
  }
  const store = await DesignerStore.create({ schema: { elements: [node] }, materials: [material], interactionProvider })
  return { store, context }
}

describe('actual Store operations in a controlled material context', () => {
  it('isolates two actual Stores and Host locales while transactions retain undo', async () => {
    const a = await fixture('a')
    const b = await fixture('b')
    try {
      a.store.selection.add('node')
      const selection = a.context.getSelection()
      expect(selection.ids).toEqual(['node'])
      expect(Object.isFrozen(selection.ids)).toBe(true)
      expect(b.context.getSelection().ids).toEqual([])
      expect(a.context.t('fixture.label')).toBe('a')
      expect(b.context.t('fixture.label')).toBe('b')
      expect(a.context.getMaterials().map(entry => entry.model.type)).toEqual(['shared'])
      const before = a.context.getNode('node')
      a.context.tx.run('node', draft => draft.props.label = 'edited')
      expect(a.store.schema.elements[0].props.label).toBe('edited')
      expect(before?.props.label).toBe('a')
      expect(b.store.schema.elements[0].props.label).toBe('b')
      a.store.commands.undo()
      expect(a.store.schema.elements[0].props.label).toBe('a')
      expect('store' in a.context).toBe(false)
      await a.store.destroy()
      expect(() => a.context.getSchema()).toThrow(/disposed/)
      expect(b.context.getNode('node')?.props.label).toBe('b')
    }
    finally {
      await a.store.destroy()
      await b.store.destroy()
    }
  })

  it('routes commands, document replacement and independent data sources through the actual Store', async () => {
    const f = await fixture('before')
    try {
      f.context.commitCommand(new UpdateMaterialPropsCommand(f.store.schema.elements, 'node', { label: 'command' }))
      expect(f.store.schema.elements[0].props.label).toBe('command')
      expect(f.store.workbench.status.draft).toBe('modified')
      f.store.selection.add('node')
      const source: DataSourceDescriptor = { id: 'source', name: 'Source', fields: [{ name: 'Field', path: 'field' }] }
      f.context.registerDataSource(source)
      source.fields[0].name = 'caller mutation'
      expect(f.context.getDataSources()[0].fields[0].name).toBe('Field')
      expect(Object.isFrozen(f.context.getDataSources()[0].fields)).toBe(true)
      const input = { elements: [{ id: 'replacement', type: 'shared', x: 0, y: 0, width: 1, height: 1, props: { label: 'replacement' } }] }
      f.context.replaceDocument(input)
      input.elements[0].props.label = 'caller mutation'
      expect(f.store.selection.ids).toEqual([])
      f.store.commands.undo()
      expect(f.store.schema.elements[0].props.label).toBe('replacement')
      expect(f.context.getDataSources()).toHaveLength(1)
    }
    finally {
      await f.store.destroy()
    }
  })

  it('detaches extension values and forwards panel, viewport and editing queries', async () => {
    const f = await fixture('before')
    try {
      const value = { nested: { enabled: true } }
      f.context.writeDocumentExtension('extension', value)
      value.nested.enabled = false
      expect(f.context.readDocumentExtension('extension')).toEqual({ nested: { enabled: true } })
      const panel = { id: 'panel', schemas: [], readValue: () => undefined, writeValue: () => {} }
      f.context.requestPropertyPanel(panel)
      expect(f.store.propertyOverlay).toEqual(panel)
      const element = document.createElement('div')
      f.store.setPageElProvider(() => element)
      f.store.workbench.viewport.zoom = 2
      expect(f.context.getPageEl()).toBe(element)
      expect(f.context.getZoom()).toBe(2)
      expect(f.context.isEditing('node')).toBe(false)
    }
    finally {
      await f.store.destroy()
    }
  })

  it('uses actual host interaction providers and rejects their late completion', async () => {
    const release = Promise.withResolvers<boolean>()
    const confirm = vi.fn(() => release.promise)
    const pickAsset = vi.fn(() => ({ url: 'asset' }))
    const pickFileText = vi.fn(() => ({ text: 'file text' }))
    const f = await fixture('before', { confirm, pickAsset, pickFileText })
    try {
      expect(await f.context.pickAsset({ id: 'asset', source: 'test', accept: ['image/*'] })).toEqual({ url: 'asset' })
      expect(await f.context.pickFileText({ id: 'file', source: 'test', accept: ['text/plain'] })).toEqual({ text: 'file text' })
      const pending = f.context.confirm({ id: 'confirm', message: 'Continue?' })
      await f.store.destroy()
      release.resolve(true)
      await expect(pending).rejects.toThrow(/disposed/)
      expect(confirm).toHaveBeenCalledWith({ id: 'confirm', message: 'Continue?' })
      expect(() => f.context.registerDataSource({ id: 'late', name: 'Late', fields: [] })).toThrow(/disposed/)
      expect(f.store.dataSourceRegistry.getSources()).toEqual([])
      expect(() => f.context.writeDocumentExtension('late', true)).toThrow(/disposed/)
      expect(f.store.getExtension('late')).toBeUndefined()
    }
    finally {
      await f.store.destroy()
    }
  })
})
