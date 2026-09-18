import type { MaterialExtensionContext, NodeSignal } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createBarcodeExtension } from './designer'
import { createBarcodeNode } from './schema'
import { installCanvasTextMeasurement } from './test-utils'

installCanvasTextMeasurement()

function createContext(): MaterialExtensionContext {
  const schema = createDefaultSchema()
  return {
    getSchema: () => schema,
    getNode: () => undefined,
    getSelection: () => ({ ids: [], count: 0, isEmpty: true }),
    getBindingLabel: binding => binding.fieldLabel || binding.fieldPath,
    commitCommand: () => {},
    tx: {
      run: () => {},
      batch: fn => fn(),
    },
    requestPropertyPanel: () => {},
    emit: () => {},
    on: () => () => {},
    getZoom: () => 1,
    getPageEl: () => null,
    t: key => key,
  }
}

function createMutableNodeSignal(initialNode: MaterialNode): {
  signal: NodeSignal
  update: (node: MaterialNode) => void
} {
  let currentNode = initialNode
  let subscriber: ((node: MaterialNode) => void) | undefined
  return {
    signal: {
      get: () => currentNode,
      subscribe: (callback) => {
        subscriber = callback
        return () => {
          subscriber = undefined
        }
      },
    },
    update: (node) => {
      currentNode = node
      subscriber?.(node)
    },
  }
}

describe('createBarcodeExtension', () => {
  it('renders and repaints the official EAN-13 layout', () => {
    const container = document.createElement('div')
    const extension = createBarcodeExtension(createContext())
    const nodeSignal = createMutableNodeSignal(createBarcodeNode({
      props: {
        value: '5901234123457',
        format: 'EAN13',
        showText: true,
      },
    }))
    const cleanup = extension.renderContent(nodeSignal.signal, container)

    expect(Array.from(container.querySelectorAll('text')).map(text => text.textContent).filter(Boolean))
      .toEqual(['5', '901234', '123457'])

    nodeSignal.update(createBarcodeNode({
      props: {
        value: '5901234123457',
        format: 'EAN13',
        showText: false,
      },
    }))

    expect(container.querySelectorAll('text')).toHaveLength(0)
    cleanup()
  })

  it('shows the configured format sample for an empty value', () => {
    const container = document.createElement('div')
    const extension = createBarcodeExtension(createContext())
    const nodeSignal = createMutableNodeSignal(createBarcodeNode({
      props: {
        value: '',
        format: 'EAN13',
      },
    }))

    extension.renderContent(nodeSignal.signal, container)

    expect(container.querySelector('svg')).not.toBeNull()
    expect(container.querySelectorAll('text')).toHaveLength(0)
    expect(container.textContent).toContain('EAN13')
  })

  it('writes binding labels through textContent', () => {
    const container = document.createElement('div')
    const extension = createBarcodeExtension(createContext())
    const nodeSignal = createMutableNodeSignal(createBarcodeNode({
      binding: {
        sourceId: 'product',
        fieldPath: 'ean',
        fieldLabel: '<img src=x>',
      },
      props: {
        value: 'EasyInk',
        format: 'CODE128',
      },
    }))

    extension.renderContent(nodeSignal.signal, container)

    expect(container.textContent).toContain('{#<img src=x>}')
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows an error state for invalid values', () => {
    const container = document.createElement('div')
    const extension = createBarcodeExtension(createContext())
    const nodeSignal = createMutableNodeSignal(createBarcodeNode({
      props: {
        value: 'invalid',
        format: 'EAN13',
      },
    }))

    extension.renderContent(nodeSignal.signal, container)

    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toBe('Invalid: invalid')
  })
})
