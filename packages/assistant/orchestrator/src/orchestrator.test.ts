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

  it('handles browser preflight requests from playground', async () => {
    const app = createAssistantApp({ corsOrigin: 'http://localhost:8532' })
    const response = await app.request('/assistant/tasks', {
      method: 'OPTIONS',
      headers: {
        'origin': 'http://localhost:8532',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8532')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it('keeps CORS headers on event stream responses', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store })
    const app = createAssistantApp({ orchestrator, corsOrigin: 'http://localhost:8532' })
    const task = await store.createTask({ prompt: '生成一张商超小票' })
    await store.appendEvent(task.id, { type: 'step.started', taskId: task.id, step: 'intake' })

    const response = await app.request(`/assistant/tasks/${task.id}/events`, {
      headers: {
        origin: 'http://localhost:8532',
        accept: 'text/event-stream',
      },
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:8532')
  })

  it('asks for clarification and continues the same task after an answer', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store })
    const task = await store.createTask({ prompt: '帮我做个单据' })

    const waiting = await orchestrator.runTask(task.id)
    expect(waiting.status).toBe('waiting')
    expect((await store.listEvents(task.id)).some(record => record.event.type === 'clarification.required')).toBe(true)

    await orchestrator.answerClarification(task.id, '报价单')
    await waitForTask(store, task.id, 'review')

    const done = await store.getTask(task.id)
    expect(done?.resultId).toBeTruthy()
    expect((await store.listEvents(task.id)).some(record => record.event.type === 'clarification.answered')).toBe(true)
  })

  it('exposes result and version endpoints', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store })
    const app = createAssistantApp({ orchestrator })
    const task = await store.createTask({ prompt: '生成一张商超小票' })
    const reviewed = await orchestrator.runTask(task.id)

    const resultResponse = await app.request(`/assistant/tasks/${task.id}/results/${reviewed.resultId}`)
    const versionResponse = await app.request(`/assistant/tasks/${task.id}/versions`)

    expect(resultResponse.status).toBe(200)
    expect(versionResponse.status).toBe(200)
    const versions = await versionResponse.json() as { versions: unknown[] }
    expect(versions.versions.length).toBeGreaterThan(0)
  })

  it('repairs an invalid result in place and exposes retry/rollback branches', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store })
    const currentSchema = createSchema('before')
    const task = await store.createTask({ prompt: '生成一张商超小票', currentSchema })
    const result = {
      id: 'result_broken',
      schema: { ...createSchema('broken'), version: '', elements: undefined } as never,
      patch: [],
      diff: { changed: false, operations: [], summary: [] },
      validation: { valid: false, errors: [{ code: 'INVALID_ELEMENTS', message: 'elements must be an array' }], warnings: [], autoFixed: [] },
      preview: {
        title: 'Broken',
        page: { mode: 'fixed' as const, width: 80, height: 120, unit: 'mm' as const },
        elementCount: 0,
        dataFieldCount: 0,
        warnings: [],
      },
      createdAt: Date.now(),
    }
    await store.saveResult(task.id, result)
    await store.updateTask({ ...task, status: 'review', step: 'review', resultId: result.id })

    const repaired = await orchestrator.repairTask(task.id)
    const repairedResult = await store.getResult(repaired.resultId!)

    expect(repaired.status).toBe('review')
    expect(repairedResult?.validation.valid).toBe(true)

    await orchestrator.retryTask(task.id)
    await waitForTask(store, task.id, 'review')
    await orchestrator.applyTaskResult(task.id)
    await orchestrator.rollbackTask(task.id)

    const actions = (await store.listVersions(task.id)).map(version => version.action)
    expect(actions).toContain('before-apply')
    expect(actions).toContain('rolled-back')
  })

  it('uses LLM agent intent as controlled composer input', async () => {
    const store = new MemoryAssistantStore()
    const llm = new SequenceLLMClient([
      { requiresClarification: false, questions: [], suggestedAnswers: [], taskType: 'quote' },
      { requiresClarification: false, questions: [], suggestedAnswers: [], taskType: 'quote' },
      { domain: 'business', page: { mode: 'fixed', width: 210, height: 297 }, warnings: [] },
      {
        name: 'LLM 报价单',
        fields: [{ name: 'customer', path: 'customer', title: '客户', type: 'string' }],
        sections: [{ kind: 'field-list', title: '基础信息', fields: [{ name: 'customer', path: 'customer', title: '客户' }] }],
      },
      { explanation: '校验前会经过 capability validate。' },
    ])
    const orchestrator = new AssistantOrchestrator({ store, llm })
    const task = await store.createTask({ prompt: '生成一个报价单' })

    const reviewed = await orchestrator.runTask(task.id)
    const result = await store.getResult(reviewed.resultId!)

    expect(result?.validation.valid).toBe(true)
    expect(JSON.stringify(result?.dataSource?.fields)).toContain('customer')
    expect(result?.preview.warnings.join('\n')).toContain('capability validate')
  })

  it('constrains generated results to the active material manifest', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store })
    const task = await store.createTask({
      prompt: '生成一张商超小票',
      materialManifest: {
        materials: [
          { type: 'text', name: 'Text', capabilities: {}, props: [] },
        ],
      },
    })

    const reviewed = await orchestrator.runTask(task.id)
    const result = await store.getResult(reviewed.resultId!)

    expect(result?.validation.valid).toBe(true)
    expect(result?.schema.elements.every(element => element.type === 'text')).toBe(true)
    expect(result?.preview.warnings).toContainEqual(expect.stringContaining('Material type "table-data" is not registered'))
  })
})

function createSchema(text: string) {
  return {
    version: '1',
    unit: 'mm' as const,
    page: { mode: 'fixed' as const, width: 80, height: 120 },
    guides: { x: [], y: [], groups: [] },
    elements: [{
      id: 'title',
      type: 'text',
      x: 0,
      y: 0,
      width: 20,
      height: 6,
      props: { text },
    }],
  }
}

async function waitForTask(store: MemoryAssistantStore, taskId: string, status: string) {
  for (let index = 0; index < 20; index += 1) {
    const task = await store.getTask(taskId)
    if (task?.status === status)
      return task
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error(`Task ${taskId} did not reach ${status}`)
}

class SequenceLLMClient {
  private index = 0

  constructor(private readonly payloads: unknown[]) {}

  async complete() {
    const payload = this.payloads[this.index] ?? {}
    this.index += 1
    return {
      content: typeof payload === 'string' ? payload : JSON.stringify(payload),
      model: 'sequence',
    }
  }
}
