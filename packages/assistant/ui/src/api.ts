import type { AssistantResult, AssistantTaskInput } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord, AssistantTaskRecord } from '@easyink/assistant-store'

export interface AssistantTaskResponse {
  task: AssistantTaskRecord
  result?: AssistantResult
}

export interface AssistantApiClient {
  createTask: (input: AssistantTaskInput) => Promise<AssistantTaskRecord>
  getTask: (taskId: string) => Promise<AssistantTaskResponse>
  listEvents: (taskId: string) => Promise<AssistantEventRecord[]>
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
