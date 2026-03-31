import type { MaterialNode } from '@easyink/core'
import type { MaterialRenderContext } from '../../types'
import { DataResolver } from '@easyink/core'
import { describe, expect, it } from 'vitest'
import { registerBuiltinRenderers } from '../builtins'
import { renderBarcode } from '../elements/barcode'
import { renderDataTable } from '../elements/data-table'
import { renderImage } from '../elements/image'
import { renderLine } from '../elements/line'
import { renderRect } from '../elements/rect'
import { renderTable } from '../elements/table'
import { renderText } from '../elements/text'
import { MaterialRendererRegistry } from '../renderer-registry'

function createNode(overrides: Partial<MaterialNode>): MaterialNode {
  return {
    id: 'test-1',
    type: 'text',
    layout: { position: 'absolute', x: 0, y: 0, width: 100, height: 30 },
    props: {},
    style: {},
    ...overrides,
  }
}

function createContext(overrides?: Partial<MaterialRenderContext>): MaterialRenderContext {
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
    expect(el.dataset.materialId).toBe('test-1')
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

// ─── DataTable ───

describe('renderDataTable', () => {
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
    const el = renderDataTable(
      createNode({ type: 'data-table', props: { columns } }),
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
    const el = renderDataTable(
      createNode({ type: 'data-table', props: { columns, bordered: true } }),
      createContext({ data }),
    )
    const table = el.querySelector('table')
    expect(table!.style.border).toContain('1px solid')
  })

  it('should apply striped style', () => {
    const el = renderDataTable(
      createNode({ type: 'data-table', props: { columns, striped: true } }),
      createContext({ data }),
    )
    const rows = el.querySelectorAll('tbody tr') as NodeListOf<HTMLElement>
    expect(rows[0].style.backgroundColor).toBe('')
    expect(rows[1].style.backgroundColor).toBe('#f9f9f9')
  })

  it('should throw on different data source prefixes', () => {
    const badColumns = [
      { key: 'a', title: 'A', width: 50, binding: { path: 'items.name' } },
      { key: 'b', title: 'B', width: 50, binding: { path: 'other.qty' } },
    ]
    expect(() => {
      renderDataTable(
        createNode({ type: 'data-table', props: { columns: badColumns } }),
        createContext({ data: { items: [{ name: 'x' }], other: [{ qty: 1 }] } }),
      )
    }).toThrow(/same data source prefix/)
  })

  it('should treat non-array binding as empty', () => {
    const el = renderDataTable(
      createNode({ type: 'data-table', props: { columns: [{ key: 'a', title: 'A', width: 100, binding: { path: 'scalar' } }] } }),
      createContext({ data: { scalar: 'not-an-array' } }),
    )
    const tds = el.querySelectorAll('tbody td')
    expect(tds.length).toBe(0)
  })

  it('should return empty wrapper when no columns', () => {
    const el = renderDataTable(
      createNode({ type: 'data-table', props: { columns: [] } }),
      createContext(),
    )
    expect(el.querySelector('table')).toBeNull()
  })

  it('should render placeholder rows in designMode', () => {
    const el = renderDataTable(
      createNode({ type: 'data-table', props: { columns } }),
      createContext({ designMode: true }),
    )
    const rows = el.querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)
    const tds = el.querySelectorAll('tbody td')
    expect(tds[0].textContent).toBe('{{items.name}}')
    expect((tds[0] as HTMLElement).style.color).toBe('#999')
  })

  it('should hide header when showHeader is false', () => {
    const el = renderDataTable(
      createNode({ type: 'data-table', props: { columns, showHeader: false } }),
      createContext({ data }),
    )
    const thead = el.querySelector('thead')
    expect(thead).toBeNull()
  })
})

// ─── Table (Static) ───

describe('renderTable', () => {
  const columns = [
    { title: '项目', width: 50, align: 'left' as const },
    { title: '值', width: 50, align: 'right' as const },
  ]

  it('should render static table with header and cells', () => {
    const el = renderTable(
      createNode({
        type: 'table',
        props: {
          columns,
          rowCount: 2,
          cells: {
            '0-0': { value: '姓名' },
            '0-1': { value: '张三' },
            '1-0': { value: '年龄' },
            '1-1': { value: '25' },
          },
        },
      }),
      createContext(),
    )
    const ths = el.querySelectorAll('th')
    expect(ths.length).toBe(2)
    expect(ths[0].textContent).toBe('项目')

    const tds = el.querySelectorAll('tbody td')
    expect(tds.length).toBe(4)
    expect(tds[0].textContent).toBe('姓名')
    expect(tds[1].textContent).toBe('张三')
    expect(tds[2].textContent).toBe('年龄')
    expect(tds[3].textContent).toBe('25')
  })

  it('should handle empty cells in sparse model', () => {
    const el = renderTable(
      createNode({
        type: 'table',
        props: {
          columns,
          rowCount: 1,
          cells: {
            '0-0': { value: '仅第一列' },
          },
        },
      }),
      createContext(),
    )
    const tds = el.querySelectorAll('tbody td')
    expect(tds.length).toBe(2)
    expect(tds[0].textContent).toBe('仅第一列')
    expect(tds[1].textContent).toBe('')
  })

  it('should apply bordered with custom borderStyle', () => {
    const el = renderTable(
      createNode({
        type: 'table',
        props: { columns, rowCount: 1, cells: {}, bordered: true, borderStyle: 'dashed' },
      }),
      createContext(),
    )
    const table = el.querySelector('table')
    expect(table!.style.border).toBe('1px dashed #000')
  })

  it('should handle colspan', () => {
    const el = renderTable(
      createNode({
        type: 'table',
        props: {
          columns,
          rowCount: 1,
          cells: {
            '0-0': { value: '合并单元格', colspan: 2 },
          },
        },
      }),
      createContext(),
    )
    const tds = el.querySelectorAll('tbody td')
    expect(tds.length).toBe(1) // second cell covered by colspan
    expect((tds[0] as HTMLTableCellElement).colSpan).toBe(2)
    expect(tds[0].textContent).toBe('合并单元格')
  })

  it('should handle rowspan', () => {
    const el = renderTable(
      createNode({
        type: 'table',
        props: {
          columns,
          rowCount: 2,
          cells: {
            '0-0': { value: '跨行', rowspan: 2 },
            '0-1': { value: 'A' },
            '1-1': { value: 'B' },
          },
        },
      }),
      createContext(),
    )
    const rows = el.querySelectorAll('tbody tr')
    expect(rows.length).toBe(2)
    // First row: 2 tds (one with rowspan)
    expect(rows[0].querySelectorAll('td').length).toBe(2)
    expect((rows[0].querySelector('td') as HTMLTableCellElement).rowSpan).toBe(2)
    // Second row: 1 td (first column covered by rowspan)
    expect(rows[1].querySelectorAll('td').length).toBe(1)
  })

  it('should resolve bound cell content', () => {
    const el = renderTable(
      createNode({
        type: 'table',
        props: {
          columns,
          rowCount: 1,
          cells: {
            '0-0': { value: '', binding: { path: 'name' } },
            '0-1': { value: 'static' },
          },
        },
      }),
      createContext({ data: { name: '李四' } }),
    )
    const tds = el.querySelectorAll('tbody td')
    expect(tds[0].textContent).toBe('李四')
    expect(tds[1].textContent).toBe('static')
  })

  it('should show binding placeholder in designMode', () => {
    const el = renderTable(
      createNode({
        type: 'table',
        props: {
          columns,
          rowCount: 1,
          cells: {
            '0-0': { value: '', binding: { path: 'name' } },
            '0-1': { value: 'static' },
          },
        },
      }),
      createContext({ designMode: true }),
    )
    const tds = el.querySelectorAll('tbody td') as NodeListOf<HTMLElement>
    expect(tds[0].textContent).toBe('{{name}}')
    expect(tds[0].style.color).toBe('#999')
    expect(tds[1].textContent).toBe('static')
  })

  it('should return empty wrapper when no columns', () => {
    const el = renderTable(
      createNode({ type: 'table', props: { columns: [], rowCount: 0, cells: {} } }),
      createContext(),
    )
    expect(el.querySelector('table')).toBeNull()
  })

  it('should return empty wrapper when rowCount is 0', () => {
    const el = renderTable(
      createNode({ type: 'table', props: { columns, rowCount: 0, cells: {} } }),
      createContext(),
    )
    expect(el.querySelector('table')).toBeNull()
  })
})

// ─── DesignMode: Text, Image, Barcode ───

describe('designMode placeholders', () => {
  it('text should show binding placeholder', () => {
    const el = renderText(
      createNode({ type: 'text', props: { content: '' }, binding: { path: 'order.name' } }),
      createContext({ designMode: true }),
    )
    expect(el.textContent).toBe('{{order.name}}')
    expect(el.style.color).toBe('#999')
  })

  it('image should show placeholder div in designMode', () => {
    const el = renderImage(
      createNode({ type: 'image', props: { src: '', fit: 'cover' }, binding: { path: 'logo' } }),
      createContext({ designMode: true }),
    )
    // Should NOT have an img tag in design mode
    const img = el.querySelector('img')
    expect(img).toBeNull()
    expect(el.textContent).toContain('{{logo}}')
  })

  it('barcode should show binding placeholder', () => {
    const el = renderBarcode(
      createNode({ type: 'barcode', props: { format: 'QR', value: '' }, binding: { path: 'code' } }),
      createContext({ designMode: true }),
    )
    expect(el.dataset.barcodeValue).toBe('{{code}}')
  })
})

// ─── Builtins Registration ───

describe('registerBuiltinRenderers', () => {
  it('should register all 7 built-in material renderers', () => {
    const registry = new MaterialRendererRegistry()
    registerBuiltinRenderers(registry)
    expect(registry.has('barcode')).toBe(true)
    expect(registry.has('data-table')).toBe(true)
    expect(registry.has('image')).toBe(true)
    expect(registry.has('line')).toBe(true)
    expect(registry.has('rect')).toBe(true)
    expect(registry.has('table')).toBe(true)
    expect(registry.has('text')).toBe(true)
  })
})
