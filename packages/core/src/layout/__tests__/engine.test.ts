import type { ElementNode, PageSettings, TemplateSchema } from '../../schema'
import type { ContentArea } from '../types'
import { describe, expect, it } from 'vitest'
import { createDefaultSchema } from '../../schema'
import { LayoutEngine } from '../engine'
import { PAPER_SIZES } from '../types'

// ── 辅助函数 ──

function createElement(overrides?: Partial<ElementNode>): ElementNode {
  return {
    id: `el-${Math.random().toString(36).slice(2, 8)}`,
    type: 'text',
    layout: { position: 'absolute', width: 100, height: 30 },
    props: { content: 'hello' },
    style: {},
    ...overrides,
  }
}

function createFlowElement(overrides?: Partial<ElementNode>): ElementNode {
  return createElement({
    layout: { position: 'flow', width: 'auto', height: 'auto' },
    ...overrides,
  })
}

function createSchemaWithElements(
  elements: ElementNode[],
  page?: Partial<PageSettings>,
): TemplateSchema {
  const schema = createDefaultSchema()
  schema.elements = elements
  if (page)
    Object.assign(schema.page, page)
  return schema
}

function getContentArea(schema: TemplateSchema): ContentArea {
  const engine = new LayoutEngine()
  const dims = engine.resolvePageDimensions(schema.page)
  const m = schema.page.margins
  return {
    x: m.left,
    y: m.top,
    width: dims.width - m.left - m.right,
    height: dims.height - m.top - m.bottom,
  }
}

// ── PAPER_SIZES ──

describe('pAPER_SIZES', () => {
  it('should contain all standard paper presets', () => {
    const expected = [
      'A3',
      'A4',
      'A5',
      'A6',
      'B5',
      'Letter',
      'Legal',
    ]
    for (const name of expected) {
      expect(PAPER_SIZES[name]).toBeDefined()
      expect(PAPER_SIZES[name].width).toBeGreaterThan(0)
      expect(PAPER_SIZES[name].height).toBeGreaterThan(0)
    }
  })

  it('should have correct A4 dimensions in mm', () => {
    expect(PAPER_SIZES.A4).toEqual({ width: 210, height: 297 })
  })

  it('should store portrait dimensions (height > width)', () => {
    for (const [, size] of Object.entries(PAPER_SIZES)) {
      expect(size.height).toBeGreaterThan(size.width)
    }
  })
})

// ── resolvePageDimensions ──

describe('layoutEngine', () => {
  describe('resolvePageDimensions', () => {
    const engine = new LayoutEngine()

    it('should resolve A4 portrait', () => {
      const dims = engine.resolvePageDimensions({
        paper: 'A4',
        orientation: 'portrait',
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        unit: 'mm',
      })
      expect(dims).toEqual({ width: 210, height: 297 })
    })

    it('should resolve A4 landscape (swap width/height)', () => {
      const dims = engine.resolvePageDimensions({
        paper: 'A4',
        orientation: 'landscape',
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        unit: 'mm',
      })
      expect(dims).toEqual({ width: 297, height: 210 })
    })

    it('should resolve A3 portrait', () => {
      const dims = engine.resolvePageDimensions({
        paper: 'A3',
        orientation: 'portrait',
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        unit: 'mm',
      })
      expect(dims).toEqual({ width: 297, height: 420 })
    })

    it('should resolve custom paper', () => {
      const dims = engine.resolvePageDimensions({
        paper: { type: 'custom', width: 100, height: 200 },
        orientation: 'portrait',
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        unit: 'mm',
      })
      expect(dims).toEqual({ width: 100, height: 200 })
    })

    it('should resolve custom paper landscape', () => {
      const dims = engine.resolvePageDimensions({
        paper: { type: 'custom', width: 100, height: 200 },
        orientation: 'landscape',
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        unit: 'mm',
      })
      expect(dims).toEqual({ width: 200, height: 100 })
    })

    it('should resolve label paper', () => {
      const dims = engine.resolvePageDimensions({
        paper: { type: 'label', width: 50, height: 30 },
        orientation: 'portrait',
        margins: { top: 0, right: 0, bottom: 0, left: 0 },
        unit: 'mm',
      })
      expect(dims).toEqual({ width: 50, height: 30 })
    })

    it('should throw for unknown paper preset', () => {
      expect(() => {
        engine.resolvePageDimensions({
          paper: 'Unknown' as any,
          orientation: 'portrait',
          margins: { top: 0, right: 0, bottom: 0, left: 0 },
          unit: 'mm',
        })
      }).toThrow(TypeError)
    })

    it('should resolve all standard paper presets', () => {
      const presets = [
        'A3',
        'A4',
        'A5',
        'A6',
        'B5',
        'Letter',
        'Legal',
      ] as const
      for (const preset of presets) {
        const dims = engine.resolvePageDimensions({
          paper: preset,
          orientation: 'portrait',
          margins: { top: 0, right: 0, bottom: 0, left: 0 },
          unit: 'mm',
        })
        expect(dims.width).toBeGreaterThan(0)
        expect(dims.height).toBeGreaterThan(0)
      }
    })
  })

  // ── computeBoundingBox ──

  describe('computeBoundingBox', () => {
    const engine = new LayoutEngine()

    it('should return identity when no rotation', () => {
      const bb = engine.computeBoundingBox(10, 20, 100, 50)
      expect(bb).toEqual({ x: 10, y: 20, width: 100, height: 50 })
    })

    it('should return identity when rotation is 0', () => {
      const bb = engine.computeBoundingBox(10, 20, 100, 50, 0)
      expect(bb).toEqual({ x: 10, y: 20, width: 100, height: 50 })
    })

    it('should swap dimensions at 90 degrees', () => {
      const bb = engine.computeBoundingBox(0, 0, 100, 50, 90)
      expect(bb.width).toBeCloseTo(50, 5)
      expect(bb.height).toBeCloseTo(100, 5)
    })

    it('should preserve dimensions at 180 degrees', () => {
      const bb = engine.computeBoundingBox(0, 0, 100, 50, 180)
      expect(bb.width).toBeCloseTo(100, 5)
      expect(bb.height).toBeCloseTo(50, 5)
    })

    it('should expand bounding box at 45 degrees', () => {
      const bb = engine.computeBoundingBox(0, 0, 100, 50, 45)
      // 45° → newW = 100*cos(45)+50*sin(45) ≈ 106.07
      //        newH = 100*sin(45)+50*cos(45) ≈ 106.07
      expect(bb.width).toBeGreaterThan(100)
      expect(bb.height).toBeGreaterThan(50)
    })

    it('should center bounding box around original center', () => {
      const x = 10
      const y = 20
      const w = 100
      const h = 50
      const bb = engine.computeBoundingBox(x, y, w, h, 45)
      const originalCx = x + w / 2
      const originalCy = y + h / 2
      const bbCx = bb.x + bb.width / 2
      const bbCy = bb.y + bb.height / 2
      expect(bbCx).toBeCloseTo(originalCx, 5)
      expect(bbCy).toBeCloseTo(originalCy, 5)
    })

    it('should handle 270 degrees (same as 90)', () => {
      const bb90 = engine.computeBoundingBox(0, 0, 100, 50, 90)
      const bb270 = engine.computeBoundingBox(0, 0, 100, 50, 270)
      expect(bb270.width).toBeCloseTo(bb90.width, 5)
      expect(bb270.height).toBeCloseTo(bb90.height, 5)
    })

    it('should handle 360 degrees (identity)', () => {
      const bb = engine.computeBoundingBox(10, 20, 100, 50, 360)
      expect(bb.width).toBeCloseTo(100, 5)
      expect(bb.height).toBeCloseTo(50, 5)
    })
  })

  // ── calculate — 绝对定位 ──

  describe('calculate - absolute positioning', () => {
    const engine = new LayoutEngine()

    it('should use declared x/y for absolute elements', () => {
      const el = createElement({
        id: 'abs1',
        layout: { position: 'absolute', x: 50, y: 80, width: 100, height: 30 },
      })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      const computed = result.elements.get('abs1')!
      expect(computed.x).toBe(50)
      expect(computed.y).toBe(80)
      expect(computed.width).toBe(100)
      expect(computed.height).toBe(30)
      expect(computed.needsMeasure).toBe(false)
    })

    it('should default x/y to 0 when not specified', () => {
      const el = createElement({
        id: 'abs2',
        layout: { position: 'absolute', width: 100, height: 30 },
      })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      const computed = result.elements.get('abs2')!
      expect(computed.x).toBe(0)
      expect(computed.y).toBe(0)
    })

    it('should resolve auto width to contentArea width for absolute', () => {
      const el = createElement({
        id: 'abs3',
        layout: { position: 'absolute', x: 10, y: 10, width: 'auto', height: 30 },
      })
      const schema = createSchemaWithElements([el])
      const contentArea = getContentArea(schema)
      const result = engine.calculate(schema)

      const computed = result.elements.get('abs3')!
      expect(computed.width).toBe(contentArea.width)
      expect(computed.needsMeasure).toBe(true)
    })

    it('should resolve auto height with needsMeasure for absolute', () => {
      const el = createElement({
        id: 'abs4',
        layout: { position: 'absolute', x: 10, y: 10, width: 100, height: 'auto' },
      })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      const computed = result.elements.get('abs4')!
      expect(computed.height).toBe(30) // defaultFlowHeight
      expect(computed.needsMeasure).toBe(true)
    })

    it('should compute bounding box with rotation for absolute', () => {
      const el = createElement({
        id: 'abs5',
        layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 50, rotation: 90 },
      })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      const computed = result.elements.get('abs5')!
      expect(computed.boundingBox.width).toBeCloseTo(50, 5)
      expect(computed.boundingBox.height).toBeCloseTo(100, 5)
    })

    it('should not affect bodyContentHeight', () => {
      const el = createElement({
        id: 'abs6',
        layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 200 },
      })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      expect(result.bodyContentHeight).toBe(0)
    })
  })

  // ── calculate — 流式布局 ──

  describe('calculate - flow layout', () => {
    const engine = new LayoutEngine()

    it('should stack flow elements vertically starting from contentArea.y', () => {
      const el1 = createFlowElement({
        id: 'flow1',
        layout: { position: 'flow', width: 'auto', height: 40 },
      })
      const el2 = createFlowElement({
        id: 'flow2',
        layout: { position: 'flow', width: 'auto', height: 60 },
      })
      const schema = createSchemaWithElements([
        el1,
        el2,
      ])
      const contentArea = getContentArea(schema)
      const result = engine.calculate(schema)

      const c1 = result.elements.get('flow1')!
      const c2 = result.elements.get('flow2')!

      expect(c1.x).toBe(contentArea.x)
      expect(c1.y).toBe(contentArea.y)
      expect(c1.height).toBe(40)

      expect(c2.x).toBe(contentArea.x)
      expect(c2.y).toBe(contentArea.y + 40)
      expect(c2.height).toBe(60)
    })

    it('should resolve auto width to contentArea width', () => {
      const el = createFlowElement({
        id: 'flow3',
        layout: { position: 'flow', width: 'auto', height: 30 },
      })
      const schema = createSchemaWithElements([el])
      const contentArea = getContentArea(schema)
      const result = engine.calculate(schema)

      expect(result.elements.get('flow3')!.width).toBe(contentArea.width)
    })

    it('should use explicit width when specified', () => {
      const el = createFlowElement({
        id: 'flow4',
        layout: { position: 'flow', width: 150, height: 30 },
      })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      expect(result.elements.get('flow4')!.width).toBe(150)
    })

    it('should resolve auto height with needsMeasure', () => {
      const el = createFlowElement({ id: 'flow5' })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      const computed = result.elements.get('flow5')!
      expect(computed.height).toBe(30) // defaultFlowHeight
      expect(computed.needsMeasure).toBe(true)
    })

    it('should not set needsMeasure for explicit height', () => {
      const el = createFlowElement({
        id: 'flow6',
        layout: { position: 'flow', width: 'auto', height: 50 },
      })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      expect(result.elements.get('flow6')!.needsMeasure).toBe(false)
    })

    it('should calculate bodyContentHeight as sum of flow heights', () => {
      const schema = createSchemaWithElements([
        createFlowElement({
          id: 'f1',
          layout: { position: 'flow', width: 'auto', height: 40 },
        }),
        createFlowElement({
          id: 'f2',
          layout: { position: 'flow', width: 'auto', height: 60 },
        }),
      ])
      const result = engine.calculate(schema)

      expect(result.bodyContentHeight).toBe(100)
    })
  })

  // ── calculate — 混合布局 ──

  describe('calculate - mixed layout', () => {
    const engine = new LayoutEngine()

    it('should not affect flow cursor when absolute elements exist', () => {
      const absEl = createElement({
        id: 'abs',
        layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 200 },
      })
      const flowEl = createFlowElement({
        id: 'flow',
        layout: { position: 'flow', width: 'auto', height: 50 },
      })
      const schema = createSchemaWithElements([absEl, flowEl])
      const contentArea = getContentArea(schema)
      const result = engine.calculate(schema)

      // flow element should start at contentArea.y, not after absolute
      expect(result.elements.get('flow')!.y).toBe(contentArea.y)
      expect(result.bodyContentHeight).toBe(50)
    })

    it('should interleave absolute and flow correctly', () => {
      const schema = createSchemaWithElements([
        createFlowElement({
          id: 'f1',
          layout: { position: 'flow', width: 'auto', height: 30 },
        }),
        createElement({
          id: 'a1',
          layout: { position: 'absolute', x: 50, y: 50, width: 80, height: 80 },
        }),
        createFlowElement({
          id: 'f2',
          layout: { position: 'flow', width: 'auto', height: 40 },
        }),
      ])
      const contentArea = getContentArea(schema)
      const result = engine.calculate(schema)

      // f1 at contentArea.y
      expect(result.elements.get('f1')!.y).toBe(contentArea.y)
      // a1 at declared position
      expect(result.elements.get('a1')!.x).toBe(50)
      expect(result.elements.get('a1')!.y).toBe(50)
      // f2 stacks after f1
      expect(result.elements.get('f2')!.y).toBe(contentArea.y + 30)
      expect(result.bodyContentHeight).toBe(70)
    })
  })

  // ── calculate — hidden 元素 ──

  describe('calculate - hidden elements', () => {
    const engine = new LayoutEngine()

    it('should skip hidden elements', () => {
      const schema = createSchemaWithElements([
        createElement({ id: 'visible', layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 30 } }),
        createElement({ id: 'hidden1', hidden: true, layout: { position: 'absolute', x: 10, y: 10, width: 100, height: 30 } }),
      ])
      const result = engine.calculate(schema)

      expect(result.elements.has('visible')).toBe(true)
      expect(result.elements.has('hidden1')).toBe(false)
    })

    it('should not count hidden flow elements in bodyContentHeight', () => {
      const schema = createSchemaWithElements([
        createFlowElement({
          id: 'f1',
          layout: { position: 'flow', width: 'auto', height: 40 },
        }),
        createFlowElement({
          id: 'f2',
          layout: { position: 'flow', width: 'auto', height: 60 },
          hidden: true,
        }),
      ])
      const result = engine.calculate(schema)

      expect(result.bodyContentHeight).toBe(40)
      expect(result.elements.size).toBe(1)
    })

    it('should skip hidden children', () => {
      const parent = createElement({
        id: 'parent',
        layout: { position: 'absolute', x: 0, y: 0, width: 200, height: 100 },
        children: [
          createElement({
            id: 'child-visible',
            layout: { position: 'absolute', x: 10, y: 10, width: 50, height: 20 },
          }),
          createElement({
            id: 'child-hidden',
            layout: { position: 'absolute', x: 20, y: 20, width: 50, height: 20 },
            hidden: true,
          }),
        ],
      })
      const schema = createSchemaWithElements([parent])
      const result = engine.calculate(schema)

      expect(result.elements.has('child-visible')).toBe(true)
      expect(result.elements.has('child-hidden')).toBe(false)
    })
  })

  // ── calculate — 空数组 ──

  describe('calculate - empty elements', () => {
    const engine = new LayoutEngine()

    it('should return empty result for schema with no elements', () => {
      const schema = createDefaultSchema()
      const result = engine.calculate(schema)

      expect(result.elements.size).toBe(0)
      expect(result.bodyContentHeight).toBe(0)
    })
  })

  // ── calculate — children 递归 ──

  describe('calculate - children', () => {
    const engine = new LayoutEngine()

    it('should layout children relative to parent', () => {
      const parent = createElement({
        id: 'parent',
        layout: { position: 'absolute', x: 50, y: 100, width: 200, height: 150 },
        children: [
          createElement({
            id: 'child1',
            layout: { position: 'absolute', x: 10, y: 20, width: 80, height: 30 },
          }),
        ],
      })
      const schema = createSchemaWithElements([parent])
      const result = engine.calculate(schema)

      const child = result.elements.get('child1')!
      expect(child.x).toBe(60) // parent.x + child.x
      expect(child.y).toBe(120) // parent.y + child.y
      expect(child.width).toBe(80)
      expect(child.height).toBe(30)
    })

    it('should resolve auto width of child to parent width', () => {
      const parent = createElement({
        id: 'parent',
        layout: { position: 'absolute', x: 10, y: 10, width: 200, height: 100 },
        children: [
          createElement({
            id: 'child-auto-w',
            layout: { position: 'absolute', x: 0, y: 0, width: 'auto', height: 30 },
          }),
        ],
      })
      const schema = createSchemaWithElements([parent])
      const result = engine.calculate(schema)

      const child = result.elements.get('child-auto-w')!
      expect(child.width).toBe(200) // parent width
      expect(child.needsMeasure).toBe(true)
    })

    it('should compute bounding box for rotated children', () => {
      const parent = createElement({
        id: 'parent',
        layout: { position: 'absolute', x: 0, y: 0, width: 200, height: 200 },
        children: [
          createElement({
            id: 'rotated-child',
            layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 50, rotation: 90 },
          }),
        ],
      })
      const schema = createSchemaWithElements([parent])
      const result = engine.calculate(schema)

      const child = result.elements.get('rotated-child')!
      expect(child.boundingBox.width).toBeCloseTo(50, 5)
      expect(child.boundingBox.height).toBeCloseTo(100, 5)
    })
  })

  // ── resolveAutoHeight — Table 估算 ──

  describe('resolveAutoHeight', () => {
    const engine = new LayoutEngine()

    it('should estimate table height from data array length', () => {
      const table = createElement({
        id: 'table1',
        type: 'table',
        layout: { position: 'flow', width: 'auto', height: 'auto' },
        props: { rowHeight: 25 },
        binding: { path: 'items.name' },
      })
      const data = {
        items: [
          { name: 'A' },
          { name: 'B' },
          { name: 'C' },
        ],
      }
      const schema = createSchemaWithElements([table])
      const result = engine.calculate(schema, data)

      const computed = result.elements.get('table1')!
      // headerHeight(25) + 3 rows * 25 = 100
      expect(computed.height).toBe(100)
      expect(computed.needsMeasure).toBe(true)
    })

    it('should use flat key for data lookup', () => {
      const table = createElement({
        id: 'table2',
        type: 'table',
        layout: { position: 'flow', width: 'auto', height: 'auto' },
        props: { rowHeight: 20 },
        binding: { path: 'rows' },
      })
      const data = {
        rows: [
          { a: 1 },
          { a: 2 },
        ],
      }
      const schema = createSchemaWithElements([table])
      const result = engine.calculate(schema, data)

      const computed = result.elements.get('table2')!
      // header(20) + 2 * 20 = 60
      expect(computed.height).toBe(60)
    })

    it('should use defaultFlowHeight when rowHeight is auto', () => {
      const table = createElement({
        id: 'table3',
        type: 'table',
        layout: { position: 'flow', width: 'auto', height: 'auto' },
        props: { rowHeight: 'auto' },
        binding: { path: 'items' },
      })
      const data = { items: [{ x: 1 }, { x: 2 }] }
      const schema = createSchemaWithElements([table])
      const result = engine.calculate(schema, data)

      const computed = result.elements.get('table3')!
      // default 30: header(30) + 2 * 30 = 90
      expect(computed.height).toBe(90)
    })

    it('should use defaultFlowHeight when no data', () => {
      const table = createElement({
        id: 'table4',
        type: 'table',
        layout: { position: 'flow', width: 'auto', height: 'auto' },
        props: { rowHeight: 25 },
        binding: { path: 'items' },
      })
      const schema = createSchemaWithElements([table])
      const result = engine.calculate(schema)

      const computed = result.elements.get('table4')!
      expect(computed.height).toBe(30) // defaultFlowHeight
      expect(computed.needsMeasure).toBe(true)
    })

    it('should use defaultFlowHeight for non-table auto height', () => {
      const el = createFlowElement({ id: 'text1', type: 'text' })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      expect(result.elements.get('text1')!.height).toBe(30)
      expect(result.elements.get('text1')!.needsMeasure).toBe(true)
    })

    it('should use custom defaultFlowHeight from options', () => {
      const customEngine = new LayoutEngine({ defaultFlowHeight: 50 })
      const el = createFlowElement({ id: 'custom1', type: 'text' })
      const schema = createSchemaWithElements([el])
      const result = customEngine.calculate(schema)

      expect(result.elements.get('custom1')!.height).toBe(50)
    })

    it('should use defaultFlowHeight when data source is not an array', () => {
      const table = createElement({
        id: 'table5',
        type: 'table',
        layout: { position: 'flow', width: 'auto', height: 'auto' },
        props: { rowHeight: 25 },
        binding: { path: 'notArray' },
      })
      const data = { notArray: 'string value' }
      const schema = createSchemaWithElements([table])
      const result = engine.calculate(schema, data)

      expect(result.elements.get('table5')!.height).toBe(30)
    })
  })

  // ── calculate — 页边距 ──

  describe('calculate - margins', () => {
    const engine = new LayoutEngine()

    it('should respect page margins for flow element positioning', () => {
      const el = createFlowElement({
        id: 'margined',
        layout: { position: 'flow', width: 'auto', height: 50 },
      })
      const schema = createSchemaWithElements([el], {
        margins: { top: 20, right: 15, bottom: 20, left: 15 },
      })
      const result = engine.calculate(schema)

      const computed = result.elements.get('margined')!
      expect(computed.x).toBe(15) // margins.left
      expect(computed.y).toBe(20) // margins.top
      expect(computed.width).toBe(210 - 15 - 15) // A4 width - left - right
    })
  })

  // ── calculate — LayoutResult 结构 ──

  describe('calculate - LayoutResult structure', () => {
    const engine = new LayoutEngine()

    it('should return Map with all visible element IDs', () => {
      const schema = createSchemaWithElements([
        createElement({ id: 'a' }),
        createElement({ id: 'b' }),
        createElement({ id: 'c', hidden: true }),
      ])
      const result = engine.calculate(schema)

      expect(result.elements.size).toBe(2)
      expect(result.elements.has('a')).toBe(true)
      expect(result.elements.has('b')).toBe(true)
    })

    it('should include all ComputedLayout fields', () => {
      const schema = createSchemaWithElements([
        createElement({
          id: 'full',
          layout: { position: 'absolute', x: 10, y: 20, width: 100, height: 50, rotation: 45 },
        }),
      ])
      const result = engine.calculate(schema)
      const computed = result.elements.get('full')!

      expect(computed).toHaveProperty('x')
      expect(computed).toHaveProperty('y')
      expect(computed).toHaveProperty('width')
      expect(computed).toHaveProperty('height')
      expect(computed).toHaveProperty('boundingBox')
      expect(computed).toHaveProperty('needsMeasure')
      expect(computed.boundingBox).toHaveProperty('x')
      expect(computed.boundingBox).toHaveProperty('y')
      expect(computed.boundingBox).toHaveProperty('width')
      expect(computed.boundingBox).toHaveProperty('height')
    })
  })

  // ── constructor ──

  describe('constructor', () => {
    it('should use default options when none provided', () => {
      const engine = new LayoutEngine()
      const el = createFlowElement({ id: 'def1' })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      expect(result.elements.get('def1')!.height).toBe(30)
    })

    it('should accept custom defaultFlowHeight', () => {
      const engine = new LayoutEngine({ defaultFlowHeight: 100 })
      const el = createFlowElement({ id: 'custom-h' })
      const schema = createSchemaWithElements([el])
      const result = engine.calculate(schema)

      expect(result.elements.get('custom-h')!.height).toBe(100)
    })
  })

  // ── calculate — 复杂场景 ──

  describe('calculate - complex scenarios', () => {
    const engine = new LayoutEngine()

    it('should handle table with data + text above and below (flow stacking)', () => {
      const textAbove = createFlowElement({
        id: 'title',
        layout: { position: 'flow', width: 'auto', height: 20 },
      })
      const table = createElement({
        id: 'data-table',
        type: 'table',
        layout: { position: 'flow', width: 'auto', height: 'auto' },
        props: { rowHeight: 15 },
        binding: { path: 'orders' },
      })
      const textBelow = createFlowElement({
        id: 'footer-text',
        layout: { position: 'flow', width: 'auto', height: 20 },
      })
      const data = {
        orders: [
          { name: 'A' },
          { name: 'B' },
          { name: 'C' },
          { name: 'D' },
          { name: 'E' },
        ],
      }
      const schema = createSchemaWithElements([
        textAbove,
        table,
        textBelow,
      ])
      const contentArea = getContentArea(schema)
      const result = engine.calculate(schema, data)

      const t1 = result.elements.get('title')!
      const tbl = result.elements.get('data-table')!
      const t2 = result.elements.get('footer-text')!

      // title at top
      expect(t1.y).toBe(contentArea.y)

      // table after title
      expect(tbl.y).toBe(contentArea.y + 20)
      // table height = header(15) + 5 rows * 15 = 90
      expect(tbl.height).toBe(90)

      // footer text after table
      expect(t2.y).toBe(contentArea.y + 20 + 90)

      // total flow height
      expect(result.bodyContentHeight).toBe(20 + 90 + 20)
    })

    it('should handle absolute stamp over flow content', () => {
      const stamp = createElement({
        id: 'stamp',
        layout: { position: 'absolute', x: 120, y: 180, width: 60, height: 60, rotation: -15 },
      })
      const flowText = createFlowElement({
        id: 'content',
        layout: { position: 'flow', width: 'auto', height: 200 },
      })
      const schema = createSchemaWithElements([
        stamp,
        flowText,
      ])
      const contentArea = getContentArea(schema)
      const result = engine.calculate(schema)

      // Stamp at declared position
      expect(result.elements.get('stamp')!.x).toBe(120)
      expect(result.elements.get('stamp')!.y).toBe(180)

      // Flow content starts at contentArea.y (unaffected by stamp)
      expect(result.elements.get('content')!.y).toBe(contentArea.y)

      // Only flow contributes to bodyContentHeight
      expect(result.bodyContentHeight).toBe(200)
    })
  })
})
