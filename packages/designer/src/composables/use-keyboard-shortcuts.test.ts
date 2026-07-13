import { createTestCompiledMaterialProfile, createTestMaterialManifest } from '@easyink/core/testing'
/**
 * @vitest-environment happy-dom
 */
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, defineComponent } from 'vue'
import { DesignerStore } from '../store/designer-store'
import { useKeyboardShortcuts } from './use-keyboard-shortcuts'

function mountShortcuts(store: DesignerStore, container: HTMLElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)

  const app = createApp(defineComponent({
    setup() {
      useKeyboardShortcuts({
        store,
        getContainer: () => container,
      })
      return () => null
    },
  }))

  app.mount(host)

  return {
    unmount() {
      app.unmount()
      host.remove()
    },
  }
}

function makeStore(): DesignerStore {
  const profile = createTestCompiledMaterialProfile([createTestMaterialManifest({ type: 'rect' })])
  const store = new DesignerStore({
    unit: 'px',
    elements: [{
      id: 'a',
      type: 'rect',
      x: 10,
      y: 20,
      width: 50,
      height: 40,
      rotation: 0,
      modelVersion: 1,
      model: {},
      slots: {},
      bindings: {},
      output: { visibility: 'include' },
    } as never],
  }, undefined, undefined, { materials: { profile } })
  store.selection.select('a')
  return store
}

function dispatchArrow(target: HTMLElement, key: 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown') {
  target.dispatchEvent(new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
  }))
}

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useKeyboardShortcuts', () => {
  it('nudges the current selection when canvas focus is active even if DOM focus fell back outside the workspace', () => {
    const store = makeStore()
    const container = document.createElement('div')
    const mounted = mountShortcuts(store, container)
    store.setFocusState('canvas')

    dispatchArrow(document.body, 'ArrowRight')

    expect(store.getElementById('a')?.x).toBe(11)
    mounted.unmount()
  })

  it('does not nudge when panel focus owns the keyboard', () => {
    const store = makeStore()
    const container = document.createElement('div')
    const mounted = mountShortcuts(store, container)
    store.setFocusState('panel')

    dispatchArrow(document.body, 'ArrowRight')

    expect(store.getElementById('a')?.x).toBe(10)
    mounted.unmount()
  })
})
