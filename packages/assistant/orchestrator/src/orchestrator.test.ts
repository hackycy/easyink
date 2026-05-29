import { MemoryAssistantStore } from '@easyink/assistant-store'
import { describe, expect, it } from 'vitest'
import { AssistantOrchestrator, createAssistantApp } from './index'

describe('assistantOrchestrator', () => {
  it('runs a task into review and stores result/events', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store })
    const task = await store.createTask({ prompt: '生成一张商超小票' })

    const done = await orchestrator.runTask(task.id)
    const events = await store.listEvents(task.id)

    expect(done.status).toBe('review')
    expect(done.resultId).toBeTruthy()
    expect(events.some(record => record.event.type === 'result.ready')).toBe(true)
  })

  it('exposes Hono task endpoints', async () => {
    const app = createAssistantApp()
    const response = await app.request('/assistant/tasks', {
      method: 'POST',
      body: JSON.stringify({ prompt: '生成一张商超小票' }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(202)
    const payload = await response.json() as { task: { id: string } }
    expect(payload.task.id).toMatch(/^task_/)
  })
})
