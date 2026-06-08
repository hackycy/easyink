import type { AssistantEventRecord } from '@easyink/assistant-store'
import { describe, expect, it } from 'vitest'
import { inferSourceFromText, projectChecklist, projectNarration } from './projection'

describe('assistant projection', () => {
  it('maps workflow events to the compact checklist phases', () => {
    const events: AssistantEventRecord[] = [
      { id: 'evt_1', taskId: 'task_1', event: { type: 'step.started', taskId: 'task_1', step: 'intake' }, createdAt: 1 },
      { id: 'evt_2', taskId: 'task_1', event: { type: 'step.completed', taskId: 'task_1', step: 'intake' }, createdAt: 2 },
      { id: 'evt_3', taskId: 'task_1', event: { type: 'step.started', taskId: 'task_1', step: 'plan' }, createdAt: 3 },
    ]

    const checklist = projectChecklist({ task: { status: 'running' }, events })

    expect(checklist.map(item => item.title)).toEqual(['理解需求', '解析数据', '选择物料', '规划版式', '生成模板', '校验结果'])
    expect(checklist.map(item => item.status)).toEqual(['done', 'done', 'running', 'pending', 'pending', 'pending'])
  })

  it('keeps a phase running until all of its own steps complete', () => {
    const events: AssistantEventRecord[] = [
      { id: 'evt_1', taskId: 'task_1', event: { type: 'step.started', taskId: 'task_1', step: 'plan' }, createdAt: 1 },
      { id: 'evt_2', taskId: 'task_1', event: { type: 'step.started', taskId: 'task_1', step: 'source' }, createdAt: 2 },
      { id: 'evt_3', taskId: 'task_1', event: { type: 'step.completed', taskId: 'task_1', step: 'source' }, createdAt: 3 },
    ]

    const checklist = projectChecklist({ task: { status: 'running' }, events })

    expect(checklist.map(item => item.status)).toEqual(['done', 'done', 'running', 'pending', 'pending', 'pending'])
  })

  it('collects narration and hides answered clarification prompts', () => {
    const events: AssistantEventRecord[] = [
      { id: 'evt_1', taskId: 'task_1', event: { type: 'thinking.delta', taskId: 'task_1', text: '正在理解你的模板需求……' }, createdAt: 1 },
      { id: 'evt_2', taskId: 'task_1', event: { type: 'clarification.required', taskId: 'task_1', questions: ['尺寸是多少？'], suggestedAnswers: [['80mm']] }, createdAt: 2 },
      { id: 'evt_3', taskId: 'task_1', event: { type: 'clarification.answered', taskId: 'task_1', answer: '80mm' }, createdAt: 3 },
    ]

    const narration = projectNarration(events)

    expect(narration.answer).toBe('正在理解你的模板需求……')
    expect(narration.clarification).toBeUndefined()
  })

  it('infers pasted JSON, curl, and URLs as source attachments', () => {
    expect(inferSourceFromText('{"items":[]}')?.kind).toBe('json')
    expect(inferSourceFromText('curl https://example.com')?.kind).toBe('curl')
    expect(inferSourceFromText('https://example.com/data.json')?.kind).toBe('http')
  })
})
