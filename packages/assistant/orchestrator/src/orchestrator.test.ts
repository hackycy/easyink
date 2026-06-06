import type { AssistantMaterialManifest } from '@easyink/assistant-capabilities'
import { MemoryAssistantStore } from '@easyink/assistant-store'
import { describe, expect, it, vi } from 'vitest'
import { AssistantOrchestrator, createAssistantApp, createAssistantWorkflowGraph } from './index'

describe('assistantOrchestrator', () => {
  it('runs a task into review and stores result/events', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store, llm: createSchemaLLM() })
    const task = await store.createTask({ prompt: '生成一张商超小票', materialManifest: textMaterialManifest() })

    const done = await orchestrator.runTask(task.id)
    const events = await store.listEvents(task.id)

    expect(done.status).toBe('review')
    expect(done.resultId).toBeTruthy()
    expect(events.some(record => record.event.type === 'result.ready')).toBe(true)
  })

  it('keeps workflow steps running while their work is in progress', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store, llm: createSchemaLLM() })
    const task = await store.createTask({ prompt: '生成一张商超小票', materialManifest: textMaterialManifest() })

    await orchestrator.runTask(task.id)
    const events = (await store.listEvents(task.id)).map(record => record.event)
    const indexOf = (type: 'step.started' | 'step.completed', step: string) => {
      return events.findIndex(event => event.type === type && event.step === step)
    }
    const intakeStarted = indexOf('step.started', 'intake')
    const intakeCompleted = indexOf('step.completed', 'intake')
    const planStarted = indexOf('step.started', 'plan')
    const planCompleted = indexOf('step.completed', 'plan')
    const contractToolStarted = events.findIndex(event => event.type === 'tool.started' && event.toolId === 'contract')
    const contractCompleted = indexOf('step.completed', 'contract')
    const layoutToolStarted = events.findIndex(event => event.type === 'tool.started' && event.toolId === 'layout')
    const layoutCompleted = indexOf('step.completed', 'layout')

    expect(intakeStarted).toBeGreaterThanOrEqual(0)
    expect(intakeCompleted).toBeGreaterThan(intakeStarted)
    expect(planStarted).toBeGreaterThan(intakeCompleted)
    expect(planCompleted).toBeGreaterThan(planStarted)
    expect(contractToolStarted).toBeGreaterThan(indexOf('step.started', 'contract'))
    expect(contractCompleted).toBeGreaterThan(contractToolStarted)
    expect(layoutToolStarted).toBeGreaterThan(indexOf('step.started', 'layout'))
    expect(layoutCompleted).toBeGreaterThan(layoutToolStarted)
  })

  it('does not send max token limits to the Schema Agent LLM request', async () => {
    const store = new MemoryAssistantStore()
    const llm = createSchemaLLM()
    const orchestrator = new AssistantOrchestrator({ store, llm })
    const task = await store.createTask({ prompt: '生成一个复杂原型界面', materialManifest: textMaterialManifest() })

    await orchestrator.runTask(task.id)

    const schemaRequest = llm.requests.at(-1) as { options?: { maxTokens?: number } }
    expect(schemaRequest.options?.maxTokens).toBeUndefined()
  })

  it('exposes Hono task endpoints', async () => {
    const app = createAssistantApp({ llm: createSchemaLLM() })
    const response = await app.request('/assistant/tasks', {
      method: 'POST',
      body: JSON.stringify({ input: { prompt: '生成一张商超小票', materialManifest: textMaterialManifest() } }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(202)
    const payload = await response.json() as { task: { id: string } }
    expect(payload.task.id).toMatch(/^task_/)
  })

  it('accepts per-request LLM config without storing it in task input', async () => {
    const store = new MemoryAssistantStore()
    const createTask = vi.fn(async (input, runtime) => {
      const task = await store.createTask(input)
      expect(runtime).toEqual(expect.objectContaining({ llm: expect.any(Object) }))
      return task
    })
    const app = createAssistantApp({
      orchestrator: { store, createTask } as unknown as AssistantOrchestrator,
      requestLLM: {
        enabled: true,
        allowInsecureBaseURL: true,
        allowPrivateBaseURL: true,
      },
    })

    const response = await app.request('/assistant/tasks', {
      method: 'POST',
      body: JSON.stringify({
        input: { prompt: '生成一张商超小票' },
        runtime: {
          llm: {
            provider: 'openai-compatible',
            apiKey: 'user-key',
            model: 'local-model',
            baseURL: 'http://127.0.0.1:11434/v1',
          },
        },
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(202)
    const task = (await store.listTasks())[0]
    expect(JSON.stringify(task)).not.toContain('user-key')
    expect(createTask).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: '生成一张商超小票' }),
      expect.objectContaining({ llm: expect.any(Object) }),
    )
  })

  it('rejects request LLM config unless the service explicitly enables it', async () => {
    const app = createAssistantApp()
    const response = await app.request('/assistant/tasks', {
      method: 'POST',
      body: JSON.stringify({
        input: { prompt: '生成一张商超小票' },
        runtime: { llm: { provider: 'openai', apiKey: 'user-key' } },
      }),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(400)
  })

  it('keeps concurrent runtime LLM clients isolated by run', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store })
    const taskA = await store.createTask({ prompt: '生成 A 单据', materialManifest: textMaterialManifest() })
    const taskB = await store.createTask({ prompt: '生成 B 单据', materialManifest: textMaterialManifest() })
    const llmA = createSchemaLLMWithMemory(schemaPayloadWithTitle('A 专属标题'))
    const llmB = createSchemaLLMWithMemory(schemaPayloadWithTitle('B 专属标题'))

    const [doneA, doneB] = await Promise.all([
      orchestrator.runTask(taskA.id, { llm: llmA }),
      orchestrator.runTask(taskB.id, { llm: llmB }),
    ])

    const resultA = await store.getResult(doneA.resultId!)
    const resultB = await store.getResult(doneB.resultId!)
    expect(JSON.stringify(resultA?.schema)).toContain('A 专属标题')
    expect(JSON.stringify(resultB?.schema)).toContain('B 专属标题')
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
    const orchestrator = new AssistantOrchestrator({
      store,
      llm: new SequenceLLMClient([
        { requiresClarification: true, questions: ['这是报价单、出库单、收据，还是其他类型的单据？'], suggestedAnswers: [['报价单', '出库单', '收据']], taskType: 'generic-document' },
        ...schemaLLMPayloads(),
      ]),
    })
    const task = await store.createTask({ prompt: '帮我做个单据', materialManifest: textMaterialManifest() })

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
    const orchestrator = new AssistantOrchestrator({ store, llm: createSchemaLLM() })
    const app = createAssistantApp({ orchestrator })
    const task = await store.createTask({ prompt: '生成一张商超小票', materialManifest: textMaterialManifest() })
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
    const orchestrator = new AssistantOrchestrator({ store, llm: createSchemaLLM() })
    const currentSchema = createSchema('before')
    const task = await store.createTask({ prompt: '生成一张商超小票', currentSchema, materialManifest: textMaterialManifest() })
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

  it('fails generation when the Designer material manifest is absent', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store, llm: createSchemaLLM() })
    const task = await store.createTask({ prompt: '生成一个报价单' })

    await expect(orchestrator.runTask(task.id)).rejects.toThrow('Schema Agent requires an LLM client and a Designer material manifest.')

    const failed = await store.getTask(task.id)
    expect(failed?.status).toBe('failed')
    expect(failed?.error).toContain('Schema Agent requires an LLM client and a Designer material manifest.')
  })

  it('fails generation when no LLM client is configured', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store })
    const task = await store.createTask({ prompt: '生成一个报价单', materialManifest: textMaterialManifest() })

    await expect(orchestrator.runTask(task.id)).rejects.toThrow('Schema Agent requires an LLM client and a Designer material manifest.')

    const failed = await store.getTask(task.id)
    expect(failed?.status).toBe('failed')
  })

  it('prefers the migrated MCP schema prompt over legacy profiles when the LLM returns a full schema', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({ store, llm: createSchemaLLM() })
    const task = await store.createTask({
      prompt: '生成一个报价单',
      materialManifest: textMaterialManifest(),
    })

    const reviewed = await orchestrator.runTask(task.id)
    const result = await store.getResult(reviewed.resultId!)

    expect(reviewed.status).toBe('review')
    expect(result?.validation.valid).toBe(true)
    expect(result?.dataSource?.id).toBe('quote')
    expect(result?.preview.warnings.join('\n')).toContain('Schema Agent used registered Designer materials')
  })

  it('repairs missing schema shell fields before validating a schema-agent result', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({
      store,
      llm: createSchemaLLM({
        schema: {
          unit: 'mm',
          page: { mode: 'fixed', width: 210, height: 297 },
          elements: [{
            id: 'txt-title',
            type: 'text',
            x: 16,
            y: 16,
            width: 178,
            height: 8,
            props: {
              content: '直出报价单',
              fontSize: 5,
              fontWeight: 'bold',
              textAlign: 'center',
              verticalAlign: 'middle',
              color: '#111827',
            },
          }],
        },
        expectedDataSource: {
          name: 'quote',
          fields: [
            { name: 'customer', path: 'customer', title: '客户', type: 'string' },
          ],
          sampleData: { customer: '示例客户' },
        },
      }),
    })
    const task = await store.createTask({
      prompt: '生成一个报价单',
      materialManifest: textMaterialManifest(),
    })

    const reviewed = await orchestrator.runTask(task.id)
    const result = await store.getResult(reviewed.resultId!)

    expect(reviewed.status).toBe('review')
    expect(result?.validation.valid).toBe(true)
    expect(result?.schema.version).toBe('1.0.0')
    expect(result?.schema.guides).toEqual({ x: [], y: [] })
  })

  it('normalizes invalid schema pageModel shape returned by schema agent', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({
      store,
      llm: createSchemaLLM({
        schema: {
          version: '1.0.0',
          unit: 'mm',
          page: {
            mode: 'fixed',
            width: 210,
            height: 297,
            pageModel: {
              kind: 'screen',
              paper: { width: 210, height: 0 },
            },
          },
          guides: { x: [], y: [] },
          elements: [{
            id: 'txt-title',
            type: 'text',
            x: 16,
            y: 16,
            width: 178,
            height: 8,
            props: {
              content: '页面模型修复验证',
              fontSize: 5,
              fontWeight: 'bold',
              textAlign: 'center',
              verticalAlign: 'middle',
              color: '#111827',
            },
          }],
        },
        expectedDataSource: {
          name: 'quote',
          fields: [
            { name: 'customer', path: 'customer', title: '客户', type: 'string' },
          ],
          sampleData: { customer: '示例客户' },
        },
      }),
    })
    const task = await store.createTask({
      prompt: '生成一个报价单',
      materialManifest: textMaterialManifest(),
    })

    const reviewed = await orchestrator.runTask(task.id)
    const result = await store.getResult(reviewed.resultId!)

    expect(reviewed.status).toBe('review')
    expect(result?.validation.valid).toBe(true)
    expect(result?.schema.page.pageModel?.kind).toBe('paged-paper')
    expect(result?.schema.page.pageModel?.paper.height).toBe(297)
  })

  it('reports schema-agent material output that is not in the active manifest', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({
      store,
      llm: createSchemaLLM({
        schema: {
          version: '1.0.0',
          unit: 'mm',
          page: { mode: 'fixed', width: 210, height: 297 },
          guides: { x: [], y: [] },
          elements: [{
            id: 'tbl-items',
            type: 'table-data',
            x: 16,
            y: 24,
            width: 178,
            height: 40,
            props: {},
          }],
        },
        expectedDataSource: {
          name: 'quote',
          fields: [{ name: 'items', path: 'items', title: '明细', type: 'array' }],
          sampleData: { items: [] },
        },
      }),
    })
    const task = await store.createTask({
      prompt: '生成一张商超小票',
      materialManifest: textMaterialManifest(),
    })

    const reviewed = await orchestrator.runTask(task.id)
    const result = await store.getResult(reviewed.resultId!)

    expect(reviewed.status).toBe('review')
    expect(result?.validation.valid).toBe(false)
    expect(result?.validation.errors).toContainEqual(expect.objectContaining({
      code: 'UNREGISTERED_MATERIAL_TYPE',
    }))
  })

  it('normalizes schema-agent expectedDataSource field maps into field arrays', async () => {
    const store = new MemoryAssistantStore()
    const orchestrator = new AssistantOrchestrator({
      store,
      llm: createSchemaLLM({
        schema: defaultSchemaAgentPayload().schema,
        expectedDataSource: {
          name: 'quote',
          fields: {
            customer: {
              title: '客户',
              type: 'object',
              children: {
                name: { title: '客户名称', type: 'string' },
              },
            },
          },
          sampleData: { customer: { name: '示例客户' } },
        },
      }),
    })
    const task = await store.createTask({ prompt: '生成一个报价单', materialManifest: textMaterialManifest() })

    const reviewed = await orchestrator.runTask(task.id)
    const result = await store.getResult(reviewed.resultId!)

    expect(result?.dataSource?.fields).toEqual([
      expect.objectContaining({
        name: 'customer',
        path: 'customer',
        fields: [expect.objectContaining({ name: 'name', path: 'customer/name' })],
      }),
    ])
  })

  it('does not synthesize hidden planning defaults when Planner omits facts', async () => {
    const store = new MemoryAssistantStore()
    const llm = new SequenceLLMClient([
      { requiresClarification: false, questions: [], suggestedAnswers: [], taskType: 'quote' },
      { requiresClarification: false, questions: [], suggestedAnswers: [], taskType: 'quote' },
      {},
      { explanation: '校验前会经过 capability validate。' },
      { name: 'receipt', fields: [], sampleData: {}, warnings: [] },
      { blocks: [], warnings: [] },
      defaultSchemaAgentPayload(),
    ])
    const orchestrator = new AssistantOrchestrator({ store, llm })
    const task = await store.createTask({ prompt: '生成一张商超小票', materialManifest: textMaterialManifest() })

    await orchestrator.runTask(task.id)

    const schemaAgentRequest = llm.requests.at(-1) as { messages: Array<{ role: string, content: string }> }
    const userMessage = schemaAgentRequest.messages.find(message => message.role === 'user')?.content ?? ''
    const planningBrief = JSON.parse(userMessage.match(/EasyInk planning brief:\n([\s\S]*?)\n\n/)?.[1] ?? '{}') as {
      page?: unknown
      requiredBlocks?: string[]
      dataNeeds?: string[]
      styleHints?: string[]
    }

    expect(planningBrief.page).toBeUndefined()
    expect(planningBrief.requiredBlocks).toEqual([])
    expect(planningBrief.dataNeeds).toEqual([])
    expect(planningBrief.styleHints).toEqual([])
  })

  it('injects enabled plugin context into schema generation prompts', async () => {
    const store = new MemoryAssistantStore()
    const llm = createSchemaLLM()
    const orchestrator = new AssistantOrchestrator({ store, llm })
    const task = await store.createTask({
      prompt: '生成一个原型页面',
      materialManifest: textMaterialManifest(),
      pluginSelection: {
        plugins: [{
          pluginId: 'plugin.prototype',
          enabled: true,
          contributions: [{
            target: 'schema',
            title: 'Prototype plugin',
            content: 'Use prototype placeholder images.',
          }],
          contextItems: [{
            id: 'brand-banner',
            kind: 'image-reference',
            title: 'Brand banner',
            url: 'https://cdn.example.test/banner.png',
          }],
        }],
      },
    })

    await orchestrator.runTask(task.id)

    const schemaAgentRequest = llm.requests.at(-1) as { messages: Array<{ role: string, content: string }> }
    const systemMessage = schemaAgentRequest.messages.find(message => message.role === 'system')?.content ?? ''
    expect(systemMessage).toContain('## Enabled Assistant Plugins')
    expect(systemMessage).toContain('Use prototype placeholder images.')
    expect(systemMessage).toContain('https://cdn.example.test/banner.png')
  })

  it('produces the v2 contract/layout/repair workflow step sequence', async () => {
    const graph = createAssistantWorkflowGraph()
    const result = await graph.invoke({ input: { prompt: '生成一张商超小票' }, steps: [] })

    expect(result.steps).toEqual([
      'intake',
      'plan',
      'source',
      'contract',
      'layout',
      'compose',
      'validate',
      'repair',
      'review',
    ])
  })

  it('repairs an invalid schema in the bounded loop and terminates on the first success', async () => {
    const store = new MemoryAssistantStore()
    const llm = new SequenceLLMClient([
      ...upstreamLLMPayloads(),
      invalidSchemaAgentPayload(),
      defaultSchemaAgentPayload(),
    ])
    const orchestrator = new AssistantOrchestrator({ store, llm })
    const task = await store.createTask({ prompt: '生成一张商超小票', materialManifest: textMaterialManifest() })

    const reviewed = await orchestrator.runTask(task.id)
    const result = await store.getResult(reviewed.resultId!)
    const events = await store.listEvents(task.id)
    const repairStarts = events.filter(record => record.event.type === 'tool.started' && record.event.toolId === 'repair')

    expect(reviewed.status).toBe('review')
    expect(result?.validation.valid).toBe(true)
    expect(events.some(record => record.event.type === 'step.started' && record.event.step === 'repair')).toBe(true)
    expect(repairStarts.length).toBe(1)
  })

  it('stops the bounded repair loop at the max retry count and returns the best-effort schema', async () => {
    const store = new MemoryAssistantStore()
    const llm = new SequenceLLMClient([
      ...upstreamLLMPayloads(),
      invalidSchemaAgentPayload(),
      invalidSchemaAgentPayload(),
      invalidSchemaAgentPayload(),
    ])
    const orchestrator = new AssistantOrchestrator({ store, llm })
    const task = await store.createTask({ prompt: '生成一张商超小票', materialManifest: textMaterialManifest() })

    const reviewed = await orchestrator.runTask(task.id)
    const result = await store.getResult(reviewed.resultId!)
    const events = await store.listEvents(task.id)
    const repairStarts = events.filter(record => record.event.type === 'tool.started' && record.event.toolId === 'repair')

    expect(reviewed.status).toBe('review')
    expect(result?.validation.valid).toBe(false)
    expect(repairStarts.length).toBe(2)
    expect(result?.preview.warnings.join('\n')).toContain('已返回当前最优结果')
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

function createSchemaLLM(schemaPayload: unknown = defaultSchemaAgentPayload()) {
  return new SequenceLLMClient(schemaLLMPayloads(schemaPayload))
}

function createSchemaLLMWithMemory(schemaPayload: unknown = defaultSchemaAgentPayload()) {
  const payloads = schemaLLMPayloads(schemaPayload)
  return new SequenceLLMClient([
    'memory',
    payloads[0],
    'memory',
    ...payloads.slice(1),
  ])
}

function schemaLLMPayloads(schemaPayload: unknown = defaultSchemaAgentPayload()) {
  return [
    { requiresClarification: false, questions: [], suggestedAnswers: [], taskType: 'quote' },
    { requiresClarification: false, questions: [], suggestedAnswers: [], taskType: 'quote' },
    {
      documentIntent: 'business quote document',
      page: { mode: 'fixed', width: 210, height: 297, reason: 'A4 business document.' },
      confidence: 'high',
      requiredBlocks: ['title', 'customer information'],
      dataNeeds: ['customer'],
      styleHints: ['professional print layout'],
      uncertainty: [],
      warnings: [],
    },
    { explanation: '校验前会经过 capability validate。' },
    {
      name: 'quote',
      fields: [{ name: 'customer', path: 'customer', title: '客户', type: 'string' }],
      sampleData: { customer: '示例客户' },
      warnings: [],
    },
    {
      blocks: [{ id: 'txt-title', type: 'text', x: 16, y: 16, width: 178, height: 8 }],
      warnings: [],
    },
    schemaPayload,
  ]
}

function upstreamLLMPayloads() {
  return [
    { requiresClarification: false, questions: [], suggestedAnswers: [], taskType: 'quote' },
    { requiresClarification: false, questions: [], suggestedAnswers: [], taskType: 'quote' },
    {
      documentIntent: 'business quote document',
      page: { mode: 'fixed', width: 210, height: 297, reason: 'A4 business document.' },
      confidence: 'high',
      requiredBlocks: ['title'],
      dataNeeds: ['customer'],
      styleHints: [],
      uncertainty: [],
      warnings: [],
    },
    { explanation: '校验前会经过 capability validate。' },
    {
      name: 'quote',
      fields: [{ name: 'customer', path: 'customer', title: '客户', type: 'string' }],
      sampleData: { customer: '示例客户' },
      warnings: [],
    },
    { blocks: [{ id: 'txt-title', type: 'text', x: 16, y: 16, width: 178, height: 8 }], warnings: [] },
  ]
}

function invalidSchemaAgentPayload() {
  return {
    schema: {
      version: '1.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 210, height: 297 },
      guides: { x: [], y: [] },
      elements: [{
        id: 'tbl-items',
        type: 'table-data',
        x: 16,
        y: 24,
        width: 178,
        height: 40,
        props: {},
      }],
    },
    expectedDataSource: {
      name: 'quote',
      fields: [{ name: 'items', path: 'items', title: '明细', type: 'array' }],
      sampleData: { items: [] },
    },
  }
}

function defaultSchemaAgentPayload() {
  return {
    schema: {
      version: '1.0.0',
      unit: 'mm',
      page: { mode: 'fixed', width: 210, height: 297 },
      guides: { x: [], y: [] },
      elements: [
        {
          id: 'txt-title',
          type: 'text',
          x: 16,
          y: 16,
          width: 178,
          height: 8,
          props: {
            content: '直出报价单',
            fontSize: 5,
            fontWeight: 'bold',
            textAlign: 'center',
            verticalAlign: 'middle',
            color: '#111827',
          },
        },
        {
          id: 'txt-customer',
          type: 'text',
          x: 16,
          y: 28,
          width: 178,
          height: 5,
          props: {
            content: '客户：',
            fontSize: 3,
            textAlign: 'left',
            verticalAlign: 'middle',
            color: '#111827',
          },
          binding: {
            sourceId: 'quote',
            sourceName: 'quote',
            fieldPath: 'customer',
            fieldLabel: '客户',
          },
        },
      ],
    },
    expectedDataSource: {
      name: 'quote',
      fields: [
        { name: 'customer', path: 'customer', title: '客户', type: 'string' },
      ],
      sampleData: { customer: '示例客户' },
    },
  }
}

function schemaPayloadWithTitle(title: string) {
  const payload = defaultSchemaAgentPayload()
  return {
    ...payload,
    schema: {
      ...payload.schema,
      elements: payload.schema.elements.map((element) => {
        if (element.id !== 'txt-title')
          return element
        return {
          ...element,
          props: {
            ...element.props,
            content: title,
          },
        }
      }),
    },
  }
}

function textMaterialManifest(): AssistantMaterialManifest {
  return {
    materials: [
      {
        type: 'text',
        name: 'Text',
        capabilities: { bindable: true },
        binding: { kind: 'ordinary', primaryProp: 'content' },
        ai: {
          type: 'text',
          description: 'Designer-registered text material.',
          properties: ['content', 'fontSize', 'fontWeight', 'textAlign', 'verticalAlign', 'color'],
          binding: 'single' as const,
        },
      },
    ],
  }
}

class SequenceLLMClient {
  private index = 0
  readonly requests: unknown[] = []

  constructor(private readonly payloads: unknown[]) {}

  async complete(request?: unknown) {
    this.requests.push(request)
    const payload = this.payloads[this.index] ?? {}
    this.index += 1
    return {
      content: typeof payload === 'string' ? payload : JSON.stringify(payload),
      model: 'sequence',
    }
  }
}
