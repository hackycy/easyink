/**
 * @vitest-environment happy-dom
 */
import type { AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord, AssistantTaskRecord } from '@easyink/assistant-store'
import type { AssistantApiClient, AssistantStreamHandlers } from '../api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import ConversationPanel from './ConversationPanel.vue'

describe('assistant conversation panel', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('opens a single SSE stream after submitting a prompt', async () => {
    const task = createTask()
    const { api } = createStreamingClient({ createTask: vi.fn().mockResolvedValue(task) })
    mount({ apiClient: api })

    await submitPrompt('生成小票')

    expect(api.createTask).toHaveBeenCalledTimes(1)
    expect(api.streamTask).toHaveBeenCalledTimes(1)
    expect(api.streamTask).toHaveBeenCalledWith(task.id, expect.any(Object))
    expect(api.listEvents).not.toHaveBeenCalled()
    expect(api.getTask).not.toHaveBeenCalled()
  })

  it('renders checklist progress and the result card from streamed events', async () => {
    const task = createTask()
    const { api, getHandlers } = createStreamingClient({ createTask: vi.fn().mockResolvedValue(task) })
    mount({ apiClient: api })

    await submitPrompt('生成小票')

    const events: AssistantEventRecord[] = [
      { id: 'evt_1', taskId: task.id, event: { type: 'task.created', taskId: task.id }, createdAt: 1 },
      { id: 'evt_2', taskId: task.id, event: { type: 'step.started', taskId: task.id, step: 'intake' }, createdAt: 2 },
    ]
    getHandlers().onSnapshot?.({ task, events })
    await nextTick()
    expect(document.body.textContent).toContain('理解需求')
    expect(document.body.textContent).toContain('执行中')

    getHandlers().onResult?.(createResult(task.id))
    await nextTick()
    expect(document.body.textContent).toContain('生成完成，可以应用')
    expect(document.body.textContent).toContain('应用到设计器')
  })

  it('surfaces a stream error and offers a retry', async () => {
    const task = createTask()
    const { api, getHandlers } = createStreamingClient({ createTask: vi.fn().mockResolvedValue(task) })
    mount({ apiClient: api })

    await submitPrompt('生成小票')
    getHandlers().onError?.(new Error('连接已断开'))
    await nextTick()

    expect(document.body.textContent).toContain('连接已断开')
    expect(document.body.textContent).toContain('重试')
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

function createResult(taskId: string): AssistantResult {
  return {
    id: `result_${taskId}`,
    schema: { version: 1, pages: [] },
    patch: [],
    diff: { operations: [] },
    validation: { valid: true, errors: [] },
    preview: {
      title: '小票模板',
      page: { width: 80, height: 200, unit: 'mm' },
      elementCount: 4,
      dataFieldCount: 2,
      warnings: [],
    },
    createdAt: 5,
  } as unknown as AssistantResult
}

function createStreamingClient(overrides: Partial<AssistantApiClient>) {
  let handlers: AssistantStreamHandlers = {}
  const streamTask = vi.fn((_taskId: string, next: AssistantStreamHandlers) => {
    handlers = next
    return { close: vi.fn() }
  })
  const api: AssistantApiClient = {
    createTask: vi.fn(),
    getTask: vi.fn(),
    listEvents: vi.fn(),
    streamTask,
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
  return { api, getHandlers: () => handlers }
}

async function flushPromises() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}
