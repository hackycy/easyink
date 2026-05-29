/**
 * @vitest-environment happy-dom
 */
import type { AssistantEventRecord, AssistantSourceSampleRecord, AssistantTaskRecord } from '@easyink/assistant-store'
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

  it('does not request a source sample for tasks without source input', async () => {
    const task = createTask()
    const api = createApiClient({
      createTask: vi.fn().mockResolvedValue(task),
      getTask: vi.fn().mockResolvedValue({ task }),
      listEvents: vi.fn().mockResolvedValue([]),
      getSourceSample: vi.fn().mockResolvedValue(undefined),
    })
    mount({ apiClient: api })

    await submitPrompt('生成小票')

    expect(api.getSourceSample).not.toHaveBeenCalled()
  })

  it('loads a source sample after the source parser completes', async () => {
    const task = createTask({
      source: { kind: 'json', content: '{"orderNo":"A001"}' },
    })
    const events: AssistantEventRecord[] = [
      {
        id: 'evt_source',
        taskId: task.id,
        event: { type: 'tool.completed', taskId: task.id, toolId: 'source', summary: '识别到 1 个字段。' },
        createdAt: 2,
      },
    ]
    const sourceSample: AssistantSourceSampleRecord = {
      id: 'sample_1',
      taskId: task.id,
      sourceKind: 'json',
      descriptor: { fields: [{ name: 'orderNo' }] },
      sample: { orderNo: 'A001' },
      warnings: [],
      createdAt: 3,
    }
    const api = createApiClient({
      createTask: vi.fn().mockResolvedValue(task),
      getTask: vi.fn().mockResolvedValue({ task }),
      listEvents: vi.fn().mockResolvedValue(events),
      getSourceSample: vi.fn().mockResolvedValue(sourceSample),
    })
    mount({ apiClient: api })

    await submitPrompt('生成小票')

    expect(api.getSourceSample).toHaveBeenCalledWith(task.id)
  })
})

function mount(props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(ConversationPanel, props)
  app.mount(host)
  return app
}

async function submitPrompt(prompt: string) {
  const textarea = document.querySelector('textarea')
  textarea!.value = prompt
  textarea!.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  document.querySelector('.assistant-composer__bar button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
}

function createTask(input: Partial<AssistantTaskRecord['input']> = {}): AssistantTaskRecord {
  return {
    id: 'task_1',
    input: {
      prompt: '生成小票',
      source: { kind: 'none' },
      ...input,
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
