/** @vitest-environment happy-dom */
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { DesignerStore } from '../store/designer-store'
import { MATERIAL_DRAG_MIME, useMaterialDrop } from './use-material-drop'

describe('useMaterialDrop', () => {
  it('adds one immutable document snapshot and undo restores the whole drop', () => {
    const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'rect', designer: true })])
    const store = new DesignerStore({ unit: 'px', elements: [] }, undefined, undefined, { materials: { profile } })
    const page = document.createElement('div')
    page.getBoundingClientRect = () => ({ left: 0, top: 0, right: 500, bottom: 500, width: 500, height: 500, x: 0, y: 0, toJSON: () => ({}) })
    const drop = useMaterialDrop({ store, getPageEl: () => page })
    const event = {
      clientX: 100,
      clientY: 120,
      dataTransfer: { types: [MATERIAL_DRAG_MIME], getData: (type: string) => type === MATERIAL_DRAG_MIME ? 'rect' : '' },
      preventDefault() {},
    } as unknown as DragEvent

    const before = structuredClone(store.schema)
    drop.onDrop(event)

    expect(store.schema).not.toEqual(before)
    expect(store.documentTransactions.historyEntries).toHaveLength(1)
    expect(store.schema.elements).toHaveLength(1)
    store.documentTransactions.undo()
    expect(store.schema.elements).toHaveLength(0)
  })
})
