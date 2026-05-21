import type { DocumentSchema, MaterialNode } from '@easyink/schema'
import { describe, expect, it } from 'vitest'
import { createPagePlan } from './page-planner'

function makeNode(id: string, overrides: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id,
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    props: {},
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

describe('createPagePlan', () => {
  describe('fixed mode', () => {
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

  describe('label mode', () => {
    it('aggregates copies into sheets with replicated elements per cell', () => {
      const schema = makeSchema({
        mode: 'label',
        width: 68,
        height: 40,
        label: { columns: 3, gap: 2, rows: 2, rowGap: 4 },
        copies: 9,
      }, [makeNode('a', { x: 5, y: 5, width: 55, height: 20 })])

      const plan = createPagePlan(schema)

      expect(plan.mode).toBe('label')
      // perSheet = 3 * 2 = 6 → 9 copies → ceil(9/6) = 2 sheets
      expect(plan.pages).toHaveLength(2)

      const sheetWidth = 68 * 3 + 2 * 2
      const sheetHeight = 40 * 2 + 4 * 1
      expect(plan.pages[0]!.width).toBeCloseTo(sheetWidth, 5)
      expect(plan.pages[0]!.height).toBeCloseTo(sheetHeight, 5)

      // Sheet 0: 6 cells × 1 element = 6 elements
      expect(plan.pages[0]!.elements).toHaveLength(6)
      // Cell (col=1, row=0) → xOffset = 1 * (68 + 2) = 70, yOffset = 0
      expect(plan.pages[0]!.elements[1]!.x).toBeCloseTo(5 + 70, 5)
      expect(plan.pages[0]!.elements[1]!.y).toBeCloseTo(5, 5)
      // Cell (col=0, row=1) → xOffset = 0, yOffset = 1 * (40 + 4) = 44
      expect(plan.pages[0]!.elements[3]!.x).toBeCloseTo(5, 5)
      expect(plan.pages[0]!.elements[3]!.y).toBeCloseTo(5 + 44, 5)

      // Sheet 1: remaining 3 copies → 3 elements
      expect(plan.pages[1]!.elements).toHaveLength(3)
    })

    it('deep clones replicated elements so nested props are isolated', () => {
      const sourceElement = makeNode('a', {
        props: {
          style: {
            color: 'red',
          },
        },
      })
      const schema = makeSchema({
        mode: 'label',
        width: 80,
        height: 50,
        label: { columns: 2, rows: 1, gap: 0 },
        copies: 2,
      }, [sourceElement])

      const plan = createPagePlan(schema)
      const firstCopy = plan.pages[0]!.elements[0]!
      const secondCopy = plan.pages[0]!.elements[1]!
      const firstCopyStyle = firstCopy.props.style as { color: string }
      const secondCopyStyle = secondCopy.props.style as { color: string }
      const sourceStyle = sourceElement.props.style as { color: string }

      expect(firstCopy.props).not.toBe(sourceElement.props)
      expect(secondCopy.props).not.toBe(sourceElement.props)
      expect(firstCopyStyle).not.toBe(secondCopyStyle)

      firstCopyStyle.color = 'blue'

      expect(secondCopyStyle.color).toBe('red')
      expect(sourceStyle.color).toBe('red')
    })

    it('defaults to 1 column / 1 row / 1 copy', () => {
      const schema = makeSchema({ mode: 'label', width: 80, height: 50 }, [makeNode('a')])
      const plan = createPagePlan(schema)
      expect(plan.pages).toHaveLength(1)
      expect(plan.pages[0]!.width).toBe(80)
      expect(plan.pages[0]!.height).toBe(50)
      expect(plan.pages[0]!.elements).toHaveLength(1)
    })
  })
})
