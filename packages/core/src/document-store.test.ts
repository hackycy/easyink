import { createDefaultSchema } from '@easyink/schema'
import { cloneJsonValue } from '@easyink/shared'
import { describe, expect, it } from 'vitest'
import { DocumentStore } from './document-store'
import { DOCUMENT_STORE_WRITER } from './document-store-internal'
import { createTestCompiledMaterialProfile } from './testing/material-profile'

function freeze<T extends object>(value: T): T {
  if (!Object.isFrozen(value))
    Object.freeze(value)
  for (const child of Object.values(value)) {
    if (child && typeof child === 'object')
      freeze(child)
  }
  return value
}

function schemaWithX(x: number) {
  const profile = createTestCompiledMaterialProfile()
  const schema = createDefaultSchema()
  delete (schema.page.pagination as { pageCount?: number }).pageCount
  schema.elements = [profile.createNode('box', { id: 'a', x })]
  return { profile, schema }
}

describe('documentStore', () => {
  it('clones and recursively freezes the initial canonical document', () => {
    const { profile, schema: source } = schemaWithX(1)
    const store = new DocumentStore(source, profile)
    source.elements[0]!.x = 99
    expect(store.document.elements[0]!.x).toBe(1)
    expect(store.revision).toBe(0)
    expect(Object.isFrozen(store.document)).toBe(true)
    expect(Object.isFrozen(store.document.elements[0]!.model)).toBe(true)
    expect(() => {
      store.document.elements[0]!.x = 2
    }).toThrow()
  })

  it('publishes preview and committed events, and clears preview on commit', async () => {
    const { profile, schema } = schemaWithX(1)
    const store = new DocumentStore(schema, profile)
    const events: string[] = []
    store.subscribe(event => events.push(`${event.kind}:${event.previousDocument.elements[0]!.x}->${event.document.elements[0]!.x}`))
    const preview = cloneJsonValue(schema as never) as typeof schema
    preview.elements[0]!.x = 2
    freeze(preview)
    const index = store.createIndex(preview, 0)
    ;(store as any)[DOCUMENT_STORE_WRITER]({ kind: 'preview', document: preview, index })
    expect(store.document.elements[0]!.x).toBe(2)
    ;(store as any)[DOCUMENT_STORE_WRITER]({ kind: 'preview-cancel' })
    expect(store.document.elements[0]!.x).toBe(1)
    const committed = cloneJsonValue(schema as never) as typeof schema
    committed.elements[0]!.x = 3
    freeze(committed)
    const report = { valid: true, diagnostics: [], nodeStates: store.materialNodeStates } as any
    ;(store as any)[DOCUMENT_STORE_WRITER]({ kind: 'commit', document: committed, index: store.createIndex(committed, 1), validationReport: report })
    await Promise.resolve()
    expect(store.committedDocument.elements[0]!.x).toBe(3)
    expect(store.revision).toBe(1)
    expect(events).toEqual(['preview:1->2', 'preview-cancel:2->1', 'commit:1->3'])
  })

  it('assigns every write a monotonic event sequence that reset never rewinds', async () => {
    const { profile, schema } = schemaWithX(1)
    const store = new DocumentStore(schema, profile)
    const sequences: number[] = []
    store.subscribe(event => sequences.push(event.sequence))
    const report = { valid: true, diagnostics: [], nodeStates: store.materialNodeStates } as any
    const reset = schemaWithX(2).schema

    ;(store as any)[DOCUMENT_STORE_WRITER]({ kind: 'reset', document: reset, validationReport: report })
    ;(store as any)[DOCUMENT_STORE_WRITER]({ kind: 'reset', document: schema, validationReport: report })
    await Promise.resolve()

    expect(sequences).toEqual([1, 2])
    expect(store.eventSequence).toBe(2)
    expect(store.revision).toBe(0)
  })

  it('resets with a clone and revision zero, and rejects unfrozen candidates', () => {
    const { profile, schema } = schemaWithX(1)
    const store = new DocumentStore(schema, profile)
    const report = { valid: true, diagnostics: [], nodeStates: store.materialNodeStates } as any
    const candidate = schemaWithX(4).schema
    expect(() => (store as any)[DOCUMENT_STORE_WRITER]({ kind: 'commit', document: candidate, index: store.createIndex(candidate, 1), validationReport: report })).toThrow(/auto-frozen/u)
    const reset = schemaWithX(7).schema
    ;(store as any)[DOCUMENT_STORE_WRITER]({ kind: 'reset', document: reset, validationReport: report })
    reset.elements[0]!.x = 99
    expect(store.revision).toBe(0)
    expect(store.document.elements[0]!.x).toBe(7)
    expect(Object.isFrozen(store.document)).toBe(true)
    expect(store.index.getNode('a')).toBe(store.document.elements[0])
    expect(store.index.getNode('a')!.x).toBe(7)
  })

  it('queues FIFO events, snapshots subscribers, and isolates listener errors', async () => {
    const { profile, schema } = schemaWithX(1)
    const errors: unknown[] = []
    const store = new DocumentStore(schema, profile, { onListenerError: error => errors.push(error) })
    const seen: string[] = []
    let subscribed = false
    const report = { valid: true, diagnostics: [], nodeStates: store.materialNodeStates } as any
    const write = (x: number) => {
      const candidate = cloneJsonValue(schema as never) as typeof schema
      candidate.elements[0]!.x = x
      freeze(candidate)
      ;(store as any)[DOCUMENT_STORE_WRITER]({ kind: 'commit', document: candidate, index: store.createIndex(candidate, x), validationReport: report })
    }
    store.subscribe((event) => {
      seen.push(`${event.kind}:${event.document.elements[0]!.x}`)
      if (!subscribed) {
        subscribed = true
        store.subscribe(event2 => seen.push(`late:${event2.document.elements[0]!.x}`))
        write(3)
      }
      throw new Error('listener failure')
    })
    write(2)
    await Promise.resolve()
    await Promise.resolve()
    expect(seen).toEqual(['commit:2', 'commit:3', 'late:3'])
    expect(errors).toHaveLength(2)
    expect(store.document.elements[0]!.x).toBe(3)
  })
})
