import type { AssistantResult, AssistantTaskInput } from '@easyink/assistant-capabilities'
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

export interface AssistantClarificationPayload {
  answer: string
}

export interface AssistantApiClient {
  createTask: (input: AssistantTaskInput) => Promise<AssistantTaskRecord>
  getTask: (taskId: string) => Promise<AssistantTaskResponse>
  listEvents: (taskId: string) => Promise<AssistantEventRecord[]>
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

export function createAssistantApiClient(baseUrl = ''): AssistantApiClient {
  const root = baseUrl.replace(/\/$/, '')

  return {
    async createTask(input) {
      const response = await request(`${root}/assistant/tasks`, {
        method: 'POST',
        body: JSON.stringify(input),
      }) as { task: AssistantTaskRecord }
      return response.task
    },
    async getTask(taskId) {
      return request(`${root}/assistant/tasks/${taskId}`) as Promise<AssistantTaskResponse>
    },
    async listEvents(taskId) {
      const response = await fetch(`${root}/assistant/tasks/${taskId}/events`, {
        headers: { accept: 'text/event-stream' },
      })
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      return parseSseEvents(text)
    },
    async sendMessage(taskId, payload) {
      const response = await request(`${root}/assistant/tasks/${taskId}/messages`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }) as { task: AssistantTaskRecord }
      return response.task
    },
    async submitClarification(taskId, payload) {
      const response = await request(`${root}/assistant/tasks/${taskId}/clarifications`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }) as { task: AssistantTaskRecord }
      return response.task
    },
    async retryTask(taskId) {
      const response = await request(`${root}/assistant/tasks/${taskId}/retry`, { method: 'POST' }) as { task: AssistantTaskRecord }
      return response.task
    },
    async repairTask(taskId) {
      const response = await request(`${root}/assistant/tasks/${taskId}/repair`, { method: 'POST' }) as { task: AssistantTaskRecord }
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
        throw new Error(`HTTP ${response.status}`)
      return ((await response.json()) as { projection: AssistantProjectionSnapshotRecord }).projection
    },
    async getSourceSample(taskId) {
      const response = await fetch(`${root}/assistant/tasks/${taskId}/source-sample`)
      if (response.status === 404)
        return undefined
      if (!response.ok)
        throw new Error(`HTTP ${response.status}`)
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

async function request(url: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!response.ok)
    throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<unknown>
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
