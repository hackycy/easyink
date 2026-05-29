import { describe, expect, it } from 'vitest'
import { MemoryAssistantStore } from './index'

describe('memoryAssistantStore', () => {
  it('keeps append-only task events and snapshots', async () => {
    const store = new MemoryAssistantStore()
    const task = await store.createTask({ prompt: '生成小票' })
    await store.appendEvent(task.id, { type: 'step.started', taskId: task.id, step: 'intake' })

    const events = await store.listEvents(task.id)
    const snapshot = await store.exportSnapshot()

    expect(events.map(record => record.event.type)).toEqual(['task.created', 'step.started'])
    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.tasks).toHaveLength(1)
  })
})
