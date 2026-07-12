/**
 * @vitest-environment happy-dom
 */
import type { MaterialManifest, MaterialNodeCreateInput } from '@easyink/core'
import type { MaterialNode, PageSchema } from '@easyink/schema'
import { validateDocumentWithProfile } from '@easyink/core'
import { createTestMaterialManifest } from '@easyink/core/testing'
import { describe, expect, it, vi } from 'vitest'
import { createDesignerTestProfile } from '../testing/material-profile'
import { DATASOURCE_DRAG_MIME, MATERIAL_DRAG_MIME, useDesignerDragDrop } from './use-designer-drag-drop'

function createTextNode(partial?: Partial<MaterialNode>): MaterialNode
function createTextNode(partial?: MaterialNodeCreateInput): MaterialNode
function createTextNode(partial: Partial<MaterialNode> | MaterialNodeCreateInput = {}): MaterialNode {
  return {
    id: `text-${Math.random()}`,
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
    ...partial,
  } as MaterialNode
}

function makePage(overrides: Partial<PageSchema> = {}): PageSchema {
  return { mode: 'fixed', width: 500, height: 500, ...overrides }
}

const chartDataContract = {
  version: 3,
  model: {
    kind: 'tabular',
    fields: {
      category: { labelKey: 'materials.chartBar.data.category', type: 'string', required: true, format: 'display' },
      value: { labelKey: 'materials.chartBar.data.value', type: 'number', required: true, format: 'raw' },
    },
  },
} as const

function makePageEl() {
  const pageEl = document.createElement('div')
  pageEl.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    right: 500,
    bottom: 500,
    width: 500,
    height: 500,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  })
  document.body.appendChild(pageEl)
  return pageEl
}

function makeDragEvent(clientX: number, clientY: number, types: string[], data: Record<string, string> = {}) {
  const store = new Map(Object.entries(data))
  return {
    clientX,
    clientY,
    dataTransfer: {
      types,
      dropEffect: 'none',
      effectAllowed: 'none',
      setData: vi.fn((key: string, value: string) => store.set(key, value)),
      getData: vi.fn((key: string) => store.get(key) ?? ''),
      setDragImage: vi.fn(),
    },
    preventDefault: vi.fn(),
  } as unknown as DragEvent
}

function makePointerDown(clientX: number, clientY: number, pointerId = 1, currentTarget?: Element) {
  return {
    button: 0,
    pointerId,
    clientX,
    clientY,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    currentTarget,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as PointerEvent
}

function dispatchPointerEvent(type: string, clientX: number, clientY: number, pointerId = 1) {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    clientX: { value: clientX },
    clientY: { value: clientY },
  })
  window.dispatchEvent(event)
}

function makeStore(
  elements: MaterialNode[] = [],
  extension?: unknown,
  options: {
    textCreateDefaultNode?: (partial?: MaterialNodeCreateInput) => MaterialNode
    page?: PageSchema
    textDataContract?: unknown
    textDataContractPort?: string
    extraManifests?: readonly MaterialManifest[]
  } = {},
) {
  const textBinding = options.textDataContract
    ? {
        kind: 'ports' as const,
        dataContract: options.textDataContract as typeof chartDataContract,
        ports: [{ id: 'data', key: { kind: 'exact' as const, value: options.textDataContractPort ?? 'value' }, role: 'semantic' as const, valueShape: 'record-array' as const, formatEditor: false as const }],
      }
    : {
        kind: 'ports' as const,
        ports: [{ id: 'value', key: { kind: 'exact' as const, value: 'value' }, role: 'display' as const, valueShape: 'scalar' as const, modelPath: '/model/content' as const, formatEditor: { tabs: ['preset'] as const } }],
      }
  const textBase = createTestMaterialManifest({ type: 'text', binding: textBinding, designer: true })
  const lineBase = createTestMaterialManifest({ type: 'line', binding: { kind: 'none' }, designer: true })
  const profile = createDesignerTestProfile([
    { ...textBase, common: { ...textBase.common, defaultNode: { ...textBase.common.defaultNode, width: 100, height: 50 } } },
    { ...lineBase, common: { ...lineBase.common, defaultNode: { ...lineBase.common.defaultNode, width: 100, height: 1 } } },
    ...(options.extraManifests ?? []),
  ])
  const createNode = vi.fn((type: string, partial?: Parameters<typeof profile.createNode>[1]) => options.textCreateDefaultNode && type === 'text'
    ? options.textCreateDefaultNode(partial)
    : profile.createNode(type, partial))
  return {
    schema: { unit: 'px', page: options.page ?? makePage(), elements, groups: [] },
    workbench: { viewport: { zoom: 1, scrollLeft: 0, scrollTop: 0 } },
    commands: {
      execute: vi.fn((command: { execute: () => void }) => command.execute()),
    },
    selection: {
      clear: vi.fn(),
      selectMultiple: vi.fn(),
    },
    getElements: () => elements,
    getElementSize: (node: MaterialNode) => ({ width: node.width, height: node.height }),
    materialProfile: { ...profile, createNode },
    getMaterialManifest: (type: string) => profile.getManifest(type),
    t: (key: string) => key,
    peekDesignerFacet: () => extension ? { value: { extension } } : undefined,
  }
}

describe('useDesignerDragDrop', () => {
  it('creates a material at the same rect shown by the centered preview', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements)
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drag.startMaterialDrag(makeDragEvent(10, 10, []), {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    })
    drag.onCanvasDrop(makeDragEvent(505, 505, [MATERIAL_DRAG_MIME], { [MATERIAL_DRAG_MIME]: 'text' }))

    expect(elements).toHaveLength(1)
    expect(elements[0]?.x).toBe(455)
    expect(elements[0]?.y).toBe(480)
    drag.cleanup()
  })

  it('creates a material when the preview rect overlaps the canvas even if the pointer is outside', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements)
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drag.startMaterialDrag(makeDragEvent(10, 10, []), {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    })
    drag.onCanvasDrop(makeDragEvent(-40, 250, [MATERIAL_DRAG_MIME], { [MATERIAL_DRAG_MIME]: 'text' }))

    expect(elements).toHaveLength(1)
    expect(elements[0]?.x).toBe(-90)
    expect(elements[0]?.y).toBe(225)
    drag.cleanup()
  })

  it('creates a material continuously outside page bands', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements)
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drag.startMaterialDrag(makeDragEvent(10, 10, []), {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    })
    drag.onCanvasDrop(makeDragEvent(530, 530, [MATERIAL_DRAG_MIME], { [MATERIAL_DRAG_MIME]: 'text' }))

    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({ x: 480, y: 505 })
    drag.cleanup()
  })

  it('cleans up the preview immediately when dropped outside the canvas', () => {
    const pageEl = makePageEl()
    const store = makeStore([])
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drag.startMaterialDrag(makeDragEvent(10, 10, []), {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    })
    expect(document.body.querySelector('.ei-designer-drag-preview__rect')).not.toBeNull()

    window.dispatchEvent(new Event('drop'))

    expect(document.body.querySelector('.ei-designer-drag-preview__rect')).toBeNull()
    drag.cleanup()
  })

  it('commits pointer-driven material drag outside page bands and cleans up the preview', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements)
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drag.startMaterialPointerDrag(makePointerDown(10, 10), {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    })
    dispatchPointerEvent('pointermove', 40, 40)
    const preview = document.body.querySelector('.ei-designer-drag-preview__rect') as HTMLElement | null
    expect(preview).not.toBeNull()
    expect(preview?.style.left).toBe('-10px')
    expect(preview?.style.top).toBe('15px')

    dispatchPointerEvent('pointerup', 530, 530)

    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({ x: 480, y: 505 })
    expect(document.body.querySelector('.ei-designer-drag-preview__rect')).toBeNull()
    expect(drag.consumeClickSuppression()).toBe(true)
    drag.cleanup()
  })

  it('commits a fast material drag even when no pointermove event is delivered', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements)
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drag.startMaterialPointerDrag(makePointerDown(10, 10), {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    })
    dispatchPointerEvent('pointerup', 220, 240)

    expect(elements).toHaveLength(1)
    expect(elements[0]?.x).toBe(170)
    expect(elements[0]?.y).toBe(215)
    drag.cleanup()
  })

  it('supports consecutive fast material drags without stale state blocking the next one', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements)
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })
    const entry = {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    }

    drag.startMaterialPointerDrag(makePointerDown(10, 10, 1), entry)
    dispatchPointerEvent('pointerup', 120, 130, 1)
    drag.startMaterialPointerDrag(makePointerDown(10, 10, 2), entry)
    dispatchPointerEvent('pointerup', 260, 280, 2)

    expect(elements).toHaveLength(2)
    expect(elements[0]?.x).toBe(70)
    expect(elements[0]?.y).toBe(105)
    expect(elements[1]?.x).toBe(210)
    expect(elements[1]?.y).toBe(255)
    drag.cleanup()
  })

  it('creates the material node draft once per pointer drag instead of on every move', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const createDefaultNode = vi.fn((partial?: MaterialNodeCreateInput) => createTextNode(partial))
    const store = makeStore(elements, undefined, { textCreateDefaultNode: createDefaultNode })
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drag.startMaterialPointerDrag(makePointerDown(10, 10), {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    })
    dispatchPointerEvent('pointermove', 80, 90)
    dispatchPointerEvent('pointermove', 120, 130)
    dispatchPointerEvent('pointerup', 160, 170)

    expect(createDefaultNode).toHaveBeenCalledTimes(1)
    expect(elements).toHaveLength(1)
    drag.cleanup()
  })

  it('captures and releases the source pointer during panel material drags', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements)
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })
    const sourceEl = document.createElement('button')
    sourceEl.setPointerCapture = vi.fn()
    sourceEl.releasePointerCapture = vi.fn()

    drag.startMaterialPointerDrag(makePointerDown(10, 10, 7, sourceEl), {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    })
    dispatchPointerEvent('pointerup', 220, 240, 7)

    expect(sourceEl.setPointerCapture).toHaveBeenCalledWith(7)
    expect(sourceEl.releasePointerCapture).toHaveBeenCalledWith(7)
    expect(elements).toHaveLength(1)
    drag.cleanup()
  })

  it('supports consecutive fast drags when switching to a different material type', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements)
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })
    const textEntry = {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    }
    const lineEntry = {
      id: 'quick-line',
      groupId: 'basic',
      label: 'Line',
      icon: {},
      materialType: 'line',
    }

    drag.startMaterialPointerDrag(makePointerDown(10, 10, 1), textEntry)
    dispatchPointerEvent('pointerup', 120, 130, 1)
    drag.startMaterialPointerDrag(makePointerDown(20, 10, 2), lineEntry)
    dispatchPointerEvent('pointerup', 260, 280, 2)

    expect(elements).toHaveLength(2)
    expect(elements[0]?.type).toBe('text')
    expect(elements[1]?.type).toBe('line')
    expect(elements[1]?.x).toBe(210)
    expect(elements[1]?.y).toBe(279.5)
    drag.cleanup()
  })

  it('uses the visible material preview footprint for thin-material hit testing', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements)
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drag.startMaterialPointerDrag(makePointerDown(10, 10), {
      id: 'quick-line',
      groupId: 'basic',
      label: 'Line',
      icon: {},
      materialType: 'line',
    })
    dispatchPointerEvent('pointerup', 220, -13)

    expect(elements).toHaveLength(1)
    expect(elements[0]?.type).toBe('line')
    expect(elements[0]?.x).toBe(170)
    expect(elements[0]?.y).toBe(-13.5)
    drag.cleanup()
  })

  it('drops onto fixed sheets using continuous y', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements, undefined, {
      page: makePage({ pagination: { strategy: 'fixed-sheets', pageCount: 2 } }),
    })
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drag.startMaterialDrag(makeDragEvent(10, 10, []), {
      id: 'quick-text',
      groupId: 'basic',
      label: 'Text',
      icon: {},
      materialType: 'text',
    })
    drag.onCanvasDrop(makeDragEvent(250, 540, [MATERIAL_DRAG_MIME], { [MATERIAL_DRAG_MIME]: 'text' }))

    expect(elements).toHaveLength(1)
    expect(elements[0]).toMatchObject({ x: 200, y: 515 })
    drag.cleanup()
  })

  it('does not create datasource material nodes on blank canvas', () => {
    const pageEl = makePageEl()
    const elements: MaterialNode[] = []
    const store = makeStore(elements)
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })
    const field = {
      sourceId: 'order',
      sourceName: 'Order',
      fieldPath: 'order/no',
      fieldLabel: 'No',
      use: 'text',
      union: [{ name: 'Amount', path: 'order/amount', offsetX: 120, offsetY: 0, use: 'text' }],
    }

    drag.startDatasourceDrag(makeDragEvent(10, 10, []), field)
    const floating = document.body.querySelector('.ei-designer-drag-preview__floating') as HTMLElement | null
    expect(floating?.style.width).toBe('136px')
    expect(floating?.style.height).toBe('34px')
    expect(floating?.style.left).toBe('-58px')
    expect(floating?.style.top).toBe('-7px')
    drag.onCanvasDrop(makeDragEvent(40, 60, [DATASOURCE_DRAG_MIME], { [DATASOURCE_DRAG_MIME]: JSON.stringify(field) }))

    expect(elements).toHaveLength(0)
    expect(store.commands.execute).not.toHaveBeenCalled()
    drag.cleanup()
  })

  it('binds scalar fields to the exact canonical port declared by text and image manifests', () => {
    const pageEl = makePageEl()
    const text = createTextNode({ id: 'text-target', x: 0, y: 0 })
    const image = createTextNode({ id: 'image-target', type: 'image', x: 150, y: 0 })
    const imageManifest = createTestMaterialManifest({
      type: 'image',
      binding: {
        kind: 'ports',
        ports: [{ id: 'src', key: { kind: 'exact', value: 'src' }, role: 'display', valueShape: 'scalar', modelPath: '/model/src', formatEditor: { tabs: ['preset'] } }],
      },
      designer: true,
    })
    const store = makeStore([text, image], undefined, { extraManifests: [imageManifest] })
    const drag = useDesignerDragDrop({ store: store as never, getPageEl: () => pageEl })
    const field = { sourceId: 'order', fieldPath: 'order/value', fieldLabel: 'Value' }

    drag.startDatasourceDrag(makeDragEvent(0, 0, []), field)
    drag.onCanvasDrop(makeDragEvent(20, 20, [DATASOURCE_DRAG_MIME], { [DATASOURCE_DRAG_MIME]: JSON.stringify(field) }))
    drag.startDatasourceDrag(makeDragEvent(0, 0, []), field)
    drag.onCanvasDrop(makeDragEvent(170, 20, [DATASOURCE_DRAG_MIME], { [DATASOURCE_DRAG_MIME]: JSON.stringify(field) }))

    expect(text.bindings).toEqual({ value: expect.objectContaining({ fieldPath: 'order/value' }) })
    expect(image.bindings).toEqual({ src: expect.objectContaining({ fieldPath: 'order/value' }) })
    expect(image.bindings.value).toBeUndefined()
    const report = validateDocumentWithProfile({
      version: '1.0.0',
      unit: 'px',
      page: makePage(),
      guides: { x: [], y: [] },
      elements: [text, image],
    }, store.materialProfile)
    expect(report.diagnostics).toEqual([])
    expect(report.valid).toBe(true)
    drag.cleanup()
  })

  it('does not fall back to value for prefix ports and delegates custom materials to their extension', () => {
    const pageEl = makePageEl()
    const table = createTextNode({ id: 'table', type: 'table-static', x: 0, y: 0 })
    const custom = createTextNode({ id: 'custom', type: 'chart-custom', x: 150, y: 0 })
    const prefixBinding = {
      kind: 'ports' as const,
      ports: [{ id: 'cell', key: { kind: 'prefix' as const, value: 'cell:' }, role: 'display' as const, valueShape: 'scalar' as const, modelPath: '/model/cells' as const, formatEditor: false as const }],
    }
    const manifests = [
      createTestMaterialManifest({ type: 'table-static', binding: prefixBinding, designer: true }),
      createTestMaterialManifest({ type: 'chart-custom', binding: prefixBinding, designer: true }),
    ]
    const onDrop = vi.fn()
    const extension = {
      datasourceDrop: {
        onDragOver: () => ({ status: 'accepted' as const, rect: { x: 0, y: 0, w: 100, h: 50 } }),
        onDrop,
      },
    }
    const tableStore = makeStore([table], undefined, { extraManifests: manifests })
    const tableDrag = useDesignerDragDrop({ store: tableStore as never, getPageEl: () => pageEl })
    const customStore = makeStore([custom], extension, { extraManifests: manifests })
    const customDrag = useDesignerDragDrop({ store: customStore as never, getPageEl: () => pageEl })
    const field = { sourceId: 'order', fieldPath: 'order/value' }

    tableDrag.startDatasourceDrag(makeDragEvent(0, 0, []), field)
    tableDrag.onCanvasDrop(makeDragEvent(20, 20, [DATASOURCE_DRAG_MIME], { [DATASOURCE_DRAG_MIME]: JSON.stringify(field) }))
    customDrag.startDatasourceDrag(makeDragEvent(0, 0, []), field)
    customDrag.onCanvasDrop(makeDragEvent(170, 20, [DATASOURCE_DRAG_MIME], { [DATASOURCE_DRAG_MIME]: JSON.stringify(field) }))

    expect(table.bindings).toEqual({})
    expect(tableStore.commands.execute).not.toHaveBeenCalled()
    expect(onDrop).toHaveBeenCalledOnce()
    expect(custom.bindings.value).toBeUndefined()
    tableDrag.cleanup()
    customDrag.cleanup()
  })

  it('passes real datasource field info to material drop handlers during hover', () => {
    const pageEl = makePageEl()
    const node = createTextNode({ id: 'target', x: 0, y: 0, width: 100, height: 50 })
    const onDragOver = vi.fn((field: { fieldPath: string }, _point: { x: number, y: number }) => ({
      status: 'accepted' as const,
      rect: { x: 0, y: 0, w: 100, h: 50 },
      label: field.fieldPath,
    }))
    const onDrop = vi.fn()
    const store = makeStore([node], {
      datasourceDrop: {
        onDragOver,
        onDrop,
      },
    })
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })
    const field = {
      sourceId: 'order',
      sourceName: 'Order',
      fieldPath: 'order/no',
      fieldLabel: 'No',
      use: 'text',
    }

    drag.startDatasourceDrag(makeDragEvent(10, 10, []), field)
    drag.onCanvasDragOver(makeDragEvent(20, 20, [DATASOURCE_DRAG_MIME], { [DATASOURCE_DRAG_MIME]: JSON.stringify(field) }))

    expect(onDragOver).toHaveBeenCalledWith(expect.objectContaining({
      sourceId: 'order',
      fieldPath: 'order/no',
      fieldLabel: 'No',
    }), expect.any(Object), node)
    drag.cleanup()
  })

  it('uses pointer coordinates for datasource hit testing without native drag drift', () => {
    const pageEl = makePageEl()
    const node = createTextNode({ id: 'target', x: 50, y: 50, width: 100, height: 50 })
    const onDragOver = vi.fn((field: { fieldPath: string }, _point: { x: number, y: number }) => ({
      status: 'accepted' as const,
      rect: { x: 0, y: 0, w: 100, h: 50 },
      label: field.fieldPath,
    }))
    const store = makeStore([node], {
      datasourceDrop: {
        onDragOver,
        onDrop: vi.fn(),
      },
    })
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })
    const field = {
      sourceId: 'order',
      sourceName: 'Order',
      fieldPath: 'order/no',
      fieldLabel: 'No',
      use: 'text',
    }

    drag.startDatasourcePointerDrag(makePointerDown(10, 10), field)
    dispatchPointerEvent('pointermove', 70, 80)
    dispatchPointerEvent('pointermove', 85, 90)

    expect(onDragOver).toHaveBeenCalledTimes(2)
    expect(onDragOver.mock.calls[0]?.[1]).toMatchObject({ x: 20, y: 30 })
    expect(onDragOver.mock.calls[1]?.[1]).toMatchObject({ x: 35, y: 40 })
    drag.cleanup()
  })

  it('commits datasource drops to registered panel targets before canvas binding', () => {
    const pageEl = makePageEl()
    const node = createTextNode({ id: 'target', x: 0, y: 0, width: 100, height: 50 })
    const store = makeStore([node])
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })
    const panelEl = document.createElement('div')
    panelEl.getBoundingClientRect = () => ({
      left: 10,
      top: 10,
      right: 110,
      bottom: 70,
      width: 100,
      height: 60,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    })
    document.body.appendChild(panelEl)
    const onDrop = vi.fn()
    drag.registerDatasourceDropTarget({
      id: 'slot',
      element: () => panelEl,
      onDragOver: () => ({ status: 'accepted', label: 'Slot' }),
      onDrop,
    })
    const field = {
      sourceId: 'order',
      sourceName: 'Order',
      fieldPath: 'order/no',
      fieldLabel: 'No',
    }

    drag.startDatasourcePointerDrag(makePointerDown(0, 0), field)
    dispatchPointerEvent('pointermove', 30, 30)
    dispatchPointerEvent('pointerup', 30, 30)

    expect(onDrop).toHaveBeenCalledWith(field)
    expect(node.bindings.value).toBeUndefined()
    panelEl.remove()
    drag.cleanup()
  })

  it('binds datasource fields to data-contract materials on canvas in role order', () => {
    const pageEl = makePageEl()
    const node = createTextNode({ id: 'target', x: 0, y: 0, width: 100, height: 50 })
    const store = makeStore([node], undefined, {
      textDataContract: chartDataContract,
      textDataContractPort: 'dataset',
    })
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })
    const month = {
      sourceId: 'sales-report',
      sourceName: 'Sales Report',
      fieldPath: 'monthlySales/month',
      fieldLabel: '月份',
    }
    const revenue = {
      sourceId: 'sales-report',
      sourceName: 'Sales Report',
      fieldPath: 'monthlySales/revenue',
      fieldLabel: '销售额',
    }

    drag.startDatasourceDrag(makeDragEvent(0, 0, []), month)
    drag.onCanvasDrop(makeDragEvent(20, 20, [DATASOURCE_DRAG_MIME], { [DATASOURCE_DRAG_MIME]: JSON.stringify(month) }))
    drag.startDatasourceDrag(makeDragEvent(0, 0, []), revenue)
    drag.onCanvasDrop(makeDragEvent(20, 20, [DATASOURCE_DRAG_MIME], { [DATASOURCE_DRAG_MIME]: JSON.stringify(revenue) }))

    expect(node.bindings.dataset).toEqual({
      kind: 'data-contract',
      relation: { kind: 'auto' },
      mappings: {
        category: expect.objectContaining({
          sourceId: 'sales-report',
          select: expect.objectContaining({ path: 'monthlySales/month' }),
        }),
        value: expect.objectContaining({
          sourceId: 'sales-report',
          select: expect.objectContaining({ path: 'monthlySales/revenue' }),
        }),
      },
    })
    expect(store.commands.execute).toHaveBeenCalledTimes(2)
    drag.cleanup()
  })

  it('maps data-contract canvas drops from another collection without design-time rejection', () => {
    const pageEl = makePageEl()
    const node = createTextNode({
      id: 'target',
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      bindings: {
        dataset: {
          kind: 'data-contract',
          relation: { kind: 'auto' },
          mappings: {
            category: { sourceId: 'sales-report', select: { path: 'monthlySales/month' } },
          },
        },
      },
    })
    const store = makeStore([node], undefined, {
      textDataContract: chartDataContract,
      textDataContractPort: 'dataset',
    })
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })
    const weeklyRevenue = {
      sourceId: 'sales-report',
      sourceName: 'Sales Report',
      fieldPath: 'weeklySales/revenue',
      fieldLabel: '周销售额',
    }

    drag.startDatasourceDrag(makeDragEvent(0, 0, []), weeklyRevenue)
    drag.onCanvasDrop(makeDragEvent(20, 20, [DATASOURCE_DRAG_MIME], { [DATASOURCE_DRAG_MIME]: JSON.stringify(weeklyRevenue) }))

    expect(node.bindings.dataset).toEqual({
      kind: 'data-contract',
      relation: { kind: 'auto' },
      mappings: {
        category: expect.objectContaining({
          sourceId: 'sales-report',
          select: expect.objectContaining({ path: 'monthlySales/month' }),
        }),
        value: expect.objectContaining({
          sourceId: 'sales-report',
          select: expect.objectContaining({ path: 'weeklySales/revenue' }),
        }),
      },
    })
    expect(store.commands.execute).toHaveBeenCalledTimes(1)
    drag.cleanup()
  })
})
