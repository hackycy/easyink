import type { LLMClient, RuntimeLLMProvider, RuntimeLLMProviderOption } from '@easyink/assistant-llm'
import type { AssistantStore } from '@easyink/assistant-store'
import type { AssistantRunRuntime } from './orchestrator'
import { AssistantTaskInputSchema } from '@easyink/assistant-capabilities'
import { createLLMClientFromConfig, RuntimeLLMConfigSchema } from '@easyink/assistant-llm'
import { Hono } from 'hono'
import { z } from 'zod'
import { AssistantOrchestrator } from './orchestrator'

export interface AssistantRequestLLMConfigOptions {
  enabled: true
  providers?: RuntimeLLMProvider[]
  allowCustomBaseURL?: boolean
  allowedBaseURLs?: string[]
  allowPrivateBaseURL?: boolean
  allowInsecureBaseURL?: boolean
}

export interface CreateAssistantAppOptions {
  orchestrator?: AssistantOrchestrator
  store?: AssistantStore
  llm?: LLMClient
  corsOrigin?: string
  requestLLM?: false | AssistantRequestLLMConfigOptions
}

const RuntimeRequestSchema = z.object({
  llm: RuntimeLLMConfigSchema.optional(),
}).optional()

const CreateTaskRequestSchema = z.object({
  input: AssistantTaskInputSchema,
  runtime: RuntimeRequestSchema,
})

const MessageRequestSchema = z.object({
  input: z.object({ message: z.string().min(1) }),
  runtime: RuntimeRequestSchema,
})

const ClarificationRequestSchema = z.object({
  input: z.object({ answer: z.string().min(1) }),
  runtime: RuntimeRequestSchema,
})

const RuntimeOnlyRequestSchema = z.object({
  runtime: RuntimeRequestSchema,
}).optional()

export function createAssistantApp(options: CreateAssistantAppOptions = {}) {
  const orchestrator = options.orchestrator ?? new AssistantOrchestrator({
    store: options.store,
    llm: options.llm,
  })
  const app = new Hono()

  app.onError((error, c) => {
    if (error instanceof z.ZodError)
      return c.json({ error: 'Invalid Assistant request.', issues: error.issues }, 400)
    if (error instanceof AssistantRequestError)
      return c.json({ error: error.message }, error.status)
    throw error
  })

  app.use('*', async (c, next) => {
    if (c.req.method === 'OPTIONS') {
      applyCorsHeaders(c, options.corsOrigin ?? '*')
      return new Response(null, { status: 204, headers: c.res.headers })
    }
    await next()
    applyCorsHeaders(c, options.corsOrigin ?? '*')
  })

  app.get('/health', c => c.json({ ok: true, service: 'easyink-assistant-orchestrator' }))

  app.get('/assistant/capabilities', (c) => {
    const requestLLM = normalizeRequestLLMPolicy(options.requestLLM)
    return c.json({
      llm: {
        serverConfigured: orchestrator.hasLLM,
        requestConfigEnabled: Boolean(requestLLM),
        providers: requestLLM ? buildProviderOptions(requestLLM.providers) : [],
      },
    })
  })

  app.post('/assistant/tasks', async (c) => {
    const body = CreateTaskRequestSchema.parse(await c.req.json())
    const runtime = resolveRequestRuntime(body.runtime, options.requestLLM)
    const task = await orchestrator.createTask(body.input, runtime)
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

  // Single long-lived SSE connection: replays history, then streams live
  // events (status, steps, AI answer, result, errors) until the task settles.
  app.get('/assistant/tasks/:id/stream', async (c) => {
    const taskId = c.req.param('id')
    const task = await orchestrator.store.getTask(taskId)
    if (!task)
      return c.json({ error: 'Task not found' }, 404)

    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let closed = false
        let heartbeat: ReturnType<typeof setInterval> | undefined
        let unsubscribe: (() => void) | undefined

        const write = (chunk: string): void => {
          if (closed)
            return
          try {
            controller.enqueue(encoder.encode(chunk))
          }
          catch {
            closed = true
          }
        }
        const send = (event: string, data: unknown): void => {
          write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        }
        const finish = (): void => {
          if (closed)
            return
          closed = true
          if (heartbeat)
            clearInterval(heartbeat)
          unsubscribe?.()
          try {
            controller.close()
          }
          catch {
            // controller may already be closed by the client
          }
        }

        const emitResult = async (resultId: string): Promise<void> => {
          const result = await orchestrator.store.getResult(resultId).catch(() => undefined)
          if (result)
            send('result', result)
        }

        // 1) Replay the current state so the client renders immediately.
        const history = await orchestrator.store.listEvents(taskId)
        const initialResult = task.resultId ? await orchestrator.store.getResult(task.resultId) : undefined
        send('snapshot', { task, events: history, result: initialResult })

        // 2) Subscribe to live events emitted by the running orchestrator.
        unsubscribe = orchestrator.store.subscribe(taskId, (record) => {
          send('event', record)
          const type = record.event.type
          if (type === 'result.ready')
            void emitResult(record.event.resultId)
          if (type === 'task.failed' || type === 'task.cancelled' || type === 'task.applied')
            finish()
        })

        // 3) If the task already settled before subscribing, close now.
        const TERMINAL = new Set(['failed', 'cancelled', 'done'])
        const latest = await orchestrator.store.getTask(taskId)
        if (latest && TERMINAL.has(latest.status))
          finish()

        // 4) Keep proxies from dropping an idle connection.
        heartbeat = setInterval(write, 15000, ': ping\n\n')

        c.req.raw.signal.addEventListener('abort', finish)
      },
    })

    return new Response(stream, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'connection': 'keep-alive',
        'x-accel-buffering': 'no',
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
    const body = MessageRequestSchema.parse(await c.req.json())
    const runtime = resolveRequestRuntime(body.runtime, options.requestLLM)
    const task = await orchestrator.appendMessage(c.req.param('id'), body.input.message, runtime)
    return c.json({ task }, 202)
  })

  app.post('/assistant/tasks/:id/clarifications', async (c) => {
    const body = ClarificationRequestSchema.parse(await c.req.json())
    const runtime = resolveRequestRuntime(body.runtime, options.requestLLM)
    const task = await orchestrator.answerClarification(c.req.param('id'), body.input.answer, runtime)
    return c.json({ task }, 202)
  })

  app.post('/assistant/tasks/:id/retry', async (c) => {
    const body = RuntimeOnlyRequestSchema.parse(await readOptionalJson(c.req.raw))
    const runtime = resolveRequestRuntime(body?.runtime, options.requestLLM)
    const task = await orchestrator.retryTask(c.req.param('id'), runtime)
    return c.json({ task }, 202)
  })

  app.post('/assistant/tasks/:id/repair', async (c) => {
    const body = RuntimeOnlyRequestSchema.parse(await readOptionalJson(c.req.raw))
    const runtime = resolveRequestRuntime(body?.runtime, options.requestLLM)
    const task = await orchestrator.repairTask(c.req.param('id'), runtime)
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

function resolveRequestRuntime(runtime: z.infer<typeof RuntimeRequestSchema>, option: CreateAssistantAppOptions['requestLLM']): AssistantRunRuntime {
  if (!runtime?.llm)
    return {}
  const policy = normalizeRequestLLMPolicy(option)
  if (!policy)
    throw new AssistantRequestError(400, 'Request LLM configuration is not enabled for this Assistant service.')
  validateRuntimeLLMConfig(runtime.llm, policy)
  return { llm: createLLMClientFromConfig(runtime.llm) }
}

function normalizeRequestLLMPolicy(option: CreateAssistantAppOptions['requestLLM']): AssistantRequestLLMConfigOptions | undefined {
  return option && option.enabled ? option : undefined
}

function validateRuntimeLLMConfig(config: z.infer<typeof RuntimeLLMConfigSchema>, policy: AssistantRequestLLMConfigOptions): void {
  const providers = policy.providers ?? ['openai', 'openai-compatible', 'anthropic']
  if (!providers.includes(config.provider))
    throw new AssistantRequestError(400, `Assistant service does not allow LLM provider: ${config.provider}`)
  if (config.provider === 'anthropic' && config.baseURL)
    throw new AssistantRequestError(400, 'baseURL is only supported by OpenAI-compatible providers.')
  if (!config.baseURL)
    return
  if (policy.allowCustomBaseURL === false && !isAllowedBaseURL(config.baseURL, policy.allowedBaseURLs ?? []))
    throw new AssistantRequestError(400, 'Custom LLM baseURL is not allowed by this Assistant service.')

  let url: URL
  try {
    url = new URL(config.baseURL)
  }
  catch {
    throw new AssistantRequestError(400, 'Invalid LLM baseURL.')
  }
  if (url.protocol !== 'https:' && !(policy.allowInsecureBaseURL && url.protocol === 'http:'))
    throw new AssistantRequestError(400, 'LLM baseURL must use HTTPS.')
  if (!policy.allowPrivateBaseURL && isPrivateHost(url.hostname))
    throw new AssistantRequestError(400, 'LLM baseURL must not point to localhost or a private network.')
}

function isAllowedBaseURL(value: string, allowed: string[]): boolean {
  if (allowed.includes(value))
    return true
  try {
    const url = new URL(value)
    return allowed.includes(url.origin)
  }
  catch {
    return false
  }
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1')
    return true
  const parts = host.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255))
    return false
  return parts[0] === 10
    || parts[0] === 127
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
}

async function readOptionalJson(request: Request): Promise<unknown> {
  const text = await request.text()
  return text.trim() ? JSON.parse(text) : undefined
}

function buildProviderOptions(providers: RuntimeLLMProvider[] = ['openai', 'openai-compatible', 'anthropic']): RuntimeLLMProviderOption[] {
  const options: Record<RuntimeLLMProvider, RuntimeLLMProviderOption> = {
    'openai': { provider: 'openai', label: 'OpenAI', model: 'gpt-5-mini' },
    'openai-compatible': { provider: 'openai-compatible', label: 'OpenAI Compatible' },
    'anthropic': { provider: 'anthropic', label: 'Anthropic', model: 'claude-sonnet-4-5' },
  }
  return providers.map(provider => options[provider]).filter(Boolean)
}

class AssistantRequestError extends Error {
  constructor(readonly status: 400 | 403, message: string) {
    super(message)
    this.name = 'AssistantRequestError'
  }
}

function applyCorsHeaders(c: { header: (name: string, value: string, options?: { append?: boolean }) => void }, origin: string): void {
  c.header('Access-Control-Allow-Origin', origin)
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  c.header('Access-Control-Allow-Headers', 'content-type, accept, authorization')
  if (origin !== '*')
    c.header('Vary', 'Origin', { append: true })
}
