import type { AssistantResult } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord, AssistantTaskRecord } from '@easyink/assistant-store'
import { describe, expect, it } from 'vitest'
import { inferSourceFromText, projectTaskToMessages } from './projection'

describe('assistant message projection', () => {
  it('restores a conversation from task, events, and result', () => {
    const task: AssistantTaskRecord = {
      id: 'task_1',
      input: {
        prompt: '帮我生成一张 80mm 小票',
        source: { kind: 'json', content: '{"total":10}' },
      },
      status: 'review',
      step: 'review',
      resultId: 'result_1',
      createdAt: 1,
      updatedAt: 2,
    }
    const result = {
      id: 'result_1',
      patch: [],
      diff: { changed: false, operations: [], summary: ['No schema changes detected.'] },
      validation: { valid: true, errors: [], warnings: [], autoFixed: [] },
      preview: {
        title: '小票',
        page: { mode: 'fixed', width: 80, height: 120, unit: 'mm' },
        elementCount: 4,
        dataFieldCount: 1,
        warnings: [],
      },
      schema: { version: '1', unit: 'mm', page: { mode: 'fixed', width: 80, height: 120 }, elements: [] },
      createdAt: 8,
    } as unknown as AssistantResult
    const events: AssistantEventRecord[] = [
      { id: 'evt_1', taskId: task.id, event: { type: 'step.started', taskId: task.id, step: 'compose' }, createdAt: 4 },
      { id: 'evt_2', taskId: task.id, event: { type: 'result.ready', taskId: task.id, resultId: result.id }, createdAt: 7 },
    ]

    const messages = projectTaskToMessages({ task, events, result })

    expect(messages.map(message => message.kind)).toEqual(['text', 'source', 'turn', 'result', 'diff'])
  })

  it('aggregates started and completed events into turn steps', () => {
    const task: AssistantTaskRecord = {
      id: 'task_1',
      input: {
        prompt: '帮我生成一张 80mm 小票',
        source: { kind: 'none' },
      },
      status: 'running',
      step: 'plan',
      createdAt: 1,
      updatedAt: 2,
    }
    const events: AssistantEventRecord[] = [
      { id: 'evt_1', taskId: task.id, event: { type: 'step.started', taskId: task.id, step: 'intake' }, createdAt: 3 },
      { id: 'evt_2', taskId: task.id, event: { type: 'step.completed', taskId: task.id, step: 'intake' }, createdAt: 4 },
      { id: 'evt_3', taskId: task.id, event: { type: 'step.started', taskId: task.id, step: 'plan' }, createdAt: 5 },
    ]

    const messages = projectTaskToMessages({ task, events })
    const turn = messages.find(message => message.kind === 'turn')

    expect(turn).toBeDefined()
    if (turn?.kind !== 'turn')
      throw new Error('expected turn message')
    expect(turn.steps.map(step => step.title)).toEqual(['理解需求', '规划版式'])
    expect(turn.steps.map(step => step.status)).toEqual(['done', 'running'])
  })

  it('infers pasted JSON, curl, and URLs as source attachments', () => {
    expect(inferSourceFromText('{"items":[]}')?.kind).toBe('json')
    expect(inferSourceFromText('curl https://example.com')?.kind).toBe('curl')
    expect(inferSourceFromText('https://example.com/data.json')?.kind).toBe('http')
  })
})
