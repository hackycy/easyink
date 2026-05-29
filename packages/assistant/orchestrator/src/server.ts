import type { LLMClient } from '@easyink/assistant-llm'
import type { AssistantStore } from '@easyink/assistant-store'
import { AssistantTaskInputSchema } from '@easyink/assistant-capabilities'
import { Hono } from 'hono'
import { z } from 'zod'
import { AssistantOrchestrator } from './orchestrator'

export interface CreateAssistantAppOptions {
  orchestrator?: AssistantOrchestrator
  store?: AssistantStore
  llm?: LLMClient
}

export function createAssistantApp(options: CreateAssistantAppOptions = {}) {
  const orchestrator = options.orchestrator ?? new AssistantOrchestrator({ store: options.store, llm: options.llm })
  const app = new Hono()

  app.get('/health', c => c.json({ ok: true, service: 'easyink-assistant-orchestrator' }))

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

  app.get('/assistant/snapshot', async (c) => {
    const snapshot = await orchestrator.store.exportSnapshot()
    return c.json({ snapshot })
  })

  app.post('/assistant/snapshot/import', async (c) => {
    const body = z.object({ snapshot: z.unknown() }).parse(await c.req.json())
    await orchestrator.store.importSnapshot(body.snapshot as Awaited<ReturnType<AssistantStore['exportSnapshot']>>)
    return c.json({ ok: true })
  })

  app.post('/assistant/cleanup', async (c) => {
    const removed = await orchestrator.store.cleanupExpired()
    return c.json({ removed })
  })

  app.post('/assistant/tasks/:id/cancel', async (c) => {
    const task = await orchestrator.cancelTask(c.req.param('id'))
    return c.json({ task })
  })

  app.post('/assistant/tasks/:id/messages', async (c) => {
    const body = z.object({ message: z.string().min(1) }).parse(await c.req.json())
    const task = await orchestrator.appendMessage(c.req.param('id'), body.message)
    return c.json({ task }, 202)
  })

  app.post('/assistant/tasks/:id/clarifications', async (c) => {
    const body = z.object({ answer: z.string().min(1) }).parse(await c.req.json())
    const task = await orchestrator.answerClarification(c.req.param('id'), body.answer)
    return c.json({ task }, 202)
  })

  app.post('/assistant/tasks/:id/retry', async (c) => {
    const task = await orchestrator.retryTask(c.req.param('id'))
    return c.json({ task }, 202)
  })

  app.post('/assistant/tasks/:id/repair', async (c) => {
    const task = await orchestrator.repairTask(c.req.param('id'))
    return c.json({ task }, 202)
  })

  app.post('/assistant/tasks/:id/rollback', async (c) => {
    const task = await orchestrator.rollbackTask(c.req.param('id'))
    return c.json({ task })
  })

  app.post('/assistant/tasks/:id/apply', async (c) => {
    const task = await orchestrator.applyTaskResult(c.req.param('id'))
    return c.json({ task })
  })

  app.get('/assistant/tasks/:id/results/:resultId', async (c) => {
    const result = await orchestrator.store.getResult(c.req.param('resultId'))
    if (!result)
      return c.json({ error: 'Result not found' }, 404)
    return c.json({ result })
  })

  app.get('/assistant/tasks/:id/versions', async (c) => {
    const versions = await orchestrator.store.listVersions(c.req.param('id'))
    return c.json({ versions })
  })

  app.get('/assistant/tasks/:id/projection', async (c) => {
    const projection = await orchestrator.store.getLatestProjectionSnapshot(c.req.param('id'))
    if (!projection)
      return c.json({ error: 'Projection not found' }, 404)
    return c.json({ projection })
  })

  app.get('/assistant/tasks/:id/source-sample', async (c) => {
    const sourceSample = await orchestrator.store.getSourceSample(c.req.param('id'))
    if (!sourceSample)
      return c.json({ error: 'Source sample not found' }, 404)
    return c.json({ sourceSample })
  })

  return app
}
