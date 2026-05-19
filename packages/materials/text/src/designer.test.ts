import type { MaterialExtensionContext, NodeSignal } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { createDefaultSchema } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createTextExtension } from './designer'
import { createTextNode } from './schema'

function createNodeSignal(node: MaterialNode): NodeSignal {
  return {
    get: () => node,
    subscribe: () => () => {},
  }
}

function createContext(overrides: Partial<MaterialExtensionContext> = {}): MaterialExtensionContext {
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
    t: key => key === 'designer.placeholder.textMaterialEmpty' ? '请输入内容或绑定数据' : key,
    ...overrides,
  }
}

describe('createTextExtension', () => {
  it('shows a localized placeholder in designer when text is empty and unbound', () => {
    const container = document.createElement('div')
    const extension = createTextExtension(createContext())

    extension.renderContent(createNodeSignal(createTextNode()), container)

    expect(container.innerHTML).toContain('请输入内容或绑定数据')
    expect(container.innerHTML).toContain('opacity:0.45')
  })

  it('prefers the binding label over the empty placeholder', () => {
    const container = document.createElement('div')
    const extension = createTextExtension(createContext())
    const node = createTextNode({
      binding: {
        sourceId: 'receipt',
        fieldPath: 'customer/name',
        fieldLabel: '客户姓名',
      },
    })

    extension.renderContent(createNodeSignal(node), container)

    expect(container.innerHTML).toContain('{#客户姓名}')
    expect(container.innerHTML).not.toContain('请输入内容或绑定数据')
  })

  it('declares height as runtime-owned when auto height is enabled', () => {
    const extension = createTextExtension(createContext())
    const fixedPolicy = extension.resolveControlPolicy?.(createTextNode(), {
      getSchema: () => createDefaultSchema(),
      t: key => key,
    })
    const autoPolicy = extension.resolveControlPolicy?.(createTextNode({
      props: { heightMode: 'auto' },
    }), {
      getSchema: () => createDefaultSchema(),
      t: key => key,
    })

    expect(fixedPolicy?.geometry?.height).toBeUndefined()
    expect(autoPolicy?.geometry?.height?.state).toBe('disabled')
    expect(autoPolicy?.resize?.height?.state).toBe('hidden')
  })

  it('syncs designer height for auto-height text through transactions', () => {
    const container = document.createElement('div')
    let updatedHeight = 0
    const node = createTextNode({
      width: 12,
      height: 4,
      props: {
        content: 'abcdefghijabcdefghij',
        heightMode: 'auto',
        wrapMode: 'anywhere',
        fontSize: 4,
        lineHeight: 1,
      },
    })
    const extension = createTextExtension(createContext({
      tx: {
        run: <TNode extends MaterialNode>(_id: string, fn: (draft: TNode) => void) => {
          const draft = { ...node } as TNode
          fn(draft)
          updatedHeight = draft.height
        },
        batch: fn => fn(),
      },
    }))

    extension.renderContent(createNodeSignal(node), container)

    expect(updatedHeight).toBeGreaterThan(node.height)
  })
})
