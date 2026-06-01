import type { AssistantResult, AssistantTaskInput } from '@easyink/assistant-capabilities'
import type { RuntimeLLMConfig, RuntimeLLMProviderOption } from '@easyink/assistant-llm'
import type {
  AssistantEventRecord,
  AssistantProjectionSnapshotRecord,
  AssistantSnapshot,
  AssistantSourceSampleRecord,
  AssistantTaskRecord,
  AssistantVersionRecord,
} from '@easyink/assistant-store'

export interface AssistantTaskResponse {
  task: AssistantTaskRecord
  result?: AssistantResult
}

export interface AssistantRequestRuntime {
  llm?: RuntimeLLMConfig
}

export interface AssistantApiClientOptions {
  runtimeProvider?: () => AssistantRequestRuntime | undefined | Promise<AssistantRequestRuntime | undefined>
}

export interface AssistantCapabilitiesResponse {
  llm: {
    serverConfigured: boolean
    requestConfigEnabled: boolean
    providers: RuntimeLLMProviderOption[]
  }
}

export interface AssistantStreamSnapshot {
  task: AssistantTaskRecord
  events: AssistantEventRecord[]
  result?: AssistantResult
}

export interface AssistantStreamHandlers {
  onSnapshot?: (snapshot: AssistantStreamSnapshot) => void
  onEvent?: (record: AssistantEventRecord) => void
  onResult?: (result: AssistantResult) => void
  onError?: (error: unknown) => void
  onClose?: () => void
}

export interface AssistantStreamHandle {
  close: () => void
}

export interface AssistantClarificationPayload {
  answer: string
}

export interface AssistantApiClient {
  createTask: (input: AssistantTaskInput) => Promise<AssistantTaskRecord>
  getCapabilities: () => Promise<AssistantCapabilitiesResponse>
  getTask: (taskId: string) => Promise<AssistantTaskResponse>
  listEvents: (taskId: string) => Promise<AssistantEventRecord[]>
  streamTask: (taskId: string, handlers: AssistantStreamHandlers) => AssistantStreamHandle
  sendMessage: (taskId: string, payload: { message: string }) => Promise<AssistantTaskRecord>
  submitClarification: (taskId: string, payload: AssistantClarificationPayload) => Promise<AssistantTaskRecord>
  retryTask: (taskId: string) => Promise<AssistantTaskRecord>
  repairTask: (taskId: string) => Promise<AssistantTaskRecord>
  rollbackTask: (taskId: string) => Promise<AssistantTaskRecord>
  getResult: (taskId: string, resultId: string) => Promise<AssistantResult>
  listVersions: (taskId: string) => Promise<AssistantVersionRecord[]>
  getProjectionSnapshot: (taskId: string) => Promise<AssistantProjectionSnapshotRecord | undefined>
  getSourceSample: (taskId: string) => Promise<AssistantSourceSampleRecord | undefined>
  exportSnapshot: () => Promise<AssistantSnapshot>
  importSnapshot: (snapshot: AssistantSnapshot) => Promise<void>
  cleanupExpired: () => Promise<number>
  cancelTask: (taskId: string) => Promise<AssistantTaskRecord>
  applyTask: (taskId: string) => Promise<AssistantTaskRecord>
}

export class AssistantApiError extends Error {
  readonly status: number
  readonly statusText: string
  readonly body?: string

  constructor(response: Response, body?: string) {
    const statusText = response.statusText ? ` ${response.statusText}` : ''
    super(`HTTP ${response.status}${statusText}`)
    this.name = 'AssistantApiError'
    this.status = response.status
    this.statusText = response.statusText
    this.body = body
  }
}

export function createAssistantApiClient(baseUrl = '', options: AssistantApiClientOptions = {}): AssistantApiClient {
  const root = baseUrl.replace(/\/$/, '')

  return {
    async createTask(input) {
      const response = await request(`${root}/assistant/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          input,
          runtime: await resolveRequestRuntime(options),
        }),
      }) as { task: AssistantTaskRecord }
      return response.task
    },
    async getCapabilities() {
      return request(`${root}/assistant/capabilities`) as Promise<AssistantCapabilitiesResponse>
    },
    async getTask(taskId) {
      return request(`${root}/assistant/tasks/${taskId}`) as Promise<AssistantTaskResponse>
    },
    async listEvents(taskId) {
      const response = await fetch(`${root}/assistant/tasks/${taskId}/events`, {
        headers: { accept: 'text/event-stream' },
      })
      if (!response.ok)
        throw await createApiError(response)
      const text = await response.text()
      return parseSseEvents(text)
    },
    streamTask(taskId, handlers) {
      const controller = new AbortController()
      let closed = false
      const close = (): void => {
        if (closed)
          return
        closed = true
        controller.abort()
        handlers.onClose?.()
      }

      void (async () => {
        try {
          const response = await fetch(`${root}/assistant/tasks/${taskId}/stream`, {
            headers: { accept: 'text/event-stream' },
            signal: controller.signal,
          })
          if (!response.ok)
            throw await createApiError(response)
          if (!response.body)
            throw new Error('Assistant stream is not readable in this environment.')

          const reader = response.body.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          for (;;) {
            const { value, done } = await reader.read()
            if (done)
              break
            buffer += decoder.decode(value, { stream: true })
            let separator = buffer.indexOf('\n\n')
            while (separator !== -1) {
              const frame = buffer.slice(0, separator)
              buffer = buffer.slice(separator + 2)
              dispatchSseFrame(frame, handlers)
              separator = buffer.indexOf('\n\n')
            }
          }
        }
        catch (error) {
          if (!closed && !(error instanceof DOMException && error.name === 'AbortError'))
            handlers.onError?.(error)
        }
        finally {
          if (!closed)
            handlers.onClose?.()
          closed = true
        }
      })()

      return { close }
    },
    async sendMessage(taskId, payload) {
      const response = await request(`${root}/assistant/tasks/${taskId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          input: payload,
          runtime: await resolveRequestRuntime(options),
        }),
      }) as { task: AssistantTaskRecord }
      return response.task
    },
    async submitClarification(taskId, payload) {
      const response = await request(`${root}/assistant/tasks/${taskId}/clarifications`, {
        method: 'POST',
        body: JSON.stringify({
          input: payload,
          runtime: await resolveRequestRuntime(options),
        }),
      }) as { task: AssistantTaskRecord }
      return response.task
    },
    async retryTask(taskId) {
      const response = await request(`${root}/assistant/tasks/${taskId}/retry`, {
        method: 'POST',
        body: JSON.stringify({ runtime: await resolveRequestRuntime(options) }),
      }) as { task: AssistantTaskRecord }
      return response.task
    },
    async repairTask(taskId) {
      const response = await request(`${root}/assistant/tasks/${taskId}/repair`, {
        method: 'POST',
        body: JSON.stringify({ runtime: await resolveRequestRuntime(options) }),
      }) as { task: AssistantTaskRecord }
      return response.task
    },
    async rollbackTask(taskId) {
      const response = await request(`${root}/assistant/tasks/${taskId}/rollback`, { method: 'POST' }) as { task: AssistantTaskRecord }
      return response.task
    },
    async getResult(taskId, resultId) {
      const response = await request(`${root}/assistant/tasks/${taskId}/results/${resultId}`) as { result: AssistantResult }
      return response.result
    },
    async listVersions(taskId) {
      const response = await request(`${root}/assistant/tasks/${taskId}/versions`) as { versions: AssistantVersionRecord[] }
      return response.versions
    },
    async getProjectionSnapshot(taskId) {
      const response = await fetch(`${root}/assistant/tasks/${taskId}/projection`)
      if (response.status === 404)
        return undefined
      if (!response.ok)
        throw await createApiError(response)
      return ((await response.json()) as { projection: AssistantProjectionSnapshotRecord }).projection
    },
    async getSourceSample(taskId) {
      const response = await fetch(`${root}/assistant/tasks/${taskId}/source-sample`)
      if (response.status === 404)
        return undefined
      if (!response.ok)
        throw await createApiError(response)
      return ((await response.json()) as { sourceSample: AssistantSourceSampleRecord }).sourceSample
    },
    async exportSnapshot() {
      const response = await request(`${root}/assistant/snapshot`) as { snapshot: AssistantSnapshot }
      return response.snapshot
    },
    async importSnapshot(snapshot) {
      await request(`${root}/assistant/snapshot/import`, {
        method: 'POST',
        body: JSON.stringify({ snapshot }),
      })
    },
    async cleanupExpired() {
      const response = await request(`${root}/assistant/cleanup`, { method: 'POST' }) as { removed: number }
      return response.removed
    },
    async cancelTask(taskId) {
      const response = await request(`${root}/assistant/tasks/${taskId}/cancel`, { method: 'POST' }) as { task: AssistantTaskRecord }
      return response.task
    },
    async applyTask(taskId) {
      const response = await request(`${root}/assistant/tasks/${taskId}/apply`, { method: 'POST' }) as { task: AssistantTaskRecord }
      return response.task
    },
  }
}

async function resolveRequestRuntime(options: AssistantApiClientOptions): Promise<AssistantRequestRuntime | undefined> {
  const runtime = await options.runtimeProvider?.()
  return runtime?.llm ? runtime : undefined
}

async function request(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok)
    throw await createApiError(response)
  return response.json() as Promise<unknown>
}

async function createApiError(response: Response): Promise<AssistantApiError> {
  const body = await response.text().catch(() => undefined)
  return new AssistantApiError(response, body || undefined)
}

function dispatchSseFrame(frame: string, handlers: AssistantStreamHandlers): void {
  const trimmed = frame.trim()
  if (!trimmed || trimmed.startsWith(':'))
    return
  const eventName = trimmed.match(/^event: ?(.*)$/m)?.[1]?.trim()
  const dataLine = trimmed.match(/^data: ?(.*)$/m)?.[1]
  if (!eventName || dataLine === undefined)
    return
  let payload: unknown
  try {
    payload = JSON.parse(dataLine)
  }
  catch {
    return
  }
  if (eventName === 'snapshot')
    handlers.onSnapshot?.(payload as AssistantStreamSnapshot)
  else if (eventName === 'event')
    handlers.onEvent?.(payload as AssistantEventRecord)
  else if (eventName === 'result')
    handlers.onResult?.(payload as AssistantResult)
}

function parseSseEvents(text: string): AssistantEventRecord[] {
  return text
    .split('\n\n')
    .map(chunk => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const id = chunk.match(/^id: (.+)$/m)?.[1] ?? ''
      const data = chunk.match(/^data: (.+)$/m)?.[1] ?? '{}'
      return {
        id,
        taskId: JSON.parse(data).taskId,
        event: JSON.parse(data),
        createdAt: Date.now(),
      }
    })
}
