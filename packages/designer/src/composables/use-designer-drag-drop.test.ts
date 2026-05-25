/**
 * @vitest-environment happy-dom
 */
import type { MaterialNode, PageSchema } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { DATASOURCE_DRAG_MIME, MATERIAL_DRAG_MIME, useDesignerDragDrop } from './use-designer-drag-drop'

function createTextNode(partial: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: `text-${Math.random()}`,
    type: 'text',
    x: 0,
    y: 0,
    width: 100,
    height: 50,
    props: {},
    ...partial,
  } as MaterialNode
}

function createLineNode(partial: Partial<MaterialNode> = {}): MaterialNode {
  return {
    id: `line-${Math.random()}`,
    type: 'line',
    x: 0,
    y: 0,
    width: 100,
    height: 1,
    props: {},
    ...partial,
  } as MaterialNode
}

function makePage(overrides: Partial<PageSchema> = {}): PageSchema {
  return { mode: 'fixed', width: 500, height: 500, ...overrides }
}

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
  options: { textCreateDefaultNode?: (partial?: Partial<MaterialNode>) => MaterialNode, page?: PageSchema } = {},
) {
  const textDef = {
    type: 'text',
    name: 'Text',
    icon: {},
    category: 'basic',
    capabilities: { bindable: true },
    props: [],
    createDefaultNode: options.textCreateDefaultNode ?? ((partial?: Partial<MaterialNode>) => createTextNode(partial)),
  }
  const lineDef = {
    type: 'line',
    name: 'Line',
    icon: {},
    category: 'basic',
    capabilities: { bindable: false },
    props: [],
    createDefaultNode: (partial?: Partial<MaterialNode>) => createLineNode(partial),
  }
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
    getMaterial: (type: string) => type === 'text' ? textDef : type === 'line' ? lineDef : undefined,
    getCatalog: () => [
      {
        id: 'quick-text',
        group: 'quick',
        label: 'Text',
        icon: {},
        materialType: 'text',
        priority: 'quick',
      },
      {
        id: 'quick-line',
        group: 'quick',
        label: 'Line',
        icon: {},
        materialType: 'line',
        priority: 'quick',
      },
    ],
    getDesignerExtension: () => extension,
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
      group: 'quick',
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick',
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
      group: 'quick',
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick',
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
      group: 'quick',
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick',
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
      group: 'quick',
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick',
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
      group: 'quick',
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick',
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
      group: 'quick',
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick',
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
      group: 'quick' as const,
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick' as const,
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
    const createDefaultNode = vi.fn((partial?: Partial<MaterialNode>) => createTextNode(partial))
    const store = makeStore(elements, undefined, { textCreateDefaultNode: createDefaultNode })
    const drag = useDesignerDragDrop({
      store: store as never,
      getPageEl: () => pageEl,
    })

    drag.startMaterialPointerDrag(makePointerDown(10, 10), {
      id: 'quick-text',
      group: 'quick',
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick',
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
      group: 'quick',
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick',
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
      group: 'quick' as const,
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick' as const,
    }
    const lineEntry = {
      id: 'quick-line',
      group: 'quick' as const,
      label: 'Line',
      icon: {},
      materialType: 'line',
      priority: 'quick' as const,
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
      group: 'quick',
      label: 'Line',
      icon: {},
      materialType: 'line',
      priority: 'quick',
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
      group: 'quick',
      label: 'Text',
      icon: {},
      materialType: 'text',
      priority: 'quick',
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
})
