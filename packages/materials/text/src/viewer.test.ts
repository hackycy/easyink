import { readTrustedViewerHtml } from '@easyink/core'
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

    const html = readTrustedViewerHtml(renderText(node).html!)

    expect(html).toContain('writing-mode:vertical-rl')
    expect(html).toContain('text-orientation:mixed')
    expect(html).toContain('text-align:end')
    expect(html).toContain('justify-content:flex-end')
    expect(html).not.toContain('text-overflow:ellipsis')
  })

  it('treats legacy rich text content as escaped plain text', () => {
    const node = createTextNode({
      model: {
        content: '<b>unsafe</b>',
        richText: true,
      },
    })

    const html = readTrustedViewerHtml(renderText(node).html!)

    expect(html).toContain('&lt;b&gt;unsafe&lt;/b&gt;')
    expect(html).not.toContain('<b>unsafe</b>')
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

    const html = readTrustedViewerHtml(renderText(node).html!)
    const renderSize = getTextRenderSize(node)

    expect(html).toContain('overflow:visible')
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
