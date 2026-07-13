import type { ViewerElementTree, ViewerTextTree } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
import { describe, expect, it } from 'vitest'
import { createTextNode, migrateTextModelV0ToV1 } from './schema'
import { getTextRenderSize, measureText, renderText } from './viewer'

describe('renderText', () => {
  it('renders vertical writing mode with native vertical styles', () => {
    const node = createTextNode({
      model: {
        writingMode: 'vertical',
        overflow: 'ellipsis',
        textAlign: 'right',
        verticalAlign: 'top',
      },
    })

    const tree = renderText(node).tree as ViewerElementTree
    const span = tree.children[0] as ViewerElementTree

    expect(span.style).toMatchObject({ 'writing-mode': 'vertical-rl', 'text-orientation': 'mixed', 'text-align': 'end' })
    expect(tree.style).toMatchObject({ 'justify-content': 'flex-end' })
    expect(span.style).not.toHaveProperty('text-overflow')
  })

  it('treats legacy rich text content as escaped plain text', () => {
    const node = createTextNode({
      model: {
        content: '<b>unsafe</b>',
        richText: true,
      },
    })

    const tree = renderText(node).tree as ViewerElementTree
    const span = tree.children[0] as ViewerElementTree
    expect((span.children[0] as ViewerTextTree).value).toBe('<b>unsafe</b>')
  })

  it('uses the unit from a real viewer render context', () => {
    const node = createTextNode({
      model: {
        fontSize: 12,
        borderWidth: 1,
        borderType: 'solid',
        borderColor: '#000000',
      },
    })
    const context = createTestViewerRenderContext({ unit: 'pt' })

    const tree = renderText(node, context).tree as ViewerElementTree
    const span = tree.children[0] as ViewerElementTree

    expect(tree.style?.border).toBe('1pt solid #000000')
    expect(span.style?.['font-size']).toBe('12pt')
  })

  it('strips legacy autoWrap without changing the current wrap mode', () => {
    const node = createTextNode({
      model: {
        content: 'single line',
        autoWrap: false,
      } as never,
    })
    expect(node.model).not.toHaveProperty('autoWrap')
    expect(node.model.wrapMode).toBe('anywhere')
  })

  it('exports the v0 autoWrap migration for the Task 10 schema adapter', () => {
    const source = createTextNode()
    const migrated = migrateTextModelV0ToV1.migrate({
      ...source,
      modelVersion: 0,
      model: { ...source.model, autoWrap: false, wrapMode: undefined },
    }, undefined as never)

    expect(migrated.model).not.toHaveProperty('autoWrap')
    expect(migrated.model).toMatchObject({ wrapMode: 'nowrap' })
  })

  it('renders visible overflow as a visible wrapper footprint', () => {
    const node = createTextNode({
      width: 12,
      height: 4,
      model: {
        content: 'long long long long text',
        overflow: 'visible',
        wrapMode: 'anywhere',
        fontSize: 4,
        lineHeight: 1,
      },
    })

    const tree = renderText(node).tree as ViewerElementTree
    const renderSize = getTextRenderSize(node)

    expect(tree.style.overflow).toBe('visible')
    expect(renderSize.height).toBeGreaterThan(node.height)
  })

  it('measures auto-height text from its content and constraints', () => {
    const node = createTextNode({
      width: 12,
      height: 4,
      model: {
        content: 'abcdefghijabcdefghij',
        heightMode: 'auto',
        wrapMode: 'anywhere',
        fontSize: 4,
        lineHeight: 1,
        minHeight: 6,
        maxHeight: 10,
      },
    })

    const measured = measureText(node)

    expect(measured.width).toBe(12)
    expect(measured.height).toBe(10)
    expect(measured.overflow).toBe(true)
  })

  it('leaves auto-height constraints unset by default while measuring as unbounded', () => {
    const node = createTextNode({
      width: 12,
      height: 4,
      model: {
        content: 'abcdefghijabcdefghij',
        heightMode: 'auto',
        wrapMode: 'anywhere',
        fontSize: 4,
        lineHeight: 1,
      },
    })

    const measured = measureText(node)

    expect(node.model.minHeight).toBeNull()
    expect(node.model.maxHeight).toBeNull()
    expect(measured.height).toBeGreaterThan(10)
    expect(measured.overflow).toBe(false)
  })
})
