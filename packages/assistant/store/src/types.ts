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
  action: 'generated' | 'repaired' | 'before-apply' | 'applied' | 'rolled-back'
  label?: string
  snapshot: unknown
  createdAt: number
}

export interface AssistantProjectionSnapshotRecord {
  id: string
  taskId: string
  messages: unknown[]
  createdAt: number
}

export interface AssistantSourceSampleRecord {
  id: string
  taskId: string
  sourceKind: string
  descriptor?: unknown
  sample: unknown
  warnings: string[]
  createdAt: number
  expiresAt?: number
}

export type AssistantEvent
  = | { type: 'task.created', taskId: string }
    | { type: 'step.started', taskId: string, step: AssistantWorkflowStep }
    | { type: 'step.completed', taskId: string, step: AssistantWorkflowStep }
    | { type: 'thinking.started', taskId: string, title?: string }
    | { type: 'thinking.delta', taskId: string, text: string }
    | { type: 'thinking.completed', taskId: string, summary: string[] }
    | { type: 'tool.started', taskId: string, toolId: string, title: string }
    | { type: 'tool.completed', taskId: string, toolId: string, summary: string }
    | { type: 'tool.failed', taskId: string, toolId: string, error: string }
    | { type: 'message.created', taskId: string, message: string }
    | { type: 'clarification.required', taskId: string, questions: string[], suggestedAnswers?: string[][] }
    | { type: 'clarification.answered', taskId: string, answer: string }
    | { type: 'result.ready', taskId: string, resultId: string }
    | { type: 'task.failed', taskId: string, error: string }
    | { type: 'task.cancelled', taskId: string }
    | { type: 'task.applied', taskId: string, resultId: string }
    | { type: 'task.rolled-back', taskId: string, versionId: string }

export interface AssistantEventRecord {
  id: string
  taskId: string
  event: AssistantEvent
  createdAt: number
}

export interface AssistantSnapshot {
  schemaVersion: 1
  tasks: AssistantTaskRecord[]
  runs: AssistantRunRecord[]
  results: AssistantResult[]
  versions: AssistantVersionRecord[]
  events: AssistantEventRecord[]
  projectionSnapshots: AssistantProjectionSnapshotRecord[]
  sourceSamples: AssistantSourceSampleRecord[]
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
  listVersions: (taskId: string) => Promise<AssistantVersionRecord[]>
  saveProjectionSnapshot: (record: Omit<AssistantProjectionSnapshotRecord, 'id' | 'createdAt'>) => Promise<AssistantProjectionSnapshotRecord>
  getLatestProjectionSnapshot: (taskId: string) => Promise<AssistantProjectionSnapshotRecord | undefined>
  saveSourceSample: (record: Omit<AssistantSourceSampleRecord, 'id' | 'createdAt'>) => Promise<AssistantSourceSampleRecord>
  getSourceSample: (taskId: string) => Promise<AssistantSourceSampleRecord | undefined>
  appendEvent: (taskId: string, event: AssistantEvent) => Promise<AssistantEventRecord>
  listEvents: (taskId: string) => Promise<AssistantEventRecord[]>
  subscribe: (taskId: string, listener: (record: AssistantEventRecord) => void) => () => void
  importSnapshot: (snapshot: AssistantSnapshot) => Promise<void>
  exportSnapshot: () => Promise<AssistantSnapshot>
  cleanupExpired: (now?: number) => Promise<number>
}
