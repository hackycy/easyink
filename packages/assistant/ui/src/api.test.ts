import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAssistantApiClient } from './api'

describe('assistant api client', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends task input in an envelope with runtime LLM config', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      task: {
        id: 'task_1',
        input: { prompt: '生成小票' },
        status: 'queued',
        step: 'idle',
        createdAt: 1,
        updatedAt: 1,
      },
    }) as never)
    const client = createAssistantApiClient('/api', {
      runtimeProvider: () => ({
        llm: {
          provider: 'openai-compatible',
          apiKey: 'user-key',
          model: 'local-model',
          baseURL: 'https://llm.example.test/v1',
        },
      }),
    })

    await client.createTask({ prompt: '生成小票' })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({
      input: { prompt: '生成小票' },
      runtime: {
        llm: {
          provider: 'openai-compatible',
          apiKey: 'user-key',
          model: 'local-model',
          baseURL: 'https://llm.example.test/v1',
        },
      },
    })
  })

  it('omits runtime when no user LLM config is available', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse({
      task: {
        id: 'task_1',
        input: { prompt: '生成小票' },
        status: 'queued',
        step: 'idle',
        createdAt: 1,
        updatedAt: 1,
      },
    }) as never)
    const client = createAssistantApiClient('/api', { runtimeProvider: () => undefined })

    await client.createTask({ prompt: '生成小票' })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(init.body))).toEqual({
      input: { prompt: '生成小票' },
    })
  })
})

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}
