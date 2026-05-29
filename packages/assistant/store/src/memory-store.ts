import type {
  AssistantEvent,
  AssistantEventRecord,
  AssistantResult,
  AssistantRunRecord,
  AssistantSnapshot,
  AssistantStore,
  AssistantTaskInput,
  AssistantTaskRecord,
  AssistantVersionRecord,
} from './types'
import { createId } from './id'

export class MemoryAssistantStore implements AssistantStore {
  private readonly tasks = new Map<string, AssistantTaskRecord>()
  private readonly runs = new Map<string, AssistantRunRecord>()
  private readonly results = new Map<string, AssistantResult>()
  private readonly versions = new Map<string, AssistantVersionRecord>()
  private readonly events = new Map<string, AssistantEventRecord>()

  async createTask(input: AssistantTaskInput): Promise<AssistantTaskRecord> {
    const now = Date.now()
    const task: AssistantTaskRecord = {
      id: createId('task'),
      input,
      status: 'queued',
      step: 'idle',
      createdAt: now,
      updatedAt: now,
    }
    this.tasks.set(task.id, task)
    await this.appendEvent(task.id, { type: 'task.created', taskId: task.id })
    return clone(task)
  }

  async updateTask(task: AssistantTaskRecord): Promise<void> {
    this.tasks.set(task.id, clone({ ...task, updatedAt: Date.now() }))
  }

  async getTask(id: string): Promise<AssistantTaskRecord | undefined> {
    const task = this.tasks.get(id)
    return task ? clone(task) : undefined
  }

  async listTasks(): Promise<AssistantTaskRecord[]> {
    return [...this.tasks.values()].sort((a, b) => b.updatedAt - a.updatedAt).map(task => clone(task))
  }

  async createRun(taskId: string): Promise<AssistantRunRecord> {
    const run: AssistantRunRecord = {
      id: createId('run'),
      taskId,
      status: 'running',
      startedAt: Date.now(),
    }
    this.runs.set(run.id, run)
    return clone(run)
  }

  async updateRun(run: AssistantRunRecord): Promise<void> {
    this.runs.set(run.id, clone(run))
  }

  async saveResult(taskId: string, result: AssistantResult): Promise<void> {
    this.results.set(result.id, clone(result))
    await this.appendVersion({
      taskId,
      resultId: result.id,
      action: 'generated',
      snapshot: result,
    })
  }

  async getResult(id: string): Promise<AssistantResult | undefined> {
    const result = this.results.get(id)
    return result ? clone(result) : undefined
  }

  async appendVersion(record: Omit<AssistantVersionRecord, 'id' | 'createdAt'>): Promise<AssistantVersionRecord> {
    const version: AssistantVersionRecord = {
      ...record,
      id: createId('ver'),
      createdAt: Date.now(),
    }
    this.versions.set(version.id, clone(version))
    return clone(version)
  }

  async appendEvent(taskId: string, event: AssistantEvent): Promise<AssistantEventRecord> {
    const record: AssistantEventRecord = {
      id: createId('evt'),
      taskId,
      event,
      createdAt: Date.now(),
    }
    this.events.set(record.id, clone(record))
    return clone(record)
  }

  async listEvents(taskId: string): Promise<AssistantEventRecord[]> {
    return [...this.events.values()]
      .filter(record => record.taskId === taskId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(record => clone(record))
  }

  async exportSnapshot(): Promise<AssistantSnapshot> {
    return {
      tasks: [...this.tasks.values()].map(task => clone(task)),
      runs: [...this.runs.values()].map(run => clone(run)),
      results: [...this.results.values()].map(result => clone(result)),
      versions: [...this.versions.values()].map(version => clone(version)),
      events: [...this.events.values()].map(event => clone(event)),
    }
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}
