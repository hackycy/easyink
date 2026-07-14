import type { MaterialTextMeasureInput, ViewerElementTree, ViewerTextTree } from '@easyink/core'
import { createTestViewerRenderContext } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createTextNode, migrateTextModelV0ToV1 } from './schema'
import { renderText, textViewerLayout } from './viewer'

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

  it('renders visible overflow on the material tree', () => {
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

    expect(tree.style.overflow).toBe('visible')
  })

  it('uses the authoritative text measurement service for auto-height layout', async () => {
    const node = createTextNode({
      width: 12,
      height: 4,
      model: {
        content: 'Brand text',
        heightMode: 'auto',
        fontFamily: 'Brand',
        fontSize: 4,
        fontWeight: '700',
        fontStyle: 'italic',
        lineHeight: 1.5,
        letterSpacing: 0.5,
        wrapMode: 'anywhere',
        borderWidth: 1,
        minHeight: 6,
        maxHeight: 10,
      },
    })
    const measureText = vi.fn(async () => ({ width: 10, height: 7 }))

    const plan = await textViewerLayout.measure!({
      instanceKey: node.id,
      node,
      resolvedModel: node.model,
      nodeRevision: 1,
      constraints: { availableWidth: 12, availableHeight: 20, unit: 'mm', writingMode: 'horizontal-tb' },
      measureText,
    } as never)

    expect(measureText).toHaveBeenCalledWith({
      text: 'Brand text',
      availableWidth: 10,
      unit: 'mm',
      style: {
        fontFamily: 'Brand',
        fontSize: 4,
        fontWeight: '700',
        fontStyle: 'italic',
        lineHeight: 1.5,
        letterSpacing: 0.5,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      },
    })
    expect(plan.borderBox).toMatchObject({ width: 12, height: 9 })
  })

  it('measures long nowrap text with the exact CSS used for paint', async () => {
    const node = createTextNode({
      width: 12,
      height: 4,
      model: {
        content: 'long text that must stay on one line',
        heightMode: 'auto',
        wrapMode: 'nowrap',
      },
    })
    const span = (renderText(node).tree as ViewerElementTree).children[0] as ViewerElementTree
    const measureText = vi.fn(async (_input: MaterialTextMeasureInput) => ({ width: 30, height: 4 }))

    await textViewerLayout.measure!({
      instanceKey: node.id,
      node,
      resolvedModel: node.model,
      nodeRevision: 1,
      constraints: { availableWidth: 12, availableHeight: 20, unit: 'mm', writingMode: 'horizontal-tb' },
      measureText,
    } as never)

    expect(measureText).toHaveBeenCalledOnce()
    const measureInput = measureText.mock.calls[0]![0]
    expect(measureInput.style).toMatchObject({
      whiteSpace: span.style?.['white-space'],
      overflowWrap: span.style?.['overflow-wrap'],
    })
    expect(span.style).toMatchObject({ 'white-space': 'pre', 'overflow-wrap': 'normal' })
  })

  it('measures wrapping text with the exact whitespace-preserving CSS used for paint', async () => {
    const node = createTextNode({
      width: 12,
      height: 4,
      model: {
        content: 'first  line\nsecond line',
        heightMode: 'auto',
        wrapMode: 'wrap',
      },
    })
    const span = (renderText(node).tree as ViewerElementTree).children[0] as ViewerElementTree
    const measureText = vi.fn(async (_input: MaterialTextMeasureInput) => ({ width: 12, height: 8 }))

    await textViewerLayout.measure!({
      instanceKey: node.id,
      node,
      resolvedModel: node.model,
      nodeRevision: 1,
      constraints: { availableWidth: 12, availableHeight: 20, unit: 'mm', writingMode: 'horizontal-tb' },
      measureText,
    } as never)

    expect(measureText).toHaveBeenCalledOnce()
    const measureInput = measureText.mock.calls[0]![0]
    expect(measureInput).toMatchObject({ text: 'first  line\nsecond line' })
    expect(measureInput.style).toMatchObject({
      whiteSpace: span.style?.['white-space'],
      overflowWrap: span.style?.['overflow-wrap'],
    })
    expect(span.style).toMatchObject({ 'white-space': 'pre-wrap', 'overflow-wrap': 'normal' })
  })
})
