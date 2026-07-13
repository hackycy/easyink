import type { DocumentStoreEvent, FontProvider, MaterialDesignerExtension, SchemaAdapter } from '@easyink/core'
import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createDesignerTestManifest, createDesignerTestProfile } from '../testing/material-profile'
import { DesignerStore } from './designer-store'

describe('designer store schema initialization', () => {
  it('normalizes an empty schema input to a complete document schema', () => {
    const store = new DesignerStore({})

    expect(store.schema.unit).toBe('mm')
    expect(store.schema.page).toMatchObject({ mode: 'fixed', width: 210, height: 297 })
    expect(store.schema.guides).toEqual({ x: [], y: [] })
    expect(store.schema.elements).toEqual([])
  })

  it('normalizes partial schema replacements and clears selection and history', () => {
    const store = new DesignerStore({ elements: [createNode('old')] }, undefined, undefined, runtimeWith(boxProfile()))
    store.selection.select('old')
    store.documentTransactions.transact((draft) => {
      draft.page.width += 1
    }, { label: 'test', operation: { kind: 'test', sessionPath: [], targetIds: ['document'], fieldPaths: ['/page/width'], selectionLineage: null, structural: false } })
    store.documentTransactions.undo()

    store.setSchema({ page: { width: 80 }, elements: [createNode('fresh')] })

    expect(store.schema.page).toMatchObject({ mode: 'fixed', width: 80, height: 297 })
    expect(store.schema.guides).toEqual({ x: [], y: [] })
    expect(store.schema.elements.map(node => node.id)).toEqual(['fresh'])
    expect(store.materialNodeStates.get('fresh')?.status).toBe('ready')
    expect(store.selection.isEmpty).toBe(true)
    expect(store.documentTransactions).toMatchObject({ canUndo: false, canRedo: false, cursor: 0, totalCount: 0 })
  })

  it('uses EasyInk paper presets by default', () => {
    const store = new DesignerStore()

    expect(store.listPaperPresets().map(preset => preset.name)).toContain('A4')
    expect(store.getPaperPresetBySize(210, 297)?.name).toBe('A4')
  })

  it('can replace built-in paper presets with host presets', () => {
    const store = new DesignerStore(undefined, undefined, undefined, {
      paper: {
        mode: 'replace',
        presets: [{ name: 'Enterprise Label', width: 76, height: 42 }],
      },
    })

    expect(store.listPaperPresets()).toEqual([{ name: 'Enterprise Label', width: 76, height: 42 }])
    expect(store.getPaperPreset('A4')).toBeUndefined()
  })

  it('applies the configured default paper only when the input has no explicit page size', () => {
    const runtimeConfig = {
      paper: {
        mode: 'replace' as const,
        presets: [{ name: 'Enterprise Label', width: 76, height: 42 }],
        defaultPreset: 'Enterprise Label',
      },
    }
    const defaulted = new DesignerStore(undefined, undefined, undefined, runtimeConfig)
    const explicit = new DesignerStore({ page: { width: 90 } }, undefined, undefined, runtimeConfig)

    expect(defaulted.schema.page).toMatchObject({ width: 76, height: 42, pageModel: { paper: { width: 76, height: 42 } } })
    expect(explicit.schema.page).toMatchObject({ width: 90, height: 297, pageModel: { paper: { width: 90, height: 297 } } })
  })

  it('keeps save status transitions behind the store API', () => {
    const store = new DesignerStore()

    store.queueSave()
    expect(store.workbench.status).toMatchObject({ draft: 'modified', savePhase: 'queued' })
    store.startSave()
    expect(store.workbench.status.savePhase).toBe('saving')
    store.completeSave()
    expect(store.workbench.status).toMatchObject({ draft: 'clean', savePhase: 'success' })
    expect(store.workbench.status.saveUpdatedAt).toEqual(expect.any(Number))
    store.resetTemplateSaveState()
    expect(store.workbench.status).toMatchObject({ draft: 'clean', savePhase: 'idle' })
    expect(store.workbench.status.saveUpdatedAt).toBeUndefined()
  })

  it('prunes removed elements from logical groups', () => {
    const store = new DesignerStore({
      elements: [createNode('a'), createNode('b'), createNode('c')],
      groups: [{ id: 'grp_1', memberIds: ['a', 'b', 'c'] }],
    }, undefined, undefined, runtimeWith(boxProfile()))

    store.removeElement('b')
    expect(store.schema.groups).toEqual([{ id: 'grp_1', memberIds: ['a', 'c'] }])
    store.removeElement('a')
    expect(store.schema.groups).toEqual([])
  })

  it('runs constructor admission phases in order and stores only canonical nodes', () => {
    const phases: string[] = []
    const base = createTestMaterialManifest({ type: 'seed' }).schemaAdapter
    const adapter: SchemaAdapter = {
      ...base,
      currentModelVersion: 1,
      migrations: [{ from: 0, to: 1, migrate: (node) => {
        phases.push('migrate')
        return { ...node, modelVersion: 1, model: { count: Number(node.model.count) } }
      } }],
      validateInput: () => {
        phases.push('validate-input')
        return []
      },
      normalize: (node) => {
        phases.push('normalize')
        return { ...node, model: { ...node.model, normalized: true } }
      },
      validate: () => {
        phases.push('validate')
        return []
      },
      introspect: () => {
        phases.push('introspect')
        return { identities: [], structures: [], references: [], resources: [], bindings: [] }
      },
    }
    const profile = createDesignerTestProfile([createDesignerTestManifest({ type: 'box', schemaAdapter: adapter })])

    const store = new DesignerStore({ elements: [{ id: 'box', type: 'box', props: { count: '2' } }] }, undefined, undefined, runtimeWith(profile))

    expect(phases).toEqual(['validate-input', 'migrate', 'normalize', 'validate', 'introspect', 'introspect'])
    expect(store.schema.elements[0]).toEqual(expect.objectContaining({
      id: 'box',
      type: 'box',
      modelVersion: 1,
      model: { count: 2, normalized: true },
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    }))
    expect(store.schema.elements[0]).not.toHaveProperty('props')
  })

  it('retains the compiled profile identity and exposes immutable type lists without mutation APIs', () => {
    const profile = boxProfile()
    const store = new DesignerStore(undefined, undefined, undefined, runtimeWith(profile))

    expect(store.materialProfile).toBe(profile)
    expect([...store.materialProfile.editableTypes]).toEqual(['box'])
    expect(Object.isFrozen(profile.editableTypes)).toBe(true)
    expect('registerMaterial' in store).toBe(false)
  })

  it('loads ready and unknown nodes with complete sidecars', () => {
    const store = unknownAndBoxStore()

    expect(store.schema.elements.map(node => node.id)).toEqual(['unknown', 'box'])
    expect(store.materialNodeStates.get('unknown')).toMatchObject({ status: 'quarantined', code: 'MATERIAL_TYPE_UNKNOWN' })
    expect(store.materialNodeStates.get('box')).toMatchObject({ status: 'ready' })
    expect(store.materialDiagnostics).toContainEqual(expect.objectContaining({ code: 'MATERIAL_TYPE_UNKNOWN', nodeId: 'unknown' }))
  })

  it('publishes an editable node change while preserving complete unknown and ready states', () => {
    const store = unknownAndBoxStore()
    const unknownState = store.materialNodeStates.get('unknown')
    const candidate = structuredClone(store.schema)
    candidate.elements[1]!.x = 24

    expect(store.publishSchemaCandidate(candidate, new Set(['box']))).toBe(true)
    expect(store.schema).not.toBe(candidate)
    expect(store.schema).toEqual(candidate)
    expect(store.schema.elements[1]?.x).toBe(24)
    expect(store.materialNodeStates.size).toBe(2)
    expect(store.materialNodeStates.get('unknown')).toBe(unknownState)
    expect(store.materialNodeStates.get('box')?.status).toBe('ready')
  })

  it('atomically rejects moving an unknown node without changing history or sidecars', () => {
    const store = unknownAndBoxStore()
    store.documentTransactions.transact((draft) => {
      draft.elements[1]!.x += 1
    }, { label: 'test', operation: { kind: 'test', sessionPath: [], targetIds: ['node:box'], fieldPaths: ['/x'], selectionLineage: null, structural: false } })
    store.documentTransactions.undo()
    const schema = store.schema
    const states = store.materialNodeStates
    const diagnostics = store.materialDiagnostics
    const candidate = structuredClone(schema)
    candidate.elements[0]!.x = 99

    expect(store.publishSchemaCandidate(candidate, new Set(['unknown']))).toBe(false)
    expect(store.schema).toBe(schema)
    expect(store.materialNodeStates).toBe(states)
    expect(store.materialDiagnostics).toBe(diagnostics)
    expect(store.documentTransactions).toMatchObject({ cursor: 0, canRedo: true, totalCount: 1 })
  })

  it('allows deleting an unknown node', () => {
    const store = unknownAndBoxStore()
    const candidate = structuredClone(store.schema)
    candidate.elements = candidate.elements.filter(node => node.id !== 'unknown')

    expect(store.publishSchemaCandidate(candidate, new Set(['unknown']))).toBe(true)
    expect(store.schema.elements.map(node => node.id)).toEqual(['box'])
    expect([...store.materialNodeStates.keys()]).toEqual(['box'])
  })

  it('restores captured schema and states in history mode', () => {
    const store = unknownAndBoxStore()
    const capturedSchema = structuredClone(store.schema)
    const capturedStates = store.materialNodeStates
    const candidate = structuredClone(store.schema)
    candidate.elements = candidate.elements.filter(node => node.id !== 'unknown')
    expect(store.publishSchemaCandidate(candidate, new Set(['unknown']))).toBe(true)

    expect(store.restoreSchemaFromHistory(capturedSchema, capturedStates)).toBe(true)
    expect(store.schema).not.toBe(capturedSchema)
    expect(store.schema).toEqual(capturedSchema)
    expect(store.materialNodeStates.get('unknown')).toBe(capturedStates.get('unknown'))
    expect(store.materialNodeStates.get('box')).toBe(capturedStates.get('box'))
  })

  it('serializes only the canonical schema, never admission sidecars', () => {
    const store = unknownAndBoxStore()
    const saved = JSON.parse(JSON.stringify(store.schema)) as DocumentSchema

    expect(saved).toEqual(store.schema)
    expect(saved).not.toHaveProperty('materialDiagnostics')
    expect(saved).not.toHaveProperty('materialNodeStates')
    expect(saved.elements[0]).not.toHaveProperty('diagnostics')
  })

  it('resolves registered locale messages after host locale overrides', () => {
    const store = new DesignerStore()
    store.setLocale({ plugin: { title: 'Host Title' } }, 'en-US')
    const unregister = store.registerLocaleMessages({
      messages: { plugin: { title: 'Default Title', action: 'Default Action' } },
      locales: { 'en-US': { plugin: { title: 'Registered Title', action: 'Registered Action' } } },
    })

    expect(store.t('plugin.title')).toBe('Host Title')
    expect(store.t('plugin.action')).toBe('Registered Action')
    unregister()
    expect(store.t('plugin.action')).toBe('plugin.action')
  })

  it('delegates font loading while preserving font manager compatibility', async () => {
    const store = new DesignerStore()
    const provider: FontProvider = {
      listFonts: async () => [{ family: 'Inter', displayName: 'Inter', weights: ['400'], styles: ['normal'], source: 'system' }],
      loadFont: async () => ({ type: 'system' }),
    }
    store.setFontProvider(provider)
    const revision = store.fontRevision

    await expect(store.ensureFontLoaded({ family: 'Inter' })).resolves.toBe(true)
    expect(store.fontManager).toBe(store.fontService.manager)
    expect(store.getFontStatus('Inter')).toBe('loaded')
    expect(store.getFontStatuses(['Inter'], store.fontRevision)).toEqual({ Inter: 'loaded' })
    expect(store.fontRevision).toBeGreaterThan(revision)
  })

  it('reconciles selection from each event snapshot and keeps reset sidecars current', async () => {
    const store = unknownAndBoxStore()
    store.selection.select('box')
    store.documentTransactions.transact((draft) => {
      draft.elements = draft.elements.filter(node => node.id !== 'box')
    }, { label: 'Remove', operation: { kind: 'structure.remove', sessionPath: [], targetIds: ['node:box'], fieldPaths: ['/elements'], selectionLineage: null, structural: true } })
    store.setSchema({ elements: [createNode('replacement', 'missing')] })
    await Promise.resolve()
    expect(store.selection.isEmpty).toBe(true)
    expect(store.getMaterialNodeState('replacement')?.status).toBe('quarantined')
  })

  it('owns immutable schema snapshots and indexed transaction results', () => {
    const store = new DesignerStore({}, undefined, undefined, runtimeWith(boxProfile()))
    const before = store.schema
    expect(() => store.schema.elements.push(createNode('forbidden'))).toThrow()
    store.documentTransactions.transact((draft) => {
      draft.elements.push(createNode('x'))
    }, { label: 'Insert', operation: { kind: 'structure.insert', sessionPath: [], targetIds: ['node:x'], fieldPaths: ['/elements'], selectionLineage: null, structural: true } })
    expect(store.schema).not.toBe(before)
    expect(store.getElementById('x')?.id).toBe('x')
    expect(store.documentStore.index.getNode('x')?.id).toBe('x')
  })

  it('keeps committed sidecars while a preview obscures the document view', async () => {
    const store = unknownAndBoxStore()
    store.documentTransactions.run('box', (draft) => {
      draft.model.value = 1
    }, { label: 'Commit' })
    const committedState = store.documentStore.materialNodeStates.get('box')
    const preview = store.documentTransactions.beginPreview({ label: 'Preview', operation: { kind: 'material.property', sessionPath: [], targetIds: ['node:box'], fieldPaths: ['/model/value'], selectionLineage: null, structural: false } })
    preview.run('box', (draft) => {
      draft.model.value = 2
    })
    await Promise.resolve()
    expect(store.getMaterialNodeState('box')).toBe(committedState)
    preview.cancel()
    await Promise.resolve()
    expect(store.getMaterialNodeState('box')).toBe(committedState)
  })

  it('does not let stale remove events clear a selection restored by undo', async () => {
    const store = unknownAndBoxStore()
    store.selection.select('box')
    store.removeElement('box')
    store.documentTransactions.undo()
    store.selection.select('box')
    await Promise.resolve()
    expect(store.selection.ids).toEqual(['box'])
  })

  it('rebases editing selections with the exact document event indexes and change set', async () => {
    const store = new DesignerStore({ elements: [createNode('box')] }, undefined, undefined, runtimeWith(boxProfile()))
    const rebase = vi.fn(selection => ({ ...selection, payload: { cellId: 'b' } }))
    const extension: MaterialDesignerExtension = {
      renderContent: () => () => {},
      geometry: {
        getContentLayout: () => ({ contentBox: { x: 0, y: 0, width: 10, height: 10 } }),
        resolveLocation: () => [],
        hitTest: () => null,
      },
      selectionTypes: [{ id: 'box.part', resolveLocation: () => [], rebase }],
    }
    const session = store.editingSession.enter('box', extension)!
    session.selectionStore.set({ type: 'box.part', nodeId: 'box', payload: { cellId: 'a' } })
    const lineage = session.selectionStore.lineageId
    let event: DocumentStoreEvent | undefined
    store.documentStore.subscribe((value) => {
      event = value
    })

    store.documentTransactions.run('box', (draft) => {
      draft.model.value = 1
    }, { label: 'Edit', operation: {
      kind: 'material.property',
      sessionPath: [],
      targetIds: ['node:box'],
      fieldPaths: ['/model/value'],
      selectionLineage: lineage,
      structural: false,
    } })
    await Promise.resolve()

    expect(event).toBeDefined()
    expect(rebase).toHaveBeenCalledWith(expect.objectContaining({ payload: { cellId: 'a' } }), {
      changeSet: event!.changeSet,
      before: event!.previousIndex,
      after: event!.index,
    })
    expect(session.selectionStore.selection?.payload).toEqual({ cellId: 'b' })
    expect(session.selectionStore.lineageId).toBe(lineage)
  })

  it('copies the applicable top-level selection lineage into element operations', async () => {
    const store = new DesignerStore({ elements: [createNode('box')] }, undefined, undefined, runtimeWith(boxProfile()))
    store.selection.select('box')
    const lineage = store.selection.lineageId
    let event: DocumentStoreEvent | undefined
    store.documentStore.subscribe((value) => {
      event = value
    })

    store.updateElement('box', { x: 2 })
    await Promise.resolve()

    expect(event?.changeSet?.operation.selectionLineage).toBe(lineage)
  })

  it('provides dynamic top-level and editing-session operation context to materials', () => {
    const store = new DesignerStore({ elements: [createNode('box')] }, undefined, undefined, runtimeWith(boxProfile()))
    store.selection.select('box')
    expect(store.documentTransactions.getOperationContext()).toEqual({
      sessionPath: [],
      selectionLineage: store.selection.lineageId,
    })

    const extension: MaterialDesignerExtension = {
      renderContent: () => () => {},
      geometry: {
        getContentLayout: () => ({ contentBox: { x: 0, y: 0, width: 10, height: 10 } }),
        resolveLocation: () => [],
        hitTest: () => null,
      },
    }
    const session = store.editingSession.enter('box', extension)!
    session.selectionStore.set({ type: 'box.part', nodeId: 'box', payload: { partId: 'a' } })
    expect(store.documentTransactions.getOperationContext()).toEqual({
      sessionPath: ['box'],
      selectionLineage: session.selectionStore.lineageId,
    })
  })

  it('unsubscribes document and selection listeners on destroy', () => {
    const store = unknownAndBoxStore()
    const tx = store.documentTransactions
    store.destroy()
    expect(() => tx.markHistoryBarrier()).not.toThrow()
    expect(() => store.selection.select('box')).not.toThrow()
    store.destroy()
  })

  it('ignores queued document events after destroy', async () => {
    const store = unknownAndBoxStore()
    store.selection.select('box')
    store.removeElement('box')
    store.destroy()
    store.selection.select('box')
    await Promise.resolve()
    expect(store.selection.ids).toEqual(['box'])
    store.destroy()
  })

  it('records escaped extension writes as document transactions with undo', () => {
    const store = new DesignerStore()
    const before = store.schema
    store.setExtension('vendor/a~b', { enabled: true })
    expect(store.schema).not.toBe(before)
    expect(store.getExtension('vendor/a~b')).toEqual({ enabled: true })
    expect(store.documentTransactions.historyEntries.at(-1)?.description).toBe('Set extension vendor/a~b')
    store.deleteExtension('vendor/a~b')
    expect(store.getExtension('vendor/a~b')).toBeUndefined()
    store.documentTransactions.undo()
    expect(store.getExtension('vendor/a~b')).toEqual({ enabled: true })
  })
})

function boxProfile() {
  return createDesignerTestProfile([createDesignerTestManifest({ type: 'box' })])
}
function runtimeWith(profile: ReturnType<typeof boxProfile>) {
  return { materials: { profile } }
}

function unknownAndBoxStore() {
  return new DesignerStore({ elements: [createNode('unknown', 'missing'), createNode('box')] }, undefined, undefined, runtimeWith(boxProfile()))
}

function createNode(id: string, type = 'box'): MaterialNode {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
  }
}
