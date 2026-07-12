import type { MaterialControlPolicy } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import type { DesignerStore } from '../store/designer-store'
import type { PropSchema } from '../types'
import { describe, expect, it } from 'vitest'
import {
  canEditGeometry,
  canResizeHandle,
  getPropSchemaControlState,
  getVisibleResizeHandles,
  isPropSchemaDisabled,
} from './control-policy'

const node: MaterialNode = {
  id: 'n1',
  type: 'dynamic',
  x: 0,
  y: 0,
  width: 100,
  height: 20,
  modelVersion: 1,
  model: {},
  slots: {},
  bindings: {},
  output: { visibility: 'include' },
}

function makeStore(policy: MaterialControlPolicy, capabilities: { resizable?: boolean } = { resizable: true }): DesignerStore {
  return {
    schema: {},
    t: (key: string) => key,
    getMaterialManifest: () => ({ common: { interaction: capabilities } }),
    peekDesignerFacet: () => ({
      value: { extension: { renderContent: () => () => {}, resolveControlPolicy: () => policy } },
    }),
  } as unknown as DesignerStore
}

describe('material control policy', () => {
  it('hides vertical resize handles when runtime height owns the element height', () => {
    const store = makeStore({
      geometry: {
        height: { state: 'disabled', reason: 'runtime-height' },
      },
      resize: {
        height: { state: 'hidden', reason: 'runtime-height' },
      },
    })

    expect(canEditGeometry(store, node, 'height')).toBe(false)
    expect(canEditGeometry(store, node, 'width')).toBe(true)
    expect(getVisibleResizeHandles(store, node)).toEqual(['w', 'e'])
    expect(canResizeHandle(store, node, 's')).toBe(false)
    expect(canResizeHandle(store, node, 'e')).toBe(true)
  })

  it('derives handle availability from width and height axes', () => {
    const store = makeStore({
      resize: {
        width: { state: 'hidden' },
      },
    })

    expect(getVisibleResizeHandles(store, node)).toEqual(['n', 's'])
  })

  it('hides all resize handles when the material disables resizing', () => {
    const store = makeStore({}, { resizable: false })

    expect(getVisibleResizeHandles(store, node)).toEqual([])
    expect(canResizeHandle(store, node, 'e')).toBe(false)
  })

  it('combines field, group, and schema-level prop disabled states', () => {
    const groupSchema: PropSchema = { key: 'gap', label: 'Gap', type: 'number', group: 'layout' }
    const fieldSchema: PropSchema = { key: 'backgroundColor', label: 'Background', type: 'color', group: 'appearance' }
    const localSchema: PropSchema = { key: 'local', label: 'Local', type: 'switch', disabled: () => true }
    const store = makeStore({
      props: {
        groups: {
          layout: { state: 'disabled' },
        },
        fields: {
          backgroundColor: { state: 'hidden' },
        },
      },
    })

    expect(getPropSchemaControlState(store, node, groupSchema).state).toBe('disabled')
    expect(getPropSchemaControlState(store, node, fieldSchema).state).toBe('hidden')
    expect(isPropSchemaDisabled(store, node, groupSchema)).toBe(true)
    expect(isPropSchemaDisabled(store, node, fieldSchema)).toBe(true)
    expect(isPropSchemaDisabled(store, node, localSchema)).toBe(true)
  })
})
