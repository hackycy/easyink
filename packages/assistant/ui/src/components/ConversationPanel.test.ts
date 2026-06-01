/**
 * @vitest-environment happy-dom
 */
import type { AssistantResult } from '@easyink/assistant-capabilities'
import type { RuntimeLLMConfig } from '@easyink/assistant-llm'
import type { AssistantEventRecord, AssistantTaskRecord } from '@easyink/assistant-store'
import type { AssistantApiClient, AssistantStreamHandlers } from '../api'
import type { AssistantLLMConfigService } from '../runtime-llm'
import { MemoryAssistantStore } from '@easyink/assistant-store'
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
      { id: 'evt_3', taskId: task.id, event: { type: 'thinking.delta', taskId: task.id, text: '正在理解你的模板需求……' }, createdAt: 3 },
    ]
    getHandlers().onSnapshot?.({ task, events })
    await nextTick()
    expect(document.body.textContent).toContain('理解需求')
    expect(document.body.textContent).toContain('执行中')
    expect(document.body.textContent).toContain('我在梳理票据目标和关键内容')
    expect(document.body.textContent).not.toContain('正在理解你的模板需求')
    expect(document.querySelector('button[aria-label="停止生成"]')).toBeTruthy()

    getHandlers().onResult?.(createResult(task.id))
    await nextTick()
    expect(document.body.textContent).toContain('生成完成，可以应用')
    expect(document.body.textContent).toContain('应用到设计器')
    expect(document.body.textContent).not.toContain('我在梳理票据目标和关键内容')
  })

  it('lets users stop a running generation from the composer', async () => {
    const task = createTask()
    const { api, getHandlers } = createStreamingClient({ createTask: vi.fn().mockResolvedValue(task) })
    mount({ apiClient: api })

    await submitPrompt('生成小票')
    getHandlers().onSnapshot?.({
      task,
      events: [
        { id: 'evt_1', taskId: task.id, event: { type: 'task.created', taskId: task.id }, createdAt: 1 },
        { id: 'evt_2', taskId: task.id, event: { type: 'step.started', taskId: task.id, step: 'intake' }, createdAt: 2 },
      ],
    })
    await nextTick()

    document.querySelector('button[aria-label="停止生成"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(api.cancelTask).toHaveBeenCalledWith(task.id)
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

  it('restores the active conversation after the drawer unmounts', async () => {
    const store = new MemoryAssistantStore()
    const task = createTask()
    const result = createResult(task.id)
    await store.updateTask({ ...task, status: 'done', resultId: result.id })
    await store.saveEventRecord({ id: 'evt_1', taskId: task.id, event: { type: 'task.created', taskId: task.id }, createdAt: 1 })
    await store.saveResultRecord(result)
    await store.upsertConversation({
      id: 'assistant.panel',
      activeTaskId: task.id,
      title: task.input.prompt,
      status: 'done',
    })
    const { api } = createStreamingClient({
      getTask: vi.fn().mockResolvedValue({ task: { ...task, status: 'done', resultId: result.id }, result }),
      listEvents: vi.fn().mockResolvedValue([
        { id: 'evt_1', taskId: task.id, event: { type: 'task.created', taskId: task.id }, createdAt: 1 },
        { id: 'evt_2', taskId: task.id, event: { type: 'task.applied', taskId: task.id, resultId: result.id }, createdAt: 2 },
      ]),
    })

    mount({ apiClient: api, store, conversationId: 'assistant.panel' })
    await flushPromises()

    expect(document.body.textContent).toContain('生成小票')
    expect(document.body.textContent).toContain('生成完成，可以应用')
    expect(api.getTask).toHaveBeenCalledWith(task.id)
  })

  it('shows conversation history and starts a fresh conversation', async () => {
    const store = new MemoryAssistantStore()
    const oldTask = createTask({ prompt: '旧会话' })
    await store.updateTask({ ...oldTask, status: 'done' })
    await store.saveEventRecord({ id: 'evt_old', taskId: oldTask.id, event: { type: 'task.created', taskId: oldTask.id }, createdAt: 1 })
    await store.upsertConversation({
      id: 'conv_old',
      activeTaskId: oldTask.id,
      title: oldTask.input.prompt,
      status: 'done',
    })
    const newTask = createTask({ prompt: '新会话' })
    newTask.id = 'task_new'
    const { api } = createStreamingClient({
      getTask: vi.fn().mockResolvedValue({ task: oldTask }),
      listEvents: vi.fn().mockResolvedValue([{ id: 'evt_old', taskId: oldTask.id, event: { type: 'task.created', taskId: oldTask.id }, createdAt: 1 }]),
      createTask: vi.fn().mockResolvedValue(newTask),
    })

    const onStatusChange = vi.fn()
    mount({ apiClient: api, store, conversationId: 'conv_old', onStatusChange })
    await flushPromises()
    expect(document.body.textContent).toContain('旧会话')

    const newConversationButton = document.querySelector('button[aria-label="新建会话"]')
    expect(newConversationButton).toBeTruthy()
    ;(newConversationButton as HTMLButtonElement).click()
    await flushPromises()
    expect(onStatusChange).toHaveBeenCalledWith('idle')
    expect(document.querySelector('button[aria-label="发送"]')).toBeTruthy()
    expect(document.querySelector('textarea')?.hasAttribute('disabled')).toBe(false)

    await submitPrompt('新会话')
    document.querySelector('button[aria-label="历史会话"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(document.body.textContent).toContain('历史会话')
    expect(document.body.textContent).toContain('旧会话')
    expect(document.body.textContent).toContain('新会话')
  })

  it('keeps separate history entries for separate submitted tasks', async () => {
    const store = new MemoryAssistantStore()
    const firstTask = createTask({ prompt: '第一张小票' })
    firstTask.id = 'task_first'
    const secondTask = createTask({ prompt: '第二张标签' })
    secondTask.id = 'task_second'
    const { api } = createStreamingClient({
      createTask: vi.fn()
        .mockResolvedValueOnce(firstTask)
        .mockResolvedValueOnce(secondTask),
    })
    mount({ apiClient: api, store })

    await submitPrompt('第一张小票')
    await submitPrompt('第二张标签')

    const conversations = await store.listConversations()
    expect(conversations).toHaveLength(2)
    expect(new Set(conversations.map(conversation => conversation.title))).toEqual(new Set(['第一张小票', '第二张标签']))
    expect(new Set(conversations.map(conversation => conversation.activeTaskId))).toEqual(new Set(['task_first', 'task_second']))
  })

  it('requires two delete clicks before removing a history entry', async () => {
    const store = new MemoryAssistantStore()
    const oldTask = createTask({ prompt: '待删除会话' })
    await store.updateTask({ ...oldTask, status: 'done' })
    await store.saveEventRecord({ id: 'evt_old', taskId: oldTask.id, event: { type: 'task.created', taskId: oldTask.id }, createdAt: 1 })
    await store.upsertConversation({
      id: 'conv_old',
      activeTaskId: oldTask.id,
      title: oldTask.input.prompt,
      status: 'done',
    })
    const { api } = createStreamingClient({
      getTask: vi.fn().mockResolvedValue({ task: oldTask }),
      listEvents: vi.fn().mockResolvedValue([{ id: 'evt_old', taskId: oldTask.id, event: { type: 'task.created', taskId: oldTask.id }, createdAt: 1 }]),
    })
    const onStatusChange = vi.fn()

    mount({ apiClient: api, store, conversationId: 'conv_old', onStatusChange })
    await flushPromises()
    document.querySelector('button[aria-label="历史会话"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    const deleteButton = document.querySelector('button[aria-label="删除会话"]')
    expect(deleteButton).toBeTruthy()
    deleteButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(await store.getConversation('conv_old')).toBeTruthy()
    expect(document.querySelector('button[aria-label="确认删除会话"]')).toBeTruthy()

    document.querySelector('button[aria-label="确认删除会话"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(await store.getConversation('conv_old')).toBeUndefined()
    expect(document.body.textContent).not.toContain('待删除会话')
    expect(onStatusChange).toHaveBeenCalledWith('idle')
  })

  it('hides model configuration when no config service is provided', async () => {
    const { api } = createStreamingClient({})
    mount({ apiClient: api })
    await flushPromises()

    expect(document.querySelector('button[aria-label="模型配置"]')).toBeFalsy()
  })

  it('shows model configuration as a switchable content page', async () => {
    const service: AssistantLLMConfigService = {
      providers: [{ provider: 'openai', label: 'OpenAI', model: 'gpt-5-mini' }],
      load: () => undefined,
    }
    const { api } = createStreamingClient({})
    mount({ apiClient: api, llmConfig: service })
    await flushPromises()

    document.querySelector('button[aria-label="模型配置"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    expect(document.body.textContent).toContain('模型配置')
    expect(document.body.textContent).toContain('API Key 仅用于本次浏览器侧请求配置转发')
    expect(document.querySelector('.assistant-settings-form')).toBeTruthy()
    expect(document.body.textContent).not.toContain('暂无历史会话')
  })

  it('requires user LLM config when the service has no server model configured', async () => {
    let savedConfig: RuntimeLLMConfig | undefined
    const task = createTask()
    const service: AssistantLLMConfigService = {
      providers: [{ provider: 'openai', label: 'OpenAI', model: 'gpt-5-mini' }],
      load: () => savedConfig,
      save: (config) => {
        savedConfig = config
      },
      clear: () => {
        savedConfig = undefined
      },
    }
    const { api } = createStreamingClient({
      createTask: vi.fn().mockResolvedValue(task),
      getCapabilities: vi.fn().mockResolvedValue({
        llm: {
          serverConfigured: false,
          requestConfigEnabled: true,
          providers: [{ provider: 'openai', label: 'OpenAI', model: 'gpt-5-mini' }],
        },
      }),
    })
    mount({ apiClient: api, llmConfig: service })
    await flushPromises()

    await submitPrompt('生成小票')
    expect(api.createTask).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('请先配置模型凭据后再发送')
    expect(document.body.textContent).toContain('模型配置')
    expect(document.body.textContent).toContain('未配置')

    const apiKeyInput = document.querySelector('.assistant-settings-form input[type="password"]') as HTMLInputElement
    apiKeyInput.value = 'user-key'
    apiKeyInput.dispatchEvent(new Event('input', { bubbles: true }))
    document.querySelector('button[aria-label="保存模型配置"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()

    await submitPrompt('生成小票')
    expect(savedConfig).toMatchObject({ provider: 'openai', apiKey: 'user-key' })
    expect(api.createTask).toHaveBeenCalledTimes(1)
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
  document.querySelector('button[aria-label="发送"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
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
    getCapabilities: vi.fn(),
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
  for (let index = 0; index < 8; index += 1)
    await Promise.resolve()
  await nextTick()
}
