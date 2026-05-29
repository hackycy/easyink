import type {
  AssistantResult,
  AssistantTaskInput,
  AssistantWorkflowStep,
} from '@easyink/assistant-capabilities'

export type { AssistantResult, AssistantTaskInput } from '@easyink/assistant-capabilities'

export type AssistantTaskStatus = 'queued' | 'running' | 'waiting' | 'review' | 'done' | 'failed' | 'cancelled'

export interface AssistantTaskRecord {
  id: string
  input: AssistantTaskInput
  status: AssistantTaskStatus
  step: AssistantWorkflowStep
  resultId?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export interface AssistantRunRecord {
  id: string
  taskId: string
  status: AssistantTaskStatus
  startedAt: number
  finishedAt?: number
  error?: string
}

export interface AssistantVersionRecord {
  id: string
  taskId: string
  resultId?: string
  action: 'generated' | 'repaired' | 'applied' | 'rolled-back'
  snapshot: unknown
  createdAt: number
}

export type AssistantEvent
  = | { type: 'task.created', taskId: string }
    | { type: 'step.started', taskId: string, step: AssistantWorkflowStep }
    | { type: 'step.completed', taskId: string, step: AssistantWorkflowStep }
    | { type: 'clarification.required', taskId: string, questions: string[] }
    | { type: 'result.ready', taskId: string, resultId: string }
    | { type: 'task.failed', taskId: string, error: string }
    | { type: 'task.cancelled', taskId: string }
    | { type: 'task.applied', taskId: string, resultId: string }

export interface AssistantEventRecord {
  id: string
  taskId: string
  event: AssistantEvent
  createdAt: number
}

export interface AssistantSnapshot {
  tasks: AssistantTaskRecord[]
  runs: AssistantRunRecord[]
  results: AssistantResult[]
  versions: AssistantVersionRecord[]
  events: AssistantEventRecord[]
}

export interface AssistantStore {
  createTask: (input: AssistantTaskInput) => Promise<AssistantTaskRecord>
  updateTask: (task: AssistantTaskRecord) => Promise<void>
  getTask: (id: string) => Promise<AssistantTaskRecord | undefined>
  listTasks: () => Promise<AssistantTaskRecord[]>
  createRun: (taskId: string) => Promise<AssistantRunRecord>
  updateRun: (run: AssistantRunRecord) => Promise<void>
  saveResult: (taskId: string, result: AssistantResult) => Promise<void>
  getResult: (id: string) => Promise<AssistantResult | undefined>
  appendVersion: (record: Omit<AssistantVersionRecord, 'id' | 'createdAt'>) => Promise<AssistantVersionRecord>
  appendEvent: (taskId: string, event: AssistantEvent) => Promise<AssistantEventRecord>
  listEvents: (taskId: string) => Promise<AssistantEventRecord[]>
  exportSnapshot: () => Promise<AssistantSnapshot>
}
