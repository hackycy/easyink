import type { AssistantStore } from '@easyink/assistant-store'
import { AssistantTaskInputSchema } from '@easyink/assistant-capabilities'
import { Hono } from 'hono'
import { AssistantOrchestrator } from './orchestrator'

export interface CreateAssistantAppOptions {
  orchestrator?: AssistantOrchestrator
  store?: AssistantStore
}

export function createAssistantApp(options: CreateAssistantAppOptions = {}) {
  const orchestrator = options.orchestrator ?? new AssistantOrchestrator({ store: options.store })
  const app = new Hono()

  app.post('/assistant/tasks', async (c) => {
    const body = await c.req.json()
    const input = AssistantTaskInputSchema.parse(body)
    const task = await orchestrator.createTask(input)
    return c.json({ task }, 202)
  })

  app.get('/assistant/tasks', async (c) => {
    const tasks = await orchestrator.store.listTasks()
    return c.json({ tasks })
  })

  app.get('/assistant/tasks/:id', async (c) => {
    const task = await orchestrator.store.getTask(c.req.param('id'))
    if (!task)
      return c.json({ error: 'Task not found' }, 404)
    const result = task.resultId ? await orchestrator.store.getResult(task.resultId) : undefined
    return c.json({ task, result })
  })

  app.get('/assistant/tasks/:id/events', async (c) => {
    const events = await orchestrator.store.listEvents(c.req.param('id'))
    const body = events
      .map(record => `id: ${record.id}\nevent: ${record.event.type}\ndata: ${JSON.stringify(record.event)}\n\n`)
      .join('')
    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      },
    })
  })

  app.post('/assistant/tasks/:id/cancel', async (c) => {
    const task = await orchestrator.cancelTask(c.req.param('id'))
    return c.json({ task })
  })

  app.post('/assistant/tasks/:id/apply', async (c) => {
    const task = await orchestrator.applyTaskResult(c.req.param('id'))
    return c.json({ task })
  })

  return app
}
