import { describe, expect, it } from 'vitest'
import { assertValidTableModel, createTableModel } from './model'
import { decodeCanonicalBindingExpression, decodeTableModelV1 } from './model-codec'

describe('table model codec', () => {
  it('decodes the exact canonical binding format variants', () => {
    const base = { sourceId: 'source', fieldPath: 'value' }
    for (const format of [
      { prefix: '$', suffix: ' USD', fallback: '-', extensions: { owner: 'test' } },
      { mode: 'custom', custom: { source: '(value) => String(value)' } },
      { mode: 'preset', preset: { type: 'number', minimumFractionDigits: 1, maximumFractionDigits: 2 } },
    ]) {
      expect(decodeCanonicalBindingExpression({ ...base, format })).toEqual({ ...base, format })
    }
    for (const format of [
      { surprise: true },
      { mode: 'custom', custom: { source: 'x', surprise: true } },
      { mode: 'preset', preset: { type: 'number', minimumFractionDigits: 2, maximumFractionDigits: 1 } },
      { mode: 'unknown' },
    ]) {
      expect(decodeCanonicalBindingExpression({ ...base, format })).toBeUndefined()
    }
  })

  it.each([null, false, 0, 'model'])('rejects a non-record root: %j', (raw) => {
    expect(decodeTableModelV1(raw, '/model').issues).toContainEqual(expect.objectContaining({
      code: 'TABLE_MODEL_STRUCTURE_INVALID',
      path: '/model',
    }))
  })

  it('decodes a valid model into an independent strict JSON clone', () => {
    const model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 2 })
    const result = decodeTableModelV1(model, '/model')
    expect(result.issues).toEqual([])
    expect(result.value).toEqual(model)
    expect(result.value).not.toBe(model)
    expect(result.value!.columns).not.toBe(model.columns)
  })

  it('decodes the exact factory JSON-node boundary and preserves the factory rejection above it', () => {
    const boundary = createTableModel({ kind: 'static', columnCount: 1, rowCount: 9_998 })
    expect(() => assertValidTableModel(boundary)).not.toThrow()
    expect(decodeTableModelV1(boundary, '/model').issues).toEqual([])
    expect(() => createTableModel({ kind: 'static', columnCount: 1, rowCount: 9_999 })).toThrow(/budget/i)
  })

  it('accumulates stable exact structural paths', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    model.extra = true
    model.columns[0].track = { kind: 'fixed', size: -1, surprise: true }
    model.bands[0].rows[0].minHeight = Number.NaN
    model.bands[0].rows[0].cells[0].content = { kind: 'text', text: '', html: '<b>x</b>' }
    const paths = decodeTableModelV1(model, '/model').issues.map(issue => issue.path)
    expect(paths).toEqual(expect.arrayContaining([
      '/model/extra',
      '/model/columns/0/track/size',
      '/model/columns/0/track/surprise',
      '/model/bands/0/rows/0/minHeight',
      '/model/bands/0/rows/0/cells/0/content/html',
    ]))
  })

  it('rejects undefined, sparse arrays, nonplain records, accessors, cycles, and oversized ports', () => {
    const base = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    base.style.background = undefined
    expect(decodeTableModelV1(base, '/model').value).toBeUndefined()

    const sparse = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    sparse.columns = Array.from({ length: 1 })
    expect(decodeTableModelV1(sparse, '/model').issues[0]?.code).toBe('TABLE_MODEL_STRUCTURE_INVALID')

    const nonplain = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    nonplain.style = new Date()
    expect(decodeTableModelV1(nonplain, '/model').value).toBeUndefined()

    let reads = 0
    const accessor = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    Object.defineProperty(accessor.style, 'background', {
      enumerable: true,
      get: () => {
        reads += 1
        return 'red'
      },
    })
    expect(decodeTableModelV1(accessor, '/model').value).toBeUndefined()
    expect(reads).toBe(0)

    const cycle = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    cycle.style.loop = cycle
    expect(decodeTableModelV1(cycle, '/model').value).toBeUndefined()

    const port = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    port.bands[0].rows[0].cells[0].content.bindingPort = 'x'.repeat(129)
    expect(decodeTableModelV1(port, '/model').issues.map((issue: any) => issue.path))
      .toContain('/model/bands/0/rows/0/cells/0/content/bindingPort')
  })

  it('captures proxy descriptors once and escapes pointer tokens', () => {
    const source = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    source['a~/b'] = true
    const reads = new Map<PropertyKey, number>()
    const proxy = new Proxy(source, {
      getOwnPropertyDescriptor(target, key) {
        reads.set(key, (reads.get(key) ?? 0) + 1)
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    const result = decodeTableModelV1(proxy, '/model')
    expect(result.issues.map(issue => issue.path)).toContain('/model/a~0~1b')
    expect(reads.get('kind')).toBe(1)
  })

  it.each([
    ['track bound', (model: any) => { model.columns[0].track = { kind: 'fr', weight: 0 } }, '/model/columns/0/track/weight'],
    ['padding', (model: any) => { model.style.padding = { top: -1 } }, '/model/style/padding/top'],
    ['font', (model: any) => { model.style.typography = { fontSize: 0 } }, '/model/style/typography/fontSize'],
    ['border', (model: any) => { model.style.border = { blockStart: { width: -1, style: 'solid', color: '' } } }, '/model/style/border/blockStart/width'],
    ['cell id', (model: any) => { model.bands[0].rows[0].cells[0].id = 'bad id' }, '/model/bands/0/rows/0/cells/0/id'],
    ['accessibility', (model: any) => { model.accessibility = { decorative: 'yes' } }, '/model/accessibility/decorative'],
  ])('reports malformed %s at its exact path', (_name, mutate, expectedPath) => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    mutate(model)
    expect(decodeTableModelV1(model, '/model').issues.map(issue => issue.path)).toContain(expectedPath)
  })

  it('enforces data discriminants and canonical materials slots', () => {
    const staticModel = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    staticModel.data = { collectionPort: 'records' }
    expect(decodeTableModelV1(staticModel, '/model').issues.map(issue => issue.path)).toContain('/model/data')

    const dataModel = createTableModel({ kind: 'data', columnCount: 1, rowCount: 1 }) as any
    dataModel.data.collectionPort = 'bad port'
    dataModel.bands[0].rows[0].cells[0].content = { kind: 'materials', slotId: 'wrong' }
    const paths = decodeTableModelV1(dataModel, '/model').issues.map(issue => issue.path)
    expect(paths).toEqual(expect.arrayContaining([
      '/model/data/collectionPort',
      '/model/bands/0/rows/0/cells/0/content/slotId',
    ]))
  })

  it('bounds structural work and diagnostics for oversized exact records', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    model.style = Object.fromEntries(Array.from({ length: 110_000 }, (_, index) => [`unknown${index}`, true]))
    const result = decodeTableModelV1(model, '/model')
    expect(result.value).toBeUndefined()
    expect(result.issues.length).toBeLessThanOrEqual(256)
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'TABLE_MODEL_STRUCTURE_INVALID',
      message: expect.stringMatching(/budget/i),
    }))
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: 'TABLE_MODEL_STRUCTURE_INVALID',
      message: expect.stringMatching(/truncated/i),
    }))
  })

  it('rejects oversized proxy key sets before reading any property descriptor', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    const style = Object.fromEntries(Array.from({ length: 110_000 }, (_, index) => [`unknown${index}`, true]))
    let ownKeys = 0
    let descriptors = 0
    model.style = new Proxy(style, {
      ownKeys(target) {
        ownKeys += 1
        return Reflect.ownKeys(target)
      },
      getOwnPropertyDescriptor(target, key) {
        descriptors += 1
        return Reflect.getOwnPropertyDescriptor(target, key)
      },
    })
    const result = decodeTableModelV1(model, '/model')
    expect(result.value).toBeUndefined()
    expect(result.issues.length).toBeLessThanOrEqual(256)
    expect(result.issues).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/budget/i) }))
    expect(ownKeys).toBe(1)
    expect(descriptors).toBe(0)
  })

  it('allows one million text characters and rejects the next character', () => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    model.bands[0].rows[0].cells[0].content.text = 'x'.repeat(16_385)
    expect(decodeTableModelV1(model, '/model').issues).toEqual([])
    model.bands[0].rows[0].cells[0].content.text = 'x'.repeat(1_000_000)
    expect(decodeTableModelV1(model, '/model').issues).toEqual([])
    model.bands[0].rows[0].cells[0].content.text += 'x'
    expect(decodeTableModelV1(model, '/model').issues).toContainEqual(expect.objectContaining({
      path: '/model/bands/0/rows/0/cells/0/content/text',
    }))
  })

  it('keeps the aggregate JSON string-byte budget independent from the text field limit', () => {
    const model = createTableModel({ kind: 'static', columnCount: 2, rowCount: 1 })
    for (const cell of model.bands[0]!.rows[0]!.cells)
      cell.content = { kind: 'text', text: '\u8868'.repeat(800_000) }
    expect(decodeTableModelV1(model, '/model').issues).toContainEqual(expect.objectContaining({
      code: 'TABLE_MODEL_STRUCTURE_INVALID',
      message: expect.stringMatching(/string byte budget/i),
    }))
  })

  it.each(['fixed', 'fr'] as const)('anchors %s min/max inversions at max', (kind) => {
    const model = createTableModel({ kind: 'static', columnCount: 1, rowCount: 1 }) as any
    model.columns[0].track = kind === 'fixed'
      ? { kind, size: 1, min: 2, max: 1 }
      : { kind, weight: 1, min: 2, max: 1 }
    expect(decodeTableModelV1(model, '/model').issues).toContainEqual(expect.objectContaining({
      path: '/model/columns/0/track/max',
    }))
  })
})
