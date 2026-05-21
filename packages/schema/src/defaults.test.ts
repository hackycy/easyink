import { describe, expect, it } from 'vitest'
import { createDefaultSchema, normalizeDocumentSchema } from './defaults'

describe('createDefaultSchema', () => {
  it('returns a schema with the current version', () => {
    const schema = createDefaultSchema()
    expect(schema.version).toBe('1.0.0')
  })

  it('uses mm as the default unit', () => {
    const schema = createDefaultSchema()
    expect(schema.unit).toBe('mm')
  })

  it('has page mode fixed', () => {
    const schema = createDefaultSchema()
    expect(schema.page.mode).toBe('fixed')
    expect(schema.page.pageModel?.kind).toBe('paged-paper')
    expect(schema.page.layout?.strategy).toBe('absolute')
    expect(schema.page.pagination?.strategy).toBe('fixed-sheets')
    expect(schema.page.reflow?.strategy).toBe('measure-only')
  })

  it('has A4 dimensions (210x297)', () => {
    const schema = createDefaultSchema()
    expect(schema.page.width).toBe(210)
    expect(schema.page.height).toBe(297)
  })

  it('has empty guides', () => {
    const schema = createDefaultSchema()
    expect(schema.guides).toEqual({ x: [], y: [] })
  })

  it('has empty elements array', () => {
    const schema = createDefaultSchema()
    expect(schema.elements).toEqual([])
  })
})

describe('normalizeDocumentSchema', () => {
  it('returns a default schema for an empty input object', () => {
    const schema = normalizeDocumentSchema({})

    expect(schema).toMatchObject(createDefaultSchema())
  })

  it('normalizes valid schema with structured page layers', () => {
    const schema = createDefaultSchema()

    expect(normalizeDocumentSchema(schema)).toMatchObject({
      page: {
        mode: 'fixed',
        pageModel: { kind: 'paged-paper' },
        layout: { strategy: 'absolute' },
        pagination: { strategy: 'fixed-sheets' },
        reflow: { strategy: 'measure-only' },
      },
    })
  })

  it('fills missing document, page, and guide fields without discarding valid input', () => {
    const schema = normalizeDocumentSchema({
      unit: 'px',
      page: { width: 80 },
      guides: { x: [10] },
    })

    expect(schema.unit).toBe('px')
    expect(schema.page).toMatchObject({ mode: 'fixed', width: 80, height: 297 })
    expect(schema.guides).toEqual({ x: [10], y: [] })
    expect(schema.elements).toEqual([])
  })

  it('falls back required fields with invalid values', () => {
    const schema = normalizeDocumentSchema({
      unit: 'cm' as never,
      page: { mode: 'book' as never, width: 0, height: -1 },
      guides: { x: 'bad' as never, y: [20] },
      elements: 'bad' as never,
    })

    expect(schema.unit).toBe('mm')
    expect(schema.page).toMatchObject({ mode: 'fixed', width: 210, height: 297 })
    expect(schema.guides).toEqual({ x: [], y: [20] })
    expect(schema.elements).toEqual([])
  })

  it('derives continuous-paper layers from stack and continuous modes', () => {
    const stack = normalizeDocumentSchema({ page: { mode: 'stack', width: 80, height: 200 } })
    const continuous = normalizeDocumentSchema({ page: { mode: 'continuous', width: 80, height: 200 } })

    for (const schema of [stack, continuous]) {
      expect(schema.page.pageModel?.kind).toBe('continuous-paper')
      expect(schema.page.layout).toMatchObject({ strategy: 'stack-flow', flowAxis: 'y' })
      expect(schema.page.pagination?.strategy).toBe('none')
      expect(schema.page.reflow).toMatchObject({ strategy: 'flow-y', preserveTrailingGap: true })
    }
  })

  it('preserves explicit structured strategies while filling missing parts', () => {
    const schema = normalizeDocumentSchema({
      page: {
        mode: 'fixed',
        width: 80,
        height: 120,
        layout: { strategy: 'stack-flow' },
        pagination: { strategy: 'auto-sheets', pageCount: 3 },
      },
    })

    expect(schema.page.pageModel).toMatchObject({ kind: 'paged-paper', paper: { width: 80, height: 120 } })
    expect(schema.page.layout).toMatchObject({ strategy: 'stack-flow' })
    expect(schema.page.pagination).toMatchObject({ strategy: 'auto-sheets', pageCount: 3 })
    expect(schema.page.reflow?.strategy).toBe('measure-only')
  })
})
