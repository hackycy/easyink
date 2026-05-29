/**
 * @vitest-environment happy-dom
 */
import type { AssistantTaskRecord } from '@easyink/assistant-store'
import type { AssistantApiClient } from '../api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import { AssistantApiError } from '../api'
import ConversationPanel from './ConversationPanel.vue'

describe('assistant conversation panel', () => {
  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('stops polling when a task refresh fails with 401', async () => {
    vi.useFakeTimers()
    const task = createTask()
    const api = createApiClient({
      createTask: vi.fn().mockResolvedValue(task),
      listEvents: vi.fn().mockRejectedValue(createApiError(401, 'Unauthorized')),
    })
    mount({ apiClient: api })

    const textarea = document.querySelector('textarea')
    textarea!.value = '生成小票'
    textarea!.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    document.querySelector('.assistant-composer__bar button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    await flushPromises()
    await vi.advanceTimersByTimeAsync(3500)

    expect(api.listEvents).toHaveBeenCalledTimes(1)
    expect(document.body.textContent).toContain('请求未授权')
  })
})

function mount(props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(ConversationPanel, props)
  app.mount(host)
  return app
}

function createTask(): AssistantTaskRecord {
  return {
    id: 'task_1',
    input: {
      prompt: '生成小票',
      source: { kind: 'none' },
    },
    status: 'queued',
    step: 'intake',
    createdAt: 1,
    updatedAt: 1,
  }
}

function createApiClient(overrides: Partial<AssistantApiClient>): AssistantApiClient {
  return {
    createTask: vi.fn(),
    getTask: vi.fn(),
    listEvents: vi.fn(),
    sendMessage: vi.fn(),
    submitClarification: vi.fn(),
    retryTask: vi.fn(),
    repairTask: vi.fn(),
    rollbackTask: vi.fn(),
    getResult: vi.fn(),
    listVersions: vi.fn().mockResolvedValue([]),
    getProjectionSnapshot: vi.fn(),
    getSourceSample: vi.fn(),
    exportSnapshot: vi.fn(),
    importSnapshot: vi.fn(),
    cleanupExpired: vi.fn(),
    cancelTask: vi.fn(),
    applyTask: vi.fn(),
    ...overrides,
  }
}

function createApiError(status: number, statusText: string) {
  return new AssistantApiError(new Response('', { status, statusText }))
}

async function flushPromises() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}
