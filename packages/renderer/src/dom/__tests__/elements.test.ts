import type { ElementNode } from '@easyink/core'
import type { ElementRenderContext } from '../../types'
import { DataResolver } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { registerBuiltinRenderers } from '../builtins'
import { ElementRenderRegistry } from '../element-registry'
import { renderBarcode } from '../elements/barcode'
import { renderImage } from '../elements/image'
import { renderLine } from '../elements/line'
import { renderRect } from '../elements/rect'
import { renderTable } from '../elements/table'
import { renderText } from '../elements/text'

function createNode(overrides: Partial<ElementNode>): ElementNode {
  return {
    id: 'test-1',
    type: 'text',
    layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 30 },
    props: {},
    style: {},
    ...overrides,
  }
}

function createContext(overrides?: Partial<ElementRenderContext>): ElementRenderContext {
  const resolver = new DataResolver()
  return {
    data: {},
    resolver,
    unit: 'mm',
    dpi: 96,
    zoom: 1,
    toPixels: (v: number) => v * (96 / 25.4),
    computedLayout: { x: 0, y: 0, width: 100, height: 30, boundingBox: { x: 0, y: 0, width: 100, height: 30 }, needsMeasure: false },
    renderChild: () => document.createElement('div'),
    ...overrides,
  }
}

// ─── Rect ───

describe('renderRect', () => {
  it('should create a div with rect class', () => {
    const el = renderRect(createNode({ type: 'rect', props: {} }), createContext())
    expect(el.tagName).toBe('DIV')
    expect(el.className).toContain('easyink-rect')
    expect(el.dataset.elementId).toBe('test-1')
  })

  it('should apply fill color', () => {
    const el = renderRect(createNode({ type: 'rect', props: { fill: '#ff0000' } }), createContext())
    expect(el.style.backgroundColor).toBe('#ff0000')
  })

  it('should apply numeric borderRadius', () => {
    const el = renderRect(createNode({ type: 'rect', props: { borderRadius: 10 } }), createContext())
    expect(el.style.borderRadius).toBe('10px')
  })

  it('should apply array borderRadius', () => {
    const el = renderRect(createNode({ type: 'rect', props: { borderRadius: [5, 10, 15, 20] } }), createContext())
    expect(el.style.borderRadius).toBe('5px 10px 15px 20px')
  })
})

// ─── Line ───

describe('renderLine', () => {
  it('should render horizontal line with border-top', () => {
    const el = renderLine(
      createNode({ type: 'line', props: { direction: 'horizontal', strokeWidth: 1, strokeColor: '#000', strokeStyle: 'solid' } }),
      createContext(),
    )
    expect(el.className).toContain('easyink-line')
    expect(Number.parseFloat(el.style.height)).toBe(0)
    expect(el.style.borderTopStyle).toBe('solid')
    expect(el.style.borderTopColor).toBe('#000')
  })

  it('should render vertical line with border-left', () => {
    const el = renderLine(
      createNode({ type: 'line', props: { direction: 'vertical', strokeWidth: 2, strokeColor: 'red', strokeStyle: 'dashed' } }),
      createContext(),
    )
    expect(Number.parseFloat(el.style.width)).toBe(0)
    expect(el.style.borderLeftStyle).toBe('dashed')
  })

  it('should render custom line with SVG', () => {
    const el = renderLine(
      createNode({ type: 'line', props: { direction: 'custom', strokeWidth: 1, strokeColor: '#000', strokeStyle: 'solid', endX: 100, endY: 50 } }),
      createContext(),
    )
    expect(el.className).toContain('easyink-line--custom')
    const svg = el.querySelector('svg')
    expect(svg).not.toBeNull()
    const line = el.querySelector('line')
    expect(line).not.toBeNull()
    expect(line!.getAttribute('stroke')).toBe('#000')
  })
})

// ─── Text ───

describe('renderText', () => {
  it('should render static text content', () => {
    const el = renderText(
      createNode({ type: 'text', props: { content: 'Hello World' } }),
      createContext(),
    )
    expect(el.textContent).toBe('Hello World')
    expect(el.className).toContain('easyink-text')
  })

  it('should resolve bound data', () => {
    const el = renderText(
      createNode({ type: 'text', props: { content: '' }, binding: { path: 'name' } }),
      createContext({ data: { name: 'John' } }),
    )
    expect(el.textContent).toBe('John')
  })

  it('should degrade array to comma-joined string', () => {
    const el = renderText(
      createNode({ type: 'text', props: { content: '' }, binding: { path: 'items.name' } }),
      createContext({ data: { items: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] } }),
    )
    expect(el.textContent).toBe('A, B, C')
  })

  it('should apply verticalAlign middle', () => {
    const el = renderText(
      createNode({ type: 'text', props: { content: 'X', verticalAlign: 'middle' } }),
      createContext(),
    )
    expect(el.style.display).toBe('flex')
    expect(el.style.alignItems).toBe('center')
  })

  it('should apply ellipsis overflow', () => {
    const el = renderText(
      createNode({ type: 'text', props: { content: 'Long text', overflow: 'ellipsis' } }),
      createContext(),
    )
    expect(el.style.overflow).toBe('hidden')
    expect(el.style.textOverflow).toBe('ellipsis')
    expect(el.style.whiteSpace).toBe('nowrap')
  })

  it('should fallback to static content when binding resolves undefined', () => {
    const el = renderText(
      createNode({ type: 'text', props: { content: 'fallback' }, binding: { path: 'missing' } }),
      createContext({ data: {} }),
    )
    expect(el.textContent).toBe('fallback')
  })
})

// ─── Image ───

describe('renderImage', () => {
  it('should render img inside wrapper', () => {
    const el = renderImage(
      createNode({ type: 'image', props: { src: 'https://example.com/img.png', fit: 'cover' } }),
      createContext(),
    )
    expect(el.className).toContain('easyink-image')
    const img = el.querySelector('img')
    expect(img).not.toBeNull()
    expect(img!.src).toContain('example.com/img.png')
    expect(img!.style.objectFit).toBe('cover')
  })

  it('should resolve bound image src', () => {
    const el = renderImage(
      createNode({ type: 'image', props: { src: '', fit: 'contain' }, binding: { path: 'logo' } }),
      createContext({ data: { logo: 'https://cdn.example.com/logo.png' } }),
    )
    const img = el.querySelector('img')
    expect(img!.src).toContain('cdn.example.com/logo.png')
  })

  it('should set alt text', () => {
    const el = renderImage(
      createNode({ type: 'image', props: { src: 'x.png', fit: 'fill', alt: 'photo' } }),
      createContext(),
    )
    const img = el.querySelector('img')
    expect(img!.alt).toBe('photo')
  })
})

// ─── Barcode ───

describe('renderBarcode', () => {
  it('should render placeholder with format and value', () => {
    const el = renderBarcode(
      createNode({ type: 'barcode', props: { format: 'QR', value: '12345' } }),
      createContext(),
    )
    expect(el.className).toContain('easyink-barcode')
    expect(el.dataset.barcodeFormat).toBe('QR')
    expect(el.dataset.barcodeValue).toBe('12345')
    expect(el.textContent).toContain('[QR]')
    expect(el.textContent).toContain('12345')
  })

  it('should resolve bound barcode value', () => {
    const el = renderBarcode(
      createNode({ type: 'barcode', props: { format: 'CODE128', value: '' }, binding: { path: 'orderNo' } }),
      createContext({ data: { orderNo: 'ORD-001' } }),
    )
    expect(el.dataset.barcodeValue).toBe('ORD-001')
  })

  it('should hide value when displayValue is false', () => {
    const el = renderBarcode(
      createNode({ type: 'barcode', props: { format: 'CODE128', value: '123', displayValue: false } }),
      createContext(),
    )
    // Should only contain format label, not the value
    expect(el.children.length).toBe(1)
    expect(el.textContent).toBe('[CODE128]')
  })
})

// ─── Table ───

describe('renderTable', () => {
  const columns = [
    { key: 'name', title: '商品', width: 60, binding: { path: 'items.name' } },
    { key: 'qty', title: '数量', width: 40, align: 'right' as const, binding: { path: 'items.qty' } },
  ]
  const data = {
    items: [
      { name: '商品A', qty: 2 },
      { name: '商品B', qty: 5 },
      { name: '商品C', qty: 1 },
    ],
  }

  it('should render table with header and data rows', () => {
    const el = renderTable(
      createNode({ type: 'table', props: { columns } }),
      createContext({ data }),
    )
    const table = el.querySelector('table')
    expect(table).not.toBeNull()
    const ths = el.querySelectorAll('th')
    expect(ths.length).toBe(2)
    expect(ths[0].textContent).toBe('商品')
    expect(ths[1].textContent).toBe('数量')

    const tds = el.querySelectorAll('tbody td')
    expect(tds.length).toBe(6) // 3 rows x 2 cols
    expect(tds[0].textContent).toBe('商品A')
    expect(tds[1].textContent).toBe('2')
  })

  it('should apply bordered style', () => {
    const el = renderTable(
      createNode({ type: 'table', props: { columns, bordered: true } }),
      createContext({ data }),
    )
    const table = el.querySelector('table')
    expect(table!.style.border).toContain('1px solid')
  })

  it('should apply striped style', () => {
    const el = renderTable(
      createNode({ type: 'table', props: { columns, striped: true } }),
      createContext({ data }),
    )
    const rows = el.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>
    // 第一行无 background
    expect(rows[0].style.backgroundColor).toBe('')
    // 第二行（index 1）有 striped background
    expect(rows[1].style.backgroundColor).toBe('#f9f9f9')
  })

  it('should show placeholder when no data', () => {
    const el = renderTable(
      createNode({ type: 'table', props: { columns: [{ key: 'a', title: 'A', width: 100, binding: { path: 'empty.a' } }], emptyBehavior: 'placeholder', emptyText: '无数据' } }),
      createContext({ data: { empty: [] } }),
    )
    const td = el.querySelector('tbody td')
    expect(td!.textContent).toBe('无数据')
  })

  it('should collapse when emptyBehavior is collapse', () => {
    const el = renderTable(
      createNode({ type: 'table', props: { columns: [{ key: 'a', title: 'A', width: 100, binding: { path: 'empty.a' } }], emptyBehavior: 'collapse' } }),
      createContext({ data: { empty: [] } }),
    )
    const tbodyRows = el.querySelectorAll('tbody tr')
    expect(tbodyRows.length).toBe(0)
  })

  it('should throw on different data source prefixes', () => {
    const badColumns = [
      { key: 'a', title: 'A', width: 50, binding: { path: 'items.name' } },
      { key: 'b', title: 'B', width: 50, binding: { path: 'other.qty' } },
    ]
    expect(() => {
      renderTable(
        createNode({ type: 'table', props: { columns: badColumns } }),
        createContext({ data: { items: [{ name: 'x' }], other: [{ qty: 1 }] } }),
      )
    }).toThrow(/same data source prefix/)
  })

  it('should treat non-array binding as empty column', () => {
    const badColumns = [
      { key: 'a', title: 'A', width: 100, binding: { path: 'scalar' } },
    ]
    const el = renderTable(
      createNode({ type: 'table', props: { columns: badColumns } }),
      createContext({ data: { scalar: 'not-an-array' } }),
    )
    const tbody = el.querySelector('tbody')!
    // 无数据行，显示空状态占位
    expect(tbody.querySelector('td')!.textContent).toBe('暂无数据')
  })

  it('should render summary row with aggregate', () => {
    const el = renderTable(
      createNode({
        type: 'table',
        props: {
          columns,
          summary: {
            cells: [
              { columnKey: 'name', text: '合计' },
              { columnKey: 'qty', aggregate: 'sum' },
            ],
          },
        },
      }),
      createContext({ data }),
    )
    const footCells = el.querySelectorAll('tfoot td')
    expect(footCells.length).toBe(2)
    expect(footCells[0].textContent).toBe('合计')
    expect(footCells[1].textContent).toBe('8') // 2 + 5 + 1
  })

  it('should return empty wrapper when no columns', () => {
    const el = renderTable(
      createNode({ type: 'table', props: { columns: [] } }),
      createContext(),
    )
    expect(el.querySelector('table')).toBeNull()
  })
})

// ─── Builtins Registration ───

describe('registerBuiltinRenderers', () => {
  it('should register all 6 built-in element renderers', () => {
    const registry = new ElementRenderRegistry()
    registerBuiltinRenderers(registry)
    expect(registry.has('barcode')).toBe(true)
    expect(registry.has('image')).toBe(true)
    expect(registry.has('line')).toBe(true)
    expect(registry.has('rect')).toBe(true)
    expect(registry.has('table')).toBe(true)
    expect(registry.has('text')).toBe(true)
  })
})
