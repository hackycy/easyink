import type { ResourceContext } from '@easyink/plugin-api'
import type { DesignerCommand } from '@easyink/plugin-api/designer'
import type { DesignerRendererOperations } from './renderer-context'
import { CommandManager } from '@easyink/core'
import { normalizeDocumentSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { createTransactionService } from '../editing/transaction-service'
import { createDesignerRendererContext } from './renderer-context'

function fixture() {
  const schema = normalizeDocumentSchema({ elements: [{ id: 'node', type: 'fixture', x: 0, y: 0, width: 10, height: 10, rotation: 0, props: { label: 'before' } }] })
  const commands = new CommandManager()
  const controller = new AbortController()
  const dispose: (() => void | Promise<void>)[] = []
  const resources: ResourceContext = { signal: controller.signal, onDispose: callback => dispose.push(callback) }
  const operations: DesignerRendererOperations = {
    getSchema: () => schema,
    getNode: id => schema.elements.find(node => node.id === id),
    getSelection: () => ({ ids: ['node'], count: 1, isEmpty: false }),
    isEditing: () => false,
    getDataSources: () => [],
    getMaterials: () => [],
    getBindingLabel: binding => binding.fieldPath ?? '',
    t: key => key,
    executeCommand: async () => { throw new Error('No commands installed') },
    commitCommand: command => commands.execute(command),
    tx: createTransactionService(id => schema.elements.find(node => node.id === id), commands),
    replaceDocument: vi.fn(),
    readDocumentExtension: namespace => schema.extensions?.[namespace],
    writeDocumentExtension: vi.fn(),
    registerDataSource: vi.fn(),
    confirm: vi.fn(async () => false),
    pickAsset: vi.fn(async () => null),
    pickFileText: vi.fn(async () => null),
    reportDiagnostic: vi.fn(),
    requestPropertyPanel: vi.fn(),
    getZoom: () => 1,
    getPageEl: () => null,
  }
  return { schema, commands, controller, resources, operations, dispose }
}

describe('controlled Designer renderer context', () => {
  it('returns immutable detached snapshots and edits through real transactions and undo', () => {
    const f = fixture()
    const context = createDesignerRendererContext(f.operations, f.resources)
    const before = context.getSchema()
    expect(Object.isFrozen(before.elements[0].props)).toBe(true)
    expect(() => Object.assign(before.elements[0].props, { label: 'bypass' })).toThrow()
    expect(f.schema.elements[0].props.label).toBe('before')
    context.tx.run('node', draft => draft.props.label = 'after')
    expect(f.schema.elements[0].props.label).toBe('after')
    expect(before.elements[0].props.label).toBe('before')
    f.commands.undo()
    expect(f.schema.elements[0].props.label).toBe('before')
  })

  it('keeps a failed batch atomic and rejects a batch invalidated before commit', () => {
    const f = fixture()
    const context = createDesignerRendererContext(f.operations, f.resources)
    expect(() => context.tx.batch(() => {
      context.tx.run('node', draft => draft.props.label = 'failed')
      throw new Error('abort batch')
    })).toThrow('abort batch')
    expect(f.schema.elements[0].props.label).toBe('before')
    expect(() => context.tx.batch(() => {
      context.tx.run('node', draft => draft.props.label = 'disposed batch')
      f.controller.abort()
    })).toThrow(/disposed/)
    expect(f.schema.elements[0].props.label).toBe('before')
  })

  it('rejects a single edit invalidated inside its mutator before it enters command history', () => {
    const f = fixture()
    const context = createDesignerRendererContext(f.operations, f.resources)
    expect(() => context.tx.run('node', (draft) => {
      draft.props.label = 'late'
      f.controller.abort()
    })).toThrow(/disposed/)
    expect(f.schema.elements[0].props.label).toBe('before')
    f.commands.undo()
    expect(f.schema.elements[0].props.label).toBe('before')
  })

  it('does not copy extra internal properties and blocks retained edit, query, interaction and diagnostic operations', () => {
    const f = fixture()
    const internal = { ...f.operations, store: f.schema }
    const context = createDesignerRendererContext(internal, f.resources)
    expect('store' in context).toBe(false)
    expect(Object.isFrozen(context)).toBe(true)
    f.controller.abort()
    const calls = [
      () => context.getSchema(),
      () => context.getNode('node'),
      () => context.getSelection(),
      () => context.readDocumentExtension('fixture'),
      () => context.tx.run('node', draft => draft.props.label = 'late'),
      () => context.replaceDocument({}),
      () => context.writeDocumentExtension('fixture', {}),
      () => context.reportDiagnostic({ code: 'late', message: 'late' }),
      () => context.requestPropertyPanel(null),
      () => context.emit('late', {}),
    ]
    for (const call of calls)
      expect(call).toThrow(/disposed/)
    expect(f.operations.replaceDocument).not.toHaveBeenCalled()
    expect(f.operations.writeDocumentExtension).not.toHaveBeenCalled()
    expect(f.operations.reportDiagnostic).not.toHaveBeenCalled()
    expect(f.schema.elements[0].props.label).toBe('before')
  })

  it('does not deliver a late interaction result or execute a retained command', async () => {
    const f = fixture()
    const external = Promise.withResolvers<boolean>()
    const context = createDesignerRendererContext({ ...f.operations, confirm: () => external.promise }, f.resources)
    const pending = context.confirm({ id: 'confirm', message: 'Confirm' })
    f.controller.abort()
    external.resolve(true)
    await expect(pending).rejects.toThrow(/disposed/)
    const handler = vi.fn(() => 42)
    const command: DesignerCommand<string, number> = { id: 'length', handler }
    await expect(context.executeCommand(command, 'text')).rejects.toThrow(/disposed/)
    expect(handler).not.toHaveBeenCalled()
    await expect(context.pickAsset({ id: 'asset', source: 'test' })).rejects.toThrow(/disposed/)
    expect(f.operations.pickAsset).not.toHaveBeenCalled()
  })

  it('owns event listeners per context, supports unsubscribe and refuses callbacks after invalidation', async () => {
    const f = fixture()
    const a = createDesignerRendererContext(f.operations, f.resources)
    const b = createDesignerRendererContext(f.operations, f.resources)
    const handler = vi.fn()
    const unsubscribe = a.on('change', handler)
    b.emit('change', 'other')
    expect(handler).not.toHaveBeenCalled()
    a.emit('change', 'local')
    expect(handler).toHaveBeenCalledWith('local')
    unsubscribe()
    a.emit('change', 'removed')
    expect(handler).toHaveBeenCalledOnce()
    a.on('change', handler)
    f.controller.abort()
    expect(() => a.emit('change', 'late')).toThrow(/disposed/)
    for (const cleanup of f.dispose.reverse())
      await cleanup()
    expect(handler).toHaveBeenCalledOnce()
  })
})
