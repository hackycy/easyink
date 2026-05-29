import type { AssistantResult, AssistantSourceInput } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord, AssistantSourceSampleRecord, AssistantTaskRecord, AssistantVersionRecord } from '@easyink/assistant-store'

export type AssistantConversationMessage
  = | { id: string, role: 'user', kind: 'text', text: string, createdAt: number }
    | { id: string, role: 'assistant', kind: 'text', text: string, createdAt: number }
    | { id: string, role: 'assistant', kind: 'progress', title: string, detail?: string, status: 'running' | 'done', createdAt: number }
    | { id: string, role: 'assistant', kind: 'source', source: AssistantSourceInput, title: string, detail: string, fields: string[], warnings: string[], createdAt: number }
    | { id: string, role: 'assistant', kind: 'result', result: AssistantResult, createdAt: number }
    | { id: string, role: 'assistant', kind: 'diff', result: AssistantResult, createdAt: number }
    | { id: string, role: 'assistant', kind: 'clarification', questions: ClarificationQuestion[], createdAt: number }
    | { id: string, role: 'assistant', kind: 'repair', result: AssistantResult, createdAt: number }
    | { id: string, role: 'assistant', kind: 'version', versions: AssistantVersionRecord[], createdAt: number }
    | { id: string, role: 'assistant', kind: 'error', text: string, createdAt: number }

export interface ClarificationQuestion {
  text: string
  suggestions: string[]
}

export interface ProjectTaskToMessagesInput {
  task?: AssistantTaskRecord
  events?: AssistantEventRecord[]
  result?: AssistantResult
  versions?: AssistantVersionRecord[]
  sourceSample?: AssistantSourceSampleRecord
  error?: string
}

const STEP_LABELS: Record<string, string> = {
  intake: '理解需求',
  plan: '规划模板',
  source: '解析数据源',
  compose: '生成模板',
  validate: '校验结果',
  repair: '修复问题',
  review: '等待确认',
  done: '已应用',
}

export function projectTaskToMessages(input: ProjectTaskToMessagesInput): AssistantConversationMessage[] {
  const { task, result, error } = input
  const events = input.events ?? []
  const versions = input.versions ?? []
  const messages: AssistantConversationMessage[] = []
  const stepMessages = new Map<string, Extract<AssistantConversationMessage, { kind: 'progress' }>>()

  if (task) {
    messages.push({
      id: `${task.id}:prompt`,
      role: 'user',
      kind: 'text',
      text: task.input.prompt,
      createdAt: task.createdAt,
    })

    if (task.input.source && task.input.source.kind !== 'none') {
      messages.push({
        id: `${task.id}:source`,
        role: 'assistant',
        kind: 'source',
        source: task.input.source,
        title: sourceTitle(task.input.source),
        detail: sourceDetail(task.input.source, input.sourceSample),
        fields: sourceFields(input.sourceSample),
        warnings: input.sourceSample?.warnings ?? [],
        createdAt: task.createdAt + 1,
      })
    }
  }

  for (const record of events) {
    const event = record.event
    if (event.type === 'step.started' || event.type === 'step.completed') {
      const key = `${record.taskId}:${event.step}`
      const existing = stepMessages.get(key)
      stepMessages.set(key, {
        id: `${record.taskId}:step:${event.step}`,
        role: 'assistant',
        kind: 'progress',
        title: STEP_LABELS[event.step] ?? event.step,
        status: event.type === 'step.completed' ? 'done' : 'running',
        createdAt: existing?.createdAt ?? record.createdAt,
      })
    }
    else if (event.type === 'clarification.required') {
      messages.push({
        id: record.id,
        role: 'assistant',
        kind: 'clarification',
        questions: event.questions.map((question, index) => ({
          text: question,
          suggestions: event.suggestedAnswers?.[index] ?? [],
        })),
        createdAt: record.createdAt,
      })
    }
    else if (event.type === 'clarification.answered') {
      messages.push({
        id: record.id,
        role: 'user',
        kind: 'text',
        text: event.answer,
        createdAt: record.createdAt,
      })
    }
    else if (event.type === 'task.failed') {
      messages.push({
        id: record.id,
        role: 'assistant',
        kind: 'error',
        text: event.error,
        createdAt: record.createdAt,
      })
    }
    else if (event.type === 'task.applied') {
      messages.push({
        id: record.id,
        role: 'assistant',
        kind: 'text',
        text: '已应用到设计器，并记录了版本。',
        createdAt: record.createdAt,
      })
    }
    else if (event.type === 'task.rolled-back') {
      messages.push({
        id: record.id,
        role: 'assistant',
        kind: 'text',
        text: '已回滚到应用前版本。',
        createdAt: record.createdAt,
      })
    }
  }
  messages.push(...stepMessages.values())

  if (result) {
    messages.push({ id: `${result.id}:result`, role: 'assistant', kind: 'result', result, createdAt: result.createdAt })
    messages.push({ id: `${result.id}:diff`, role: 'assistant', kind: 'diff', result, createdAt: result.createdAt + 1 })
    if (!result.validation.valid)
      messages.push({ id: `${result.id}:repair`, role: 'assistant', kind: 'repair', result, createdAt: result.createdAt + 2 })
  }

  if (versions.length) {
    messages.push({
      id: `${task?.id ?? 'task'}:versions:${versions[0]?.id ?? versions.length}`,
      role: 'assistant',
      kind: 'version',
      versions,
      createdAt: Math.max(...versions.map(version => version.createdAt)),
    })
  }

  if (error) {
    messages.push({ id: 'local:error', role: 'assistant', kind: 'error', text: error, createdAt: Date.now() })
  }

  return dedupeMessages(messages).sort((a, b) => a.createdAt - b.createdAt)
}

export function inferSourceFromText(text: string): AssistantSourceInput | undefined {
  const trimmed = text.trim()
  if (!trimmed)
    return undefined
  if (/^curl\s+/i.test(trimmed))
    return { kind: 'curl', content: trimmed }
  if (/^https?:\/\/\S+$/i.test(trimmed))
    return { kind: 'http', url: trimmed }
  try {
    JSON.parse(trimmed)
    return { kind: 'json', content: trimmed }
  }
  catch {
    return undefined
  }
}

function sourceTitle(source: AssistantSourceInput): string {
  if (source.kind === 'curl')
    return '识别到接口数据源'
  if (source.kind === 'http')
    return '识别到 HTTP 数据源'
  if (source.kind === 'json')
    return '识别到 JSON 数据源'
  if (source.kind === 'file')
    return source.fileName ? `识别到文件 ${source.fileName}` : '识别到文件数据源'
  return '无数据源'
}

function sourceDetail(source: AssistantSourceInput, sourceSample?: AssistantSourceSampleRecord): string {
  const sampleFields = sourceFields(sourceSample)
  if (sampleFields.length)
    return `字段：${sampleFields.slice(0, 8).join('、')}`
  if (source.kind === 'http')
    return maskUrl(source.url ?? '')
  if (source.kind === 'curl')
    return '请求头会在展示时脱敏，确认后参与生成。'
  if (source.kind === 'json')
    return summarizeJson(source.content)
  if (source.kind === 'file')
    return source.fileName ?? '文件内容将在生成时解析。'
  return '当前任务不使用外部数据源。'
}

function sourceFields(sourceSample: AssistantSourceSampleRecord | undefined): string[] {
  const descriptor = sourceSample?.descriptor
  if (!descriptor || typeof descriptor !== 'object' || !('fields' in descriptor) || !Array.isArray(descriptor.fields))
    return []
  return descriptor.fields
    .map((field) => {
      if (!field || typeof field !== 'object' || !('name' in field))
        return undefined
      return typeof field.name === 'string' ? field.name : undefined
    })
    .filter((field): field is string => !!field)
}

function summarizeJson(content: string | undefined): string {
  if (!content)
    return '等待 JSON 内容。'
  try {
    const value = JSON.parse(content) as unknown
    if (Array.isArray(value))
      return `数组样例，${value.length} 条记录。`
    if (value && typeof value === 'object')
      return `字段：${Object.keys(value).slice(0, 8).join('、') || '空对象'}`
  }
  catch {}
  return 'JSON 内容将在生成时解析。'
}

function maskUrl(url: string): string {
  return url.replace(/([?&](?:token|key|secret|authorization|access_token)=)[^&]+/gi, '$1******')
}

function dedupeMessages(messages: AssistantConversationMessage[]): AssistantConversationMessage[] {
  const seen = new Set<string>()
  return messages.filter((message) => {
    if (seen.has(message.id))
      return false
    seen.add(message.id)
    return true
  })
}
