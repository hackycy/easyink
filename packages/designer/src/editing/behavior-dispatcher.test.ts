import type { BehaviorContext, BehaviorEvent, BehaviorRegistration, EditingSessionRef, GeometryService, MaterialGeometry, SelectionStore, SurfacesAPI, TransactionAPI } from '@easyink/core'
import type { MaterialNode } from '@easyink/schema'
import { describe, expect, it, vi } from 'vitest'
import { dispatchBehaviorEvent } from './behavior-dispatcher'

function makeNode(): MaterialNode {
  return { id: 'n1', type: 'test', x: 0, y: 0, width: 100, height: 50, props: {} } as MaterialNode
}

function makeContext(selection: { type: string, nodeId: string, payload: unknown } | null = null): Omit<BehaviorContext, 'event' | 'meta'> {
  const selectionStore: SelectionStore = { selection, set: vi.fn() }
  return {
    selection,
    node: makeNode(),
    materialGeometry: {} as MaterialGeometry,
    tx: {} as TransactionAPI,
    geometry: {} as GeometryService,
    selectionStore,
    surfaces: {} as SurfacesAPI,
    session: {} as EditingSessionRef,
  }
}

function makeEvent(kind: BehaviorEvent['kind'] = 'pointer-down'): BehaviorEvent {
  return { kind, point: { x: 0, y: 0 }, originalEvent: {} as PointerEvent } as BehaviorEvent
}

function logMiddleware(log: string[], label: string): BehaviorRegistration['middleware'] {
  return async (_ctx, next) => {
    log.push(label)
    await next()
  }
}

const tick = () => new Promise(r => setTimeout(r, 10))

describe('dispatchBehaviorEvent', () => {
  it('executes behaviors in registration order', async () => {
    const log: string[] = []
    const behaviors: BehaviorRegistration[] = [
      { id: 'a', middleware: logMiddleware(log, 'a') },
      { id: 'b', middleware: logMiddleware(log, 'b') },
    ]
    dispatchBehaviorEvent(makeEvent(), behaviors, makeContext())
    await tick()
    expect(log).toEqual(['a', 'b'])
  })

  it('short-circuits when next is not called', async () => {
    const log: string[] = []
    const behaviors: BehaviorRegistration[] = [
      { id: 'a', middleware: async () => { log.push('a') } },
      { id: 'b', middleware: logMiddleware(log, 'b') },
    ]
    dispatchBehaviorEvent(makeEvent(), behaviors, makeContext())
    await tick()
    expect(log).toEqual(['a'])
  })

  it('filters by eventKinds', async () => {
    const log: string[] = []
    const behaviors: BehaviorRegistration[] = [
      { id: 'a', eventKinds: ['key-down'], middleware: logMiddleware(log, 'a') },
      { id: 'b', middleware: logMiddleware(log, 'b') },
    ]
    dispatchBehaviorEvent(makeEvent('pointer-down'), behaviors, makeContext())
    await tick()
    expect(log).toEqual(['b'])
  })

  it('filters by selectionTypes', async () => {
    const log: string[] = []
    const sel = { type: 'table.cell', nodeId: 'n1', payload: { row: 0, col: 0 } }
    const behaviors: BehaviorRegistration[] = [
      { id: 'a', selectionTypes: ['svg.anchor'], middleware: logMiddleware(log, 'a') },
      { id: 'b', selectionTypes: ['table.cell'], middleware: logMiddleware(log, 'b') },
    ]
    dispatchBehaviorEvent(makeEvent(), behaviors, makeContext(sel))
    await tick()
    expect(log).toEqual(['b'])
  })

  it('sorts by priority (lower = earlier)', async () => {
    const log: string[] = []
    const behaviors: BehaviorRegistration[] = [
      { id: 'a', priority: 10, middleware: logMiddleware(log, 'a') },
      { id: 'b', priority: -5, middleware: logMiddleware(log, 'b') },
    ]
    dispatchBehaviorEvent(makeEvent(), behaviors, makeContext())
    await tick()
    expect(log).toEqual(['b', 'a'])
  })

  it('routes command events', async () => {
    const log: string[] = []
    const behaviors: BehaviorRegistration[] = [
      {
        id: 'cmd-handler',
        eventKinds: ['command'],
        middleware: async (ctx, next) => {
          if (ctx.event.kind === 'command')
            log.push(`cmd:${ctx.event.command}`)
          await next()
        },
      },
    ]
    const event: BehaviorEvent = { kind: 'command', command: 'insert-row-above' }
    dispatchBehaviorEvent(event, behaviors, makeContext())
    await tick()
    expect(log).toEqual(['cmd:insert-row-above'])
  })
})
