import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { defineMaterialManifest } from './material-manifest'
import { createPagePlan } from './page-planner'
import { createTestCompiledMaterialProfile, createTestMaterialManifest } from './testing/material-profile'

function makeNode(id: string, overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    modelVersion: 1,
    model: {},
    slots: {},
    bindings: {},
    output: { visibility: 'include' },
    ...overrides,
  }
}

function makeSchema(pageOverrides: Partial<DocumentSchema['page']>, elements: MaterialNode[] = []): DocumentSchema {
  return {
    version: '1.0.0',
    unit: 'mm',
    page: { mode: 'fixed', width: 210, height: 297, ...pageOverrides },
    guides: { x: [], y: [] },
    elements,
  }
}

function repeatedPageNumberOptions(nodeId = 'page-number') {
  return {
    profile: repeatedPageNumberProfile(),
    paintableNodeIds: new Set([nodeId]),
  }
}

function repeatedPageNumberProfile() {
  const text = createTestMaterialManifest({ type: 'text' })
  const pageNumber = createTestMaterialManifest({ type: 'page-number' })
  return createTestCompiledMaterialProfile([
    text,
    defineMaterialManifest({
      ...pageNumber,
      common: {
        ...pageNumber.common,
        layout: { ...pageNumber.common.layout, pageRepeat: 'every-output-page' },
      },
    }),
  ])
}

describe('createPagePlan', () => {
  describe('fixed mode', () => {
    it('excludes manifest-repeated nodes from ordinary content and paints each page once', () => {
      const repeated = makeNode('page-number', { type: 'page-number', y: 280, height: 10 })
      const schema = makeSchema({
        mode: 'fixed',
        pages: 2,
        pageModel: { kind: 'paged-paper', paper: { width: 210, height: 297 } },
        pagination: { strategy: 'fixed-sheets', pageCount: 2 },
      }, [makeNode('content', { y: 20 }), repeated])
      const plan = createPagePlan(schema, {
        profile: repeatedPageNumberProfile(),
        paintableNodeIds: new Set(['content', 'page-number']),
      })

      expect(plan.pages[0]!.elements.map(node => node.id)).toEqual(['content', 'page-number__p0'])
      expect(plan.pages[1]!.elements.map(node => node.id)).toEqual(['page-number__p1'])
    })

    it('keeps repeated virtual identities distinct from legal user node ids', () => {
      const repeated = makeNode('page-number', { type: 'page-number', y: 280, height: 10 })
      const schema = makeSchema({
        mode: 'fixed',
        pagination: { strategy: 'fixed-sheets', pageCount: 1 },
      }, [makeNode('page-number__p0'), repeated])

      const plan = createPagePlan(schema, repeatedPageNumberOptions())

      expect(plan.pages[0]!.elements.map(node => node.id)).toEqual([
        'page-number__p0',
        'page-number__p0__v1',
      ])
    })

    it('creates a single page with all elements', () => {
      const schema = makeSchema(
        { mode: 'fixed' },
        [makeNode('a'), makeNode('b')],
      )
      const plan = createPagePlan(schema)
      expect(plan.mode).toBe('fixed')
      expect(plan.pages).toHaveLength(1)
      expect(plan.pages[0]!.elements).toHaveLength(2)
      expect(plan.pages[0]!.width).toBe(210)
      expect(plan.pages[0]!.height).toBe(297)
    })

    it('preserves committed layout and fragment facts in the compatibility page plan', () => {
      const schema = makeSchema({ mode: 'fixed' }, [makeNode('committed')])

      const plan = createPagePlan(schema)

      expect(plan.pages[0]!.fragments).toHaveLength(1)
      expect(plan.pages[0]!.fragments![0]).toMatchObject({
        node: { id: 'committed' },
        layoutPlan: { nodeId: 'committed' },
        fragmentPlan: {
          sourceNodeId: 'committed',
          consumedRange: { startBlockOffset: 0, endBlockOffset: 50 },
        },
      })
    })

    it('creates empty page plan for no elements', () => {
      const schema = makeSchema({ mode: 'fixed' })
      const plan = createPagePlan(schema)
      expect(plan.pages).toHaveLength(1)
      expect(plan.pages[0]!.elements).toHaveLength(0)
    })

    it('uses pageModel paper dimensions when provided', () => {
      const schema = makeSchema({
        mode: 'fixed',
        pageModel: { kind: 'paged-paper', paper: { width: 90, height: 110 } },
      })

      const plan = createPagePlan(schema)

      expect(plan.pages[0]!.width).toBe(90)
      expect(plan.pages[0]!.height).toBe(110)
    })

    it('replicates every-output-page nodes without using them to create page count', () => {
      const schema = makeSchema({
        mode: 'fixed',
        pages: 2,
        pageModel: { kind: 'paged-paper', paper: { width: 210, height: 297 } },
        pagination: { strategy: 'fixed-sheets', pageCount: 2 },
      }, [
        makeNode('content', { y: 20 }),
        makeNode('page-number', {
          type: 'page-number',
          y: 280,
          height: 10,
        }),
      ])

      const plan = createPagePlan(schema, repeatedPageNumberOptions())

      expect(plan.pages).toHaveLength(2)
      expect(plan.pages[0]!.elements.map(el => el.id)).toEqual(['content', 'page-number__p0'])
      expect(plan.pages[1]!.elements.map(el => el.id)).toEqual(['page-number__p1'])
      expect(plan.pages[1]!.elements[0]!.y).toBe(577)
    })

    it('keeps fixed sheets with only repeated overlays when blankPolicy removes blank pages', () => {
      const schema = makeSchema({
        mode: 'fixed',
        pages: 2,
        blankPolicy: 'remove',
        pageModel: { kind: 'paged-paper', paper: { width: 210, height: 297 } },
        pagination: { strategy: 'fixed-sheets', pageCount: 2 },
      }, [
        makeNode('page-number', {
          type: 'page-number',
          y: 280,
          height: 10,
        }),
      ])

      const plan = createPagePlan(schema, repeatedPageNumberOptions())

      expect(plan.pages).toHaveLength(2)
      expect(plan.pages[0]!.elements.map(el => el.id)).toEqual(['page-number__p0'])
      expect(plan.pages[1]!.elements.map(el => el.id)).toEqual(['page-number__p1'])
    })
  })

  describe('continuous paper mode', () => {
    it('creates single continuous page', () => {
      const schema = makeSchema(
        { mode: 'continuous' },
        [makeNode('a', { y: 0, height: 100 }), makeNode('b', { y: 200, height: 150 })],
      )
      const plan = createPagePlan(schema)
      expect(plan.mode).toBe('continuous')
      expect(plan.pages).toHaveLength(1)
      expect(plan.pages[0]!.height).toBe(350)
      expect(plan.pages[0]!.elements).toHaveLength(2)
    })

    it('uses page height as minimum', () => {
      const schema = makeSchema(
        { mode: 'continuous', height: 500 },
        [makeNode('a', { y: 0, height: 50 })],
      )
      const plan = createPagePlan(schema)
      expect(plan.pages[0]!.height).toBe(500)
    })

    it('preserves original trailing gap when continuous content grows', () => {
      const originalSchema = makeSchema(
        { mode: 'continuous', height: 200 },
        [makeNode('last', { y: 150, height: 30 })],
      )
      const measuredSchema = makeSchema(
        { mode: 'continuous', height: 200 },
        [makeNode('last', { y: 200, height: 30 })],
      )

      const plan = createPagePlan(measuredSchema, { originalSchema })

      expect(plan.pages[0]!.height).toBe(250)
    })
  })
})
