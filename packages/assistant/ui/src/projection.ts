import type { AssistantResult, AssistantSourceInput } from '@easyink/assistant-capabilities'
import type { AssistantEventRecord } from '@easyink/assistant-store'
import type { AssistantTranslate } from './i18n'
import { translateAssistant } from './i18n'

export type ChecklistItemStatus = 'pending' | 'running' | 'done' | 'failed'

export interface ChecklistItem {
  id: string
  title: string
  status: ChecklistItemStatus
}

export interface AssistantNarration {
  answer: string
  summary: string[]
  clarification?: ClarificationQuestion[]
}

export interface ProjectChecklistInput {
  task?: { status: string }
  events?: AssistantEventRecord[]
  result?: AssistantResult
  error?: string
  t?: AssistantTranslate
}

const CHECKLIST_PHASES: { id: string, titleKey: string, steps: string[] }[] = [
  { id: 'understand', titleKey: 'designer.assistant.checklist.understand', steps: ['intake'] },
  { id: 'data', titleKey: 'designer.assistant.checklist.data', steps: ['source'] },
  { id: 'layout', titleKey: 'designer.assistant.checklist.layout', steps: ['plan', 'contract', 'layout'] },
  { id: 'compose', titleKey: 'designer.assistant.checklist.compose', steps: ['compose'] },
  { id: 'validate', titleKey: 'designer.assistant.checklist.validate', steps: ['validate', 'repair', 'review'] },
]

/**
 * Map the orchestrator's fine-grained workflow steps onto the five
 * user-facing checklist phases, each carrying a coarse lifecycle status.
 */
export function projectChecklist(input: ProjectChecklistInput): ChecklistItem[] {
  const events = input.events ?? []
  const stepState = new Map<string, 'running' | 'done'>()
  for (const record of events) {
    const event = record.event
    if (event.type === 'step.started')
      stepState.set(event.step, stepState.get(event.step) === 'done' ? 'done' : 'running')
    else if (event.type === 'step.completed')
      stepState.set(event.step, 'done')
  }

  const failed = input.task?.status === 'failed' || !!input.error
  const settled = input.task?.status === 'review' || input.task?.status === 'done' || !!input.result

  let reached = -1
  CHECKLIST_PHASES.forEach((phase, index) => {
    if (phase.steps.some(step => stepState.has(step)))
      reached = Math.max(reached, index)
  })

  return CHECKLIST_PHASES.map((phase, index) => {
    const seen = phase.steps.filter(step => stepState.has(step))
    const allDone = seen.length > 0 && seen.every(step => stepState.get(step) === 'done')
    const anyRunning = phase.steps.some(step => stepState.get(step) === 'running')
    let status: ChecklistItemStatus
    if (settled) {
      status = 'done'
    }
    else if (failed) {
      if (index < reached)
        status = 'done'
      else status = index === reached ? 'failed' : 'pending'
    }
    else if (index < reached) {
      status = 'done'
    }
    else if (index === reached) {
      status = allDone && !anyRunning ? 'done' : 'running'
    }
    else {
      status = 'pending'
    }
    return { id: phase.id, title: translateAssistant(phase.titleKey, input.t), status }
  })
}

/**
 * Collect the assistant's natural-language narration (streamed answer text),
 * its safe thinking summary, and any pending clarification questions.
 */
export function projectNarration(events: AssistantEventRecord[]): AssistantNarration {
  const answerLines: string[] = []
  let summary: string[] = []
  let clarification: ClarificationQuestion[] | undefined
  let answeredClarification = false

  for (const record of events) {
    const event = record.event
    if (event.type === 'thinking.delta') {
      answerLines.push(event.text)
    }
    else if (event.type === 'thinking.completed') {
      summary = event.summary
    }
    else if (event.type === 'clarification.required') {
      clarification = event.questions.map((question, index) => ({
        text: question,
        suggestions: event.suggestedAnswers?.[index] ?? [],
      }))
      answeredClarification = false
    }
    else if (event.type === 'clarification.answered') {
      answeredClarification = true
    }
  }

  return {
    answer: answerLines.join('\n'),
    summary,
    clarification: answeredClarification ? undefined : clarification,
  }
}

export interface ClarificationQuestion {
  text: string
  suggestions: string[]
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
